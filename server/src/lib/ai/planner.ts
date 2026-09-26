import { Types } from 'mongoose';
import { z } from 'zod';
import {
  DIFFICULTIES,
  PLAN_DAYS,
  PLAN_TASK_KINDS,
  STATUSES,
  STRUGGLE_WINDOW_DAYS,
  parseLeetCodeInput,
  type PlanTask,
  type WeeklyPlan,
} from '@lct/shared';
import { Problem } from '../../models/Problem.js';
import { getLeetCodeProblems } from '../leetcode.js';
import { getActivityStats, getSummary, getTopicStats } from '../stats.js';
import { addDays, localDate, startOfNextLocalDay } from '../time.js';
import { ThinkingLevel, type Content, type FunctionCall, type ToolDeclaration } from './client.js';
import { AiOutputError, type AgentRun } from './run.js';

const MAX_TURNS = 8;

const SYSTEM = `You are a coach who plans a student's next 7 days of LeetCode practice.

First look at their data with the tools (overview, topics, due reviews, and problems as needed).
Then call submit_plan once with the finished plan. Every plan must be grounded in the data you retrieved.

Priorities:
1. Spaced-repetition reviews that are due or come due this week: schedule each on or after its due date, spread out, never more than 3 a day.
2. Weak topics: where they "needed help" in reviews, have unsolved problems, or have few mastered. Pick 1 to 3 focus topics.
3. A few new problems on the focus topics: well-known LeetCode problems, given by their exact URL slug (e.g. "two-sum"), not ones they already track.
Fit each day into their time budget (roughly: review 15 min, practice 20-30, new Easy 20, Medium 35, Hard 50). A light or rest day is fine.
Give every focus topic and task a one-sentence reason that cites their data, e.g. "You needed help twice on Two Pointers reviews".
Use task kinds: "review" for due reviews, "practice" for re-solving tracked problems, "new" for problems they haven't tracked.
For review and practice tasks, set problemId from the tools; for new tasks, set slug.`;

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: ToolDeclaration[] = [
  {
    name: 'get_overview',
    description: 'Counts by status and difficulty, reviews due, recent solving activity and streaks.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_topic_stats',
    description: `Per topic: problems unsolved, practising, mastered, and "needed help" reviews in the last ${STRUGGLE_WINDOW_DAYS} days.`,
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_due_reviews',
    description: 'Tracked problems with a review due in the next 7 days, soonest first, with their due dates.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_problems',
    description: 'Tracked problems, optionally filtered. Use to find practice candidates in a topic.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...STATUSES] },
        tag: { type: 'string', description: 'A topic, e.g. "Dynamic Programming"' },
        difficulty: { type: 'string', enum: [...DIFFICULTIES] },
      },
    },
  },
  {
    name: 'submit_plan',
    description: 'Submit the finished 7-day plan. Call exactly once, at the end.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '2-3 sentences: the idea of this week' },
        focusTopics: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: { topic: { type: 'string' }, why: { type: 'string' } },
            required: ['topic', 'why'],
          },
        },
        days: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          description: 'The next 7 days in order, starting today',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', enum: [...PLAN_DAYS] },
              minutes: { type: 'integer', description: 'Planned minutes for the day' },
              tasks: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: [...PLAN_TASK_KINDS] },
                    title: { type: 'string' },
                    problemId: { type: 'string', description: 'For review/practice: the id from the tools. Empty for new.' },
                    slug: { type: 'string', description: 'For new: the LeetCode URL slug. Empty otherwise.' },
                    why: { type: 'string' },
                  },
                  required: ['kind', 'title', 'problemId', 'slug', 'why'],
                },
              },
            },
            required: ['day', 'minutes', 'tasks'],
          },
        },
      },
      required: ['summary', 'focusTopics', 'days'],
    },
  },
];

const listArgs = z.object({
  status: z.enum(STATUSES).optional(),
  tag: z.string().max(40).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
});

const brief = (p: { _id: Types.ObjectId; title: string; difficulty: string; status: string; tags: string[] }) => ({
  id: p._id.toString(),
  title: p.title,
  difficulty: p.difficulty,
  status: p.status,
  tags: p.tags,
});

interface Context {
  user: Types.ObjectId;
  timeZone: string;
  now: Date;
}

/** Runs a data tool. The user always comes from the session, never from the model. */
async function runTool(call: FunctionCall, ctx: Context): Promise<unknown> {
  const { user, timeZone, now } = ctx;
  switch (call.name) {
    case 'get_overview': {
      const [summary, activity] = await Promise.all([getSummary(user, timeZone, now), getActivityStats(user, timeZone, now)]);
      const lastTwoWeeks = activity.days.slice(-14);
      return {
        ...summary,
        solvesLast14Days: lastTwoWeeks.reduce((n, d) => n + d.solves, 0),
        reviewsLast14Days: lastTwoWeeks.reduce((n, d) => n + d.reviews, 0),
        currentStreakDays: activity.currentStreak,
      };
    }
    case 'get_topic_stats':
      return (await getTopicStats(user, now)).slice(0, 30);
    case 'list_due_reviews': {
      const weekEnd = addDays(startOfNextLocalDay(now, timeZone), 6);
      const due = await Problem.find({ user, nextReviewAt: { $ne: null, $lt: weekEnd } })
        .sort({ nextReviewAt: 1 })
        .limit(30)
        .lean();
      return due.map((p) => ({ ...brief(p), due: localDate(p.nextReviewAt!, timeZone) }));
    }
    case 'list_problems': {
      const args = listArgs.safeParse(call.args);
      if (!args.success) return { error: 'Invalid filters' };
      const filter: Record<string, unknown> = { user };
      if (args.data.status) filter.status = args.data.status;
      if (args.data.difficulty) filter.difficulty = args.data.difficulty;
      if (args.data.tag) filter.tags = args.data.tag;
      return (await Problem.find(filter).sort({ updatedAt: -1 }).limit(30).lean()).map(brief);
    }
    default:
      return { error: `Unknown tool ${call.name}` };
  }
}

