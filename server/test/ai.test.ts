import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_DAILY_LIMITS, type Problem as ProblemDTO, type WeeklyPlan } from '@lct/shared';
import { createApp } from '../src/app.js';
import { AgentLog } from '../src/models/AgentLog.js';
import { AiNotConfiguredError, AiUnavailableError } from '../src/lib/ai/client.js';
import { claimUse } from '../src/lib/ai/usage.js';
import { localDate } from '../src/lib/time.js';
import { fakeAi } from './fakeAi.js';
import { fakeLeetCode } from './fakeLeetCode.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000, aiBurstLimit: 1000 });

afterEach(() => vi.restoreAllMocks());

type User = Awaited<ReturnType<typeof signUp>>;

const newProblem = async (u: User, fields: object = {}) =>
  (
    await u.post('/api/problems', {
      title: 'Two Sum',
      difficulty: 'Easy',
      tags: ['Array', 'Hash Table'],
      code: 'def two_sum(nums, target):\n    ...',
      ...fields,
    })
  ).body as ProblemDTO;

const analysis = {
  timeComplexity: 'O(n): one pass',
  spaceComplexity: 'O(n): the hash map',
  isOptimal: true,
  assessment: 'Clean single pass.',
  betterApproach: '',
  edgeCases: ['Duplicates: [3,3]'],
  keyTakeaway: 'Trade space for time with a hash map.',
};

describe('usage', () => {
  it('starts at zero for every agent', async () => {
    const alice = await signUp(app);
    const { body } = await alice.get('/api/ai/usage');
    expect(body.map((u: { agent: string; used: number }) => [u.agent, u.used])).toEqual([
      ['post-mortem', 0],
      ['tutor', 0],
      ['planner', 0],
    ]);
  });
});

