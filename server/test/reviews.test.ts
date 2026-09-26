import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_INTERVALS_DAYS, type Problem as ProblemDTO } from '@lct/shared';
import { createApp } from '../src/app.js';
import { Problem } from '../src/models/Problem.js';
import { User } from '../src/models/User.js';
import { backfillReviewSchedules } from '../src/lib/migrations.js';
import { startOfNextLocalDay } from '../src/lib/time.js';
import { fakeLeetCode } from './fakeLeetCode.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });
const DAY = 86_400_000;

afterEach(() => vi.restoreAllMocks());

/** Days from now until an ISO date, rounded to the nearest tenth. */
const daysUntil = (iso: string | null) => Math.round(((Date.parse(iso!) - Date.now()) / DAY) * 10) / 10;

async function newProblem(alice: Awaited<ReturnType<typeof signUp>>, fields: object = {}) {
  const res = await alice.post('/api/problems', { title: 'Two Sum', difficulty: 'Easy', ...fields });
  return res.body as ProblemDTO;
}

describe('scheduling', () => {
  it('schedules the first review a day after a problem is solved', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice);
    expect(p.nextReviewAt).toBeNull();

    const solved = (await alice.patch(`/api/problems/${p.id}`, { status: 'Solved' })).body as ProblemDTO;
    expect(daysUntil(solved.nextReviewAt)).toBe(1);
    expect(solved.reviewStep).toBe(0);
  });

  it('schedules problems created as Solved, but not Todo or Mastered ones', async () => {
    const alice = await signUp(app);
    expect(daysUntil((await newProblem(alice, { title: 'A', status: 'Solved' })).nextReviewAt)).toBe(1);
    expect((await newProblem(alice, { title: 'B', status: 'Todo' })).nextReviewAt).toBeNull();
    const mastered = await newProblem(alice, { title: 'C', status: 'Mastered' });
    expect(mastered.nextReviewAt).toBeNull();
    expect(mastered.lastSolvedAt).not.toBeNull();
  });

  it('clears the schedule when a problem goes back to Todo', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { status: 'Solved' });
    const reset = (await alice.patch(`/api/problems/${p.id}`, { status: 'Todo' })).body as ProblemDTO;
    expect(reset.nextReviewAt).toBeNull();
    expect(reset.reviewStep).toBe(0);
  });

  it('makes a problem due now when marked Reviewing', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { status: 'Solved' });
    await alice.patch(`/api/problems/${p.id}`, { status: 'Reviewing' });
    expect((await alice.get('/api/problems?due=true')).body.total).toBe(1);
  });

  it('keeps the schedule when other fields change', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { status: 'Solved' });
    const edited = (await alice.patch(`/api/problems/${p.id}`, { notes: 'x', status: 'Solved' })).body as ProblemDTO;
    expect(edited.nextReviewAt).toBe(p.nextReviewAt);
  });
});

describe('reviews', () => {
  it('walks through every interval and then marks the problem Mastered', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { status: 'Solved' });

    for (let step = 1; step < REVIEW_INTERVALS_DAYS.length; step++) {
      const res = await alice.post(`/api/problems/${p.id}/review`, { outcome: 'remembered' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'Reviewing', reviewStep: step });
      expect(daysUntil(res.body.nextReviewAt)).toBe(REVIEW_INTERVALS_DAYS[step]);
    }

    const last = await alice.post(`/api/problems/${p.id}/review`, { outcome: 'remembered' });
    expect(last.body).toMatchObject({ status: 'Mastered', nextReviewAt: null });
    expect(last.body.lastReviewedAt).not.toBeNull();
  });

  it('starts over after needing help', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { status: 'Solved' });
    await alice.post(`/api/problems/${p.id}/review`, { outcome: 'remembered' });
    await alice.post(`/api/problems/${p.id}/review`, { outcome: 'remembered' });

    const res = await alice.post(`/api/problems/${p.id}/review`, { outcome: 'forgot' });
    expect(res.body).toMatchObject({ status: 'Reviewing', reviewStep: 0 });
    expect(daysUntil(res.body.nextReviewAt)).toBe(1);
  });

  it('rejects reviews of unscheduled problems, bad outcomes and other users’ problems', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    const todo = await newProblem(alice, { title: 'Todo' });
    const solved = await newProblem(alice, { title: 'Solved', status: 'Solved' });

    expect((await alice.post(`/api/problems/${todo.id}/review`, { outcome: 'remembered' })).status).toBe(400);
    expect((await alice.post(`/api/problems/${solved.id}/review`, { outcome: 'meh' })).status).toBe(400);
    expect((await bob.post(`/api/problems/${solved.id}/review`, { outcome: 'remembered' })).status).toBe(404);
  });
});