// ─── Checking the submitted plan ──────────────────────────────────────────────

const planSchema = z.object({
  summary: z.string().min(1).max(1_000),
  focusTopics: z.array(z.object({ topic: z.string().min(1).max(60), why: z.string().min(1).max(400) })).max(3),
  days: z
    .array(
      z.object({
        day: z.enum(PLAN_DAYS),
        minutes: z.number().int().min(0).max(600),
        tasks: z
          .array(
            z.object({
              kind: z.enum(PLAN_TASK_KINDS),
              title: z.string().min(1).max(200),
              problemId: z.string().max(40),
              slug: z.string().max(120),
              why: z.string().min(1).max(400),
            }),
          )
          .max(5),
      }),
    )
    .length(7),
});

type Checked = { ok: true; plan: WeeklyPlan } | { ok: false; error: string };

/**
 * Validates the plan against the user's data: tracked problems must be theirs, and new
 * problems must exist on LeetCode (invented ones are dropped). Days are put in order from today.
 */
async function checkPlan(args: unknown, ctx: Context): Promise<Checked> {
  const parsed = planSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: `Plan rejected: ${parsed.error.issues[0]?.message} at ${parsed.error.issues[0]?.path.join('.')}` };
  const plan = parsed.data;

  const weekday = new Date(`${localDate(ctx.now, ctx.timeZone)}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const order = PLAN_DAYS.map((_, i) => PLAN_DAYS[(((weekday + 6) % 7) + i) % 7]!);
  if (new Set(plan.days.map((d) => d.day)).size !== 7) return { ok: false, error: 'Plan rejected: each day of the week must appear once' };

  const tasks = plan.days.flatMap((d) => d.tasks);
  const ids = tasks.map((t) => t.problemId).filter((id) => Types.ObjectId.isValid(id));
  const owned = await Problem.find({ user: ctx.user, _id: { $in: ids } }).select('slug').lean();
  const ownedIds = new Set(owned.map((p) => p._id.toString()));
  const trackedBySlug = new Map(
    (await Problem.find({ user: ctx.user, slug: { $ne: null } }).select('slug').lean()).map((p) => [p.slug!, p._id.toString()]),
  );

  const slugs = tasks.filter((t) => t.kind === 'new').flatMap((t) => parseLeetCodeInput(t.slug) ?? []);
  let known: Map<string, { link: string; title: string } | null>;
  try {
    known = await getLeetCodeProblems(slugs);
  } catch {
    known = new Map(); // LeetCode unreachable: keep new tasks, without links
  }

  const checkTask = (t: (typeof tasks)[number]): PlanTask | null => {
    if (t.kind !== 'new') {
      return ownedIds.has(t.problemId) ? { kind: t.kind, title: t.title, problemId: t.problemId, link: null, why: t.why } : null;
    }
    const slug = parseLeetCodeInput(t.slug);
    if (!slug) return null;
    const tracked = trackedBySlug.get(slug);
    if (tracked) return { kind: 'practice', title: t.title, problemId: tracked, link: null, why: t.why };
    if (!known.has(slug)) return { kind: 'new', title: t.title, problemId: null, link: null, why: t.why }; // unverified
    const info = known.get(slug);
    return info ? { kind: 'new', title: info.title, problemId: null, link: info.link, why: t.why } : null; // null: doesn't exist
  };

  const byDay = new Map(plan.days.map((d) => [d.day, d]));
  return {
    ok: true,
    plan: {
      id: new Types.ObjectId().toString(),
      createdAt: ctx.now.toISOString(),
      summary: plan.summary,
      focusTopics: plan.focusTopics,
      days: order.map((day) => {
        const d = byDay.get(day)!;
        return { day, minutes: d.minutes, tasks: d.tasks.map(checkTask).filter((t): t is PlanTask => t !== null) };
      }),
    },
  };
}

// ─── The loop ─────────────────────────────────────────────────────────────────

export async function planWeek(run: AgentRun, ctx: Context, minutesPerDay: number): Promise<WeeklyPlan> {
  const today = localDate(ctx.now, ctx.timeZone);
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const contents: Content[] = [
    {
      role: 'user',
      parts: [{ text: `Plan my next 7 days, starting today (${weekday}, ${today}). I have about ${minutesPerDay} minutes a day.` }],
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await run.generate({
      system: SYSTEM,
      contents,
      tools: TOOLS,
      forceTools: true,
      temperature: 0.4,
      thinking: ThinkingLevel.MEDIUM,
    });
    // Sent back as-is: tool calls carry signatures the model needs on the next turn.
    contents.push(res.content);

    const responses = [];
    for (const call of res.functionCalls) {
      if (call.name === 'submit_plan') {
        const checked = await checkPlan(call.args, ctx);
        run.recordTool('submit_plan', { days: 7 }, checked.ok ? 'accepted' : checked.error);
        if (checked.ok) return checked.plan;
        responses.push({ functionResponse: { id: call.id, name: call.name, response: { error: checked.error } } });
        continue;
      }
      const result = await runTool(call, ctx);
      run.recordTool(call.name, call.args, result);
      responses.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
    }
    contents.push(
      responses.length > 0 ? { role: 'user', parts: responses } : { role: 'user', parts: [{ text: 'Call submit_plan with the finished plan.' }] },
    );
  }
  throw new AiOutputError(`The planner didn't finish within ${MAX_TURNS} steps`);
}