describe('post-mortem', () => {
  it('analyzes the saved code and stores the result on the problem', async () => {
    const { requests } = fakeAi({ json: analysis });
    const alice = await signUp(app);
    const p = await newProblem(alice);

    const res = await alice.post(`/api/ai/post-mortem/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.problem.postMortem).toMatchObject({ ...analysis, betterApproach: null, current: true });
    expect(res.body.usage).toMatchObject({ agent: 'post-mortem', used: 1, limit: AGENT_DAILY_LIMITS['post-mortem'] });

    // The student's material is fenced off from instructions.
    const prompt = JSON.stringify(requests[0]!.contents);
    expect(prompt).toContain('<code>');
    expect(prompt).toContain('def two_sum');
    expect(requests[0]!.jsonSchema).toBeDefined();

    expect((await alice.get(`/api/problems/${p.id}`)).body.postMortem.timeComplexity).toBe('O(n): one pass');
  });

  it('marks the analysis out of date once the code changes', async () => {
    fakeAi({ json: analysis });
    const alice = await signUp(app);
    const p = await newProblem(alice);
    await alice.post(`/api/ai/post-mortem/${p.id}`);

    await alice.patch(`/api/problems/${p.id}`, { notes: 'unrelated edit' });
    expect((await alice.get(`/api/problems/${p.id}`)).body.postMortem.current).toBe(true);
    await alice.patch(`/api/problems/${p.id}`, { code: 'def two_sum(nums, target): return []' });
    expect((await alice.get(`/api/problems/${p.id}`)).body.postMortem.current).toBe(false);
  });

  it('needs code, and only works on your own problems', async () => {
    const ai = fakeAi();
    const alice = await signUp(app);
    const bob = await signUp(app);
    const noCode = await newProblem(alice, { title: 'No code', code: '' });
    const withCode = await newProblem(alice, { title: 'Code' });

    expect((await alice.post(`/api/ai/post-mortem/${noCode.id}`)).status).toBe(400);
    expect((await bob.post(`/api/ai/post-mortem/${withCode.id}`)).status).toBe(404);
    expect(ai.spy).not.toHaveBeenCalled();
  });

  it('rejects a malformed answer, gives the use back, and logs the error', async () => {
    fakeAi({ json: { timeComplexity: 'O(n)' } });
    const alice = await signUp(app);
    const p = await newProblem(alice);

    const res = await alice.post(`/api/ai/post-mortem/${p.id}`);
    expect(res.status).toBe(502);
    expect((await alice.get('/api/ai/usage')).body[0].used).toBe(0);
    const [log] = await AgentLog.find({ user: alice.user.id }).lean();
    expect(log).toMatchObject({ agent: 'post-mortem', status: 'error' });
    expect(log!.error).toMatch(/wrong shape/);
  });

  it('explains when Gemini is busy or not set up', async () => {
    fakeAi(new AiUnavailableError(), new AiNotConfiguredError());
    const alice = await signUp(app);
    const p = await newProblem(alice);

    const busy = await alice.post(`/api/ai/post-mortem/${p.id}`);
    expect(busy.status).toBe(502);
    expect(busy.body.message).toMatch(/busy/);
    expect((await alice.post(`/api/ai/post-mortem/${p.id}`)).status).toBe(503);
  });
});

describe('daily limits', () => {
  it('stops at the limit with a clear message', async () => {
    const ai = fakeAi();
    const alice = await signUp(app);
    const p = await newProblem(alice);
    for (let i = 0; i < AGENT_DAILY_LIMITS['post-mortem']; i++) await claimUse(alice.user.id as never, 'post-mortem');

    const res = await alice.post(`/api/ai/post-mortem/${p.id}`);
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/used all 20 solution post-mortem runs for today/);
    expect(ai.spy).not.toHaveBeenCalled();
  });

  it('never lets simultaneous requests go over the limit', async () => {
    const alice = await signUp(app);
    const { Types } = await import('mongoose');
    const user = new Types.ObjectId(alice.user.id);
    const limit = AGENT_DAILY_LIMITS.planner;
    const results = await Promise.allSettled(Array.from({ length: limit + 5 }, () => claimUse(user, 'planner')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(limit);
  });

  it('counts each user separately', async () => {
    fakeAi('Hint for Bob');
    const alice = await signUp(app);
    const bob = await signUp(app);
    for (let i = 0; i < AGENT_DAILY_LIMITS.tutor; i++) await claimUse(alice.user.id as never, 'tutor');
    const p = await newProblem(bob);
    const res = await bob.post(`/api/ai/tutor/${p.id}`, { messages: [{ role: 'user', text: 'Help?' }] });
    expect(res.status).toBe(200);
  });
});

describe('tutor', () => {
  it('continues the conversation with the problem as context', async () => {
    const { requests } = fakeAi('What have you tried so far?');
    const alice = await signUp(app);
    const p = await newProblem(alice, { notes: 'maybe sort first?' });

    const res = await alice.post(`/api/ai/tutor/${p.id}`, {
      messages: [
        { role: 'user', text: 'I am stuck' },
        { role: 'tutor', text: 'What do you notice about the input?' },
        { role: 'user', text: 'It is unsorted' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('What have you tried so far?');

    const req = requests[0]!;
    expect(req.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(req.system).toContain('Two Sum');
    expect(req.system).toContain('maybe sort first?');
    expect(req.system).toContain('def two_sum');
  });

  it('leaves the code out when asked', async () => {
    const { requests } = fakeAi('Okay.');
    const alice = await signUp(app);
    const p = await newProblem(alice);
    await alice.post(`/api/ai/tutor/${p.id}`, { messages: [{ role: 'user', text: 'Hi' }], includeCode: false });
    expect(requests[0]!.system).not.toContain('def two_sum');
  });

  it('validates the conversation', async () => {
    const ai = fakeAi();
    const alice = await signUp(app);
    const p = await newProblem(alice);
    const post = (messages: object[]) => alice.post(`/api/ai/tutor/${p.id}`, { messages });

    expect((await post([])).status).toBe(400);
    expect((await post([{ role: 'tutor', text: 'hi' }])).status).toBe(400); // must end with the student
    expect((await post(Array.from({ length: 31 }, () => ({ role: 'user', text: 'x' })))).status).toBe(400);
    expect((await post([{ role: 'user', text: 'x'.repeat(2_001) }])).status).toBe(400);
    expect(ai.spy).not.toHaveBeenCalled();
  });

  it('logs the student’s message and the reply', async () => {
    fakeAi('Think about complements.');
    const alice = await signUp(app);
    const p = await newProblem(alice);
    await alice.post(`/api/ai/tutor/${p.id}`, { messages: [{ role: 'user', text: 'Any hint?' }] });
    const [log] = await AgentLog.find({ user: alice.user.id }).lean();
    expect(log).toMatchObject({
      agent: 'tutor',
      status: 'ok',
      input: { problem: 'Two Sum', message: 'Any hint?' },
      output: 'Think about complements.',
      model: 'fake-model',
      inputTokens: 100,
    });
  });
});

describe('weekly planner', () => {
  function planArgs(tasksToday: object[], days = 7) {
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return {
      summary: 'Clear reviews, then two pointers.',
      focusTopics: [{ topic: 'Array', why: 'Most of your problems' }],
      days: names.slice(0, days).map((day, i) => ({ day, minutes: 45, tasks: i === 0 ? tasksToday : [] })),
    };
  }
  const task = (kind: string, fields: object) => ({ kind, title: 'T', problemId: '', slug: '', why: 'Because', ...fields });

  it('gathers data with tools, then checks and saves the plan', async () => {
    fakeLeetCode(); // knows two-sum, lru-cache, 3sum, trapping-rain-water
    const alice = await signUp(app);
    const bob = await signUp(app);
    const mine = await newProblem(alice, { title: 'Mine', status: 'Solved' });
    const tracked = await newProblem(alice, { title: 'LRU', link: 'https://leetcode.com/problems/lru-cache/' });
    const bobs = await newProblem(bob, { title: 'Bob’s' });

    const { requests } = fakeAi(
      { calls: [{ id: 'c1', name: 'get_overview', args: {} }, { id: 'c2', name: 'list_due_reviews', args: {} }] },
      {
        calls: [
          {
            id: 'c3',
            name: 'submit_plan',
            args: planArgs([
              task('review', { problemId: mine.id }),
              task('review', { problemId: bobs.id }), // not hers: dropped
              task('new', { slug: '3sum' }), // verified
              task('new', { slug: 'made-up-problem' }), // doesn't exist: dropped
              task('new', { slug: 'lru-cache' }), // already tracked: becomes practice
            ]),
          },
        ],
      },
    );

    const res = await alice.post('/api/ai/weekly-plan', { minutesPerDay: 45 });
    expect(res.status).toBe(200);
    const plan = res.body.plan as WeeklyPlan;

    // Days start today, in order.
    const today = new Date(`${localDate(new Date(), 'UTC')}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    expect(plan.days[0]!.day).toBe(today);
    expect(plan.days).toHaveLength(7);

    const all = plan.days.flatMap((d) => d.tasks);
    expect(all).toEqual([
      { kind: 'review', title: 'T', problemId: mine.id, link: null, why: 'Because' },
      { kind: 'new', title: '3Sum', problemId: null, link: 'https://leetcode.com/problems/3sum/', why: 'Because' },
      { kind: 'practice', title: 'T', problemId: tracked.id, link: null, why: 'Because' },
    ]);

    // Tool results went back to the model, scoped to Alice.
    const toolResults = JSON.stringify(requests[1]!.contents.at(-1));
    expect(toolResults).toContain('"total":2');
    expect(toolResults).toContain(mine.id);
    expect(toolResults).not.toContain(bobs.id);
    expect(requests[0]!.forceTools).toBe(true);

    expect((await alice.get('/api/ai/weekly-plan/latest')).body.plan.id).toBe(plan.id);
    expect((await bob.get('/api/ai/weekly-plan/latest')).body.plan).toBeNull();

    const [log] = await AgentLog.find({ user: alice.user.id, agent: 'planner' }).lean();
    expect(log!.toolCalls.map((t) => t.name)).toEqual(['get_overview', 'list_due_reviews', 'submit_plan']);
  });

  it('sends a rejected plan back to the model to fix', async () => {
    const alice = await signUp(app);
    const { requests } = fakeAi(
      { calls: [{ id: 'c1', name: 'submit_plan', args: planArgs([], 6) }] },
      { calls: [{ id: 'c2', name: 'submit_plan', args: planArgs([]) }] },
    );
    const res = await alice.post('/api/ai/weekly-plan', {});
    expect(res.status).toBe(200);
    expect(JSON.stringify(requests[1]!.contents.at(-1))).toMatch(/Plan rejected/);
  });

  it('gives up if the model never submits a plan', async () => {
    const alice = await signUp(app);
    fakeAi(...Array.from({ length: 8 }, () => ({ calls: [{ id: 'x', name: 'get_overview', args: {} }] })));
    const res = await alice.post('/api/ai/weekly-plan', {});
    expect(res.status).toBe(502);
    expect((await alice.get('/api/ai/usage')).body[2].used).toBe(0); // refunded
  });

  it('validates the time budget', async () => {
    const alice = await signUp(app);
    expect((await alice.post('/api/ai/weekly-plan', { minutesPerDay: 5 })).status).toBe(400);
  });
});