describe('due list', () => {
  it('includes reviews due by the end of the user’s day, most overdue first', async () => {
    const alice = await signUp(app);
    const tz = 'Asia/Kolkata';
    const endOfToday = startOfNextLocalDay(new Date(), tz);
    const due = async (title: string, at: Date) => {
      const p = await newProblem(alice, { title, status: 'Solved' });
      await Problem.updateOne({ _id: p.id }, { nextReviewAt: at });
    };
    await due('Later today', new Date(endOfToday.getTime() - 60_000));
    await due('Overdue', new Date(Date.now() - 2 * DAY));
    await due('Tomorrow', new Date(endOfToday.getTime() + 60_000));
    await newProblem(alice, { title: 'Unsolved' });

    const res = await alice.get('/api/problems?due=true&sort=title').set('X-Timezone', tz);
    expect(res.body.problems.map((p: ProblemDTO) => p.title)).toEqual(['Overdue', 'Later today']);
  });

  it('uses UTC when the time zone is missing or invalid', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { status: 'Solved' });
    const endOfUtcDay = startOfNextLocalDay(new Date(), 'UTC');
    await Problem.updateOne({ _id: p.id }, { nextReviewAt: new Date(endOfUtcDay.getTime() - 60_000) });
    expect((await alice.get('/api/problems?due=true').set('X-Timezone', 'Nowhere/Land')).body.total).toBe(1);
  });
});

describe('GET /api/stats/summary', () => {
  it('summarizes the user’s problems', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    await newProblem(alice, { title: 'A', difficulty: 'Easy', status: 'Solved' });
    await newProblem(alice, { title: 'B', difficulty: 'Medium', status: 'Todo' });
    await newProblem(alice, { title: 'C', difficulty: 'Medium', status: 'Mastered' });
    const due = await newProblem(alice, { title: 'D', difficulty: 'Hard', status: 'Solved' });
    await Problem.updateOne({ _id: due.id }, { nextReviewAt: new Date(Date.now() - DAY) });
    await newProblem(bob, { title: 'Bob', status: 'Solved' });

    const { body } = await alice.get('/api/stats/summary');
    expect(body).toEqual({
      total: 4,
      byStatus: { Todo: 1, Attempted: 0, Solved: 2, Reviewing: 0, Mastered: 1 },
      byDifficulty: {
        Easy: { total: 1, solved: 1 },
        Medium: { total: 2, solved: 1 },
        Hard: { total: 1, solved: 1 },
      },
      dueNow: 1,
      dueThisWeek: 2, // D (overdue) and A (tomorrow); Todo and Mastered have no reviews
      solvedThisWeek: 3,
    });
  });
});

describe('with LeetCode sync', () => {
  it('schedules imports from their LeetCode solve date', async () => {
    fakeLeetCode({ users: { codefan: [{ slug: 'two-sum', daysAgo: 3 }] } });
    const alice = await signUp(app);
    await alice.put('/api/leetcode/account', { username: 'codefan' });
    await alice.post('/api/leetcode/sync', {});

    const [p] = (await alice.get('/api/problems')).body.problems as ProblemDTO[];
    expect(daysUntil(p!.nextReviewAt)).toBe(-2); // solved 3 days ago, so due since yesterday
    expect((await alice.get('/api/problems?due=true')).body.total).toBe(1);
  });

  it('counts re-solving a due problem on LeetCode as a successful review', async () => {
    const solves = [{ slug: 'two-sum', daysAgo: 5 }];
    fakeLeetCode({ users: { codefan: solves } });
    const alice = await signUp(app);
    await alice.put('/api/leetcode/account', { username: 'codefan' });
    await alice.post('/api/leetcode/sync', {});

    solves.unshift({ slug: 'two-sum', daysAgo: 0 }); // solved it again today
    await User.updateMany({}, { $set: { 'leetcode.lastSyncAttemptAt': null } });
    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.body.result).toMatchObject({ updated: 1 });

    const [p] = (await alice.get('/api/problems')).body.problems as ProblemDTO[];
    expect(p).toMatchObject({ status: 'Reviewing', reviewStep: 1 });
    expect(daysUntil(p!.nextReviewAt)).toBe(REVIEW_INTERVALS_DAYS[1]);
  });
});

describe('backfilling schedules', () => {
  it('schedules solved problems saved before reviews existed, once', async () => {
    const alice = await signUp(app);
    const solvedAt = new Date('2026-09-01T10:00:00Z');
    const base = { user: alice.user.id, difficulty: 'Easy', tags: [], companyTags: [], createdAt: solvedAt, updatedAt: solvedAt };
    const { Types } = await import('mongoose');
    await Problem.collection.insertMany([
      { ...base, user: new Types.ObjectId(alice.user.id), title: 'Old solved', status: 'Solved', lastSolvedAt: solvedAt },
      { ...base, user: new Types.ObjectId(alice.user.id), title: 'Old todo', status: 'Todo' },
    ]);

    expect(await backfillReviewSchedules()).toBe(1);
    expect(await backfillReviewSchedules()).toBe(0);

    const solved = await Problem.findOne({ title: 'Old solved' });
    expect(solved!.nextReviewAt!.toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(solved!.updatedAt.toISOString()).toBe(solvedAt.toISOString());
    expect((await Problem.findOne({ title: 'Old todo' }))!.nextReviewAt).toBeNull();
  });
});
