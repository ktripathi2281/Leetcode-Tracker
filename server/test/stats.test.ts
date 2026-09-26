import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { ACTIVITY_WEEKS, type ActivityStats, type Problem as ProblemDTO } from '@lct/shared';
import { createApp } from '../src/app.js';
import { Activity } from '../src/models/Activity.js';
import { Problem } from '../src/models/Problem.js';
import { backfillActivity, runMigrations } from '../src/lib/migrations.js';
import { addCalendarDays, daysSinceMonday, localDate } from '../src/lib/time.js';
import { fakeLeetCode } from './fakeLeetCode.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });
const TZ = 'Asia/Kolkata';

afterEach(() => vi.restoreAllMocks());

type User = Awaited<ReturnType<typeof signUp>>;

const newProblem = async (u: User, fields: object = {}) =>
  (await u.post('/api/problems', { title: 'Two Sum', difficulty: 'Easy', tags: ['Array'], ...fields })).body as ProblemDTO;

const kinds = async (u: User) =>
  (await Activity.find({ user: u.user.id }).sort('at').lean()).map((a) => (a.outcome ? `${a.kind}:${a.outcome}` : a.kind));

/** An activity entry at a local time (in Kolkata) on a calendar date. */
async function logAt(u: User, date: string, time = '12:00', kind: 'solve' | 'review' = 'solve') {
  await Activity.create({
    user: u.user.id,
    problem: new Types.ObjectId(),
    kind,
    outcome: kind === 'review' ? 'remembered' : null,
    difficulty: 'Easy',
    tags: [],
    at: new Date(`${date}T${time}:00+05:30`),
  });
}

describe('activity log', () => {
  it('records solves from creating, marking solved and reviewing', async () => {
    const alice = await signUp(app);
    await newProblem(alice, { title: 'A', status: 'Solved' });
    const b = await newProblem(alice, { title: 'B' });
    await alice.patch(`/api/problems/${b.id}`, { status: 'Solved' });
    await alice.patch(`/api/problems/${b.id}`, { status: 'Mastered' }); // not a new solve
    const c = await newProblem(alice, { title: 'C', status: 'Solved' });
    await alice.post(`/api/problems/${c.id}/review`, { outcome: 'forgot' });
    await alice.post(`/api/problems/${c.id}/review`, { outcome: 'remembered' });

    expect(await kinds(alice)).toEqual(['solve', 'solve', 'solve', 'review:forgot', 'review:remembered']);
  });

  it('copies difficulty and tags, and forgets a deleted problem', async () => {
    const alice = await signUp(app);
    const p = await newProblem(alice, { difficulty: 'Hard', tags: ['Graph', 'BFS'], status: 'Solved' });
    const [entry] = await Activity.find({ user: alice.user.id }).lean();
    expect(entry).toMatchObject({ difficulty: 'Hard', tags: ['Graph', 'BFS'] });

    await alice.delete(`/api/problems/${p.id}`);
    expect(await Activity.countDocuments({ user: alice.user.id })).toBe(0);
  });

  it('records LeetCode imports at their solve time', async () => {
    fakeLeetCode({ users: { codefan: [{ slug: 'two-sum', daysAgo: 4 }] } });
    const alice = await signUp(app);
    await alice.put('/api/leetcode/account', { username: 'codefan' });
    await alice.post('/api/leetcode/sync', {});

    const [entry] = await Activity.find({ user: alice.user.id }).lean();
    expect(entry!.kind).toBe('solve');
    expect(Math.round((Date.now() - entry!.at.getTime()) / 86_400_000)).toBe(4);
  });
});

describe('GET /api/stats/activity', () => {
  const get = async (u: User, tz = TZ) =>
    (await u.get('/api/stats/activity').set('X-Timezone', tz)).body as ActivityStats;

  it('covers whole weeks, Monday to today, in the user’s calendar', async () => {
    const alice = await signUp(app);
    const { days } = await get(alice);
    const today = localDate(new Date(), TZ);
    expect(days).toHaveLength((ACTIVITY_WEEKS - 1) * 7 + daysSinceMonday(today) + 1);
    expect(daysSinceMonday(days[0]!.date)).toBe(0);
    expect(days.at(-1)!.date).toBe(today);
  });

  it('counts solves and reviews on the user’s local date', async () => {
    const alice = await signUp(app);
    const today = localDate(new Date(), TZ);
    const yesterday = addCalendarDays(today, -1);
    // 01:00 in India is still the previous evening in UTC.
    await logAt(alice, yesterday, '01:00');
    await logAt(alice, yesterday, '15:00', 'review');

    const inIndia = (await get(alice)).days.find((d) => d.date === yesterday);
    expect(inIndia).toEqual({ date: yesterday, solves: 1, reviews: 1 });

    const inUtc = (await get(alice, 'UTC')).days.find((d) => d.date === addCalendarDays(yesterday, -1));
    expect(inUtc).toMatchObject({ solves: 1 });
  });

  it('computes current and longest streaks', async () => {
    const alice = await signUp(app);
    const today = localDate(new Date(), TZ);
    for (const offset of [1, 2, 3]) await logAt(alice, addCalendarDays(today, -offset)); // today still empty
    for (const offset of [20, 21, 22, 23, 24]) await logAt(alice, addCalendarDays(today, -offset));

    const stats = await get(alice);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(5);
  });

  it('breaks the current streak after a missed day', async () => {
    const alice = await signUp(app);
    const today = localDate(new Date(), TZ);
    await logAt(alice, addCalendarDays(today, -2));
    expect((await get(alice)).currentStreak).toBe(0);
  });

  it('only includes the user’s own activity', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    await logAt(bob, localDate(new Date(), TZ));
    const days = (await get(alice)).days;
    expect(days.reduce((n, d) => n + d.solves + d.reviews, 0)).toBe(0);
  });
});

describe('GET /api/stats/topics', () => {
  it('counts problems per topic by stage, with recent struggles', async () => {
    const alice = await signUp(app);
    await newProblem(alice, { title: 'A', tags: ['Array', 'Hash Table'], status: 'Todo' });
    await newProblem(alice, { title: 'B', tags: ['Array'], status: 'Mastered' });
    const c = await newProblem(alice, { title: 'C', tags: ['Array', 'Two Pointers'], status: 'Solved' });
    await alice.post(`/api/problems/${c.id}/review`, { outcome: 'forgot' });
    await alice.post(`/api/problems/${c.id}/review`, { outcome: 'forgot' });

    const { body } = await alice.get('/api/stats/topics');
    expect(body).toEqual([
      { topic: 'Array', total: 3, unsolved: 1, practicing: 1, mastered: 1, neededHelp: 2 },
      { topic: 'Hash Table', total: 1, unsolved: 1, practicing: 0, mastered: 0, neededHelp: 0 },
      { topic: 'Two Pointers', total: 1, unsolved: 0, practicing: 1, mastered: 0, neededHelp: 2 },
    ]);
  });
});

describe('GET /api/stats/companies', () => {
  it('counts solved problems per company', async () => {
    const alice = await signUp(app);
    await newProblem(alice, { title: 'A', companyTags: ['Google', 'Meta'], status: 'Solved' });
    await newProblem(alice, { title: 'B', companyTags: ['Google'] });
    const { body } = await alice.get('/api/stats/companies');
    expect(body).toEqual([
      { company: 'Google', total: 2, solved: 1 },
      { company: 'Meta', total: 1, solved: 1 },
    ]);
  });
});

describe('rebuilding history for older data', () => {
  it('creates entries from each problem’s last solve and review, once', async () => {
    const alice = await signUp(app);
    const user = new Types.ObjectId(alice.user.id);
    const t = (day: number) => new Date(Date.UTC(2026, 8, day, 10));
    const base = { user, difficulty: 'Easy', tags: ['Array'], companyTags: [], status: 'Reviewing' };
    await Problem.collection.insertMany([
      { ...base, title: 'Only solved', lastSolvedAt: t(1) },
      { ...base, title: 'Reviewed ok', lastSolvedAt: t(5), lastReviewedAt: t(5) },
      { ...base, title: 'Needed help', lastSolvedAt: t(2), lastReviewedAt: t(9) },
      { ...base, title: 'Never solved', status: 'Todo', lastSolvedAt: null },
    ]);

    expect(await backfillActivity()).toBe(4);
    expect(await backfillActivity()).toBe(0);
    expect(await kinds(alice)).toEqual(['solve', 'solve', 'review:remembered', 'review:forgot']);
  });

  it('runs each migration only once', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runMigrations();
    await runMigrations();
    expect(log.mock.calls.filter(([m]) => String(m).startsWith('Migration')).length).toBe(2);
  });
});
