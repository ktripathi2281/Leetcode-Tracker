import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Problem } from '@lct/shared';
import { createApp } from '../src/app.js';
import { LeetCodeProblem } from '../src/models/LeetCodeProblem.js';
import { fakeLeetCode } from './fakeLeetCode.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });

afterEach(() => vi.restoreAllMocks());

describe('GET /api/leetcode/problems/:slug', () => {
  it('returns problem details from LeetCode', async () => {
    const lc = fakeLeetCode();
    const alice = await signUp(app);
    const res = await alice.get('/api/leetcode/problems/two-sum');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      slug: 'two-sum',
      leetcodeNumber: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      tags: ['Array', 'Hash Table'],
      isPaidOnly: false,
      link: 'https://leetcode.com/problems/two-sum/',
    });
    expect(lc.count('question(')).toBe(1);
  });

  it('accepts a full problem URL', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const url = encodeURIComponent('https://leetcode.com/problems/two-sum/description/');
    expect((await alice.get(`/api/leetcode/problems/${url}`)).body.title).toBe('Two Sum');
  });

  it('caches results so LeetCode is asked only once across users', async () => {
    const lc = fakeLeetCode();
    const alice = await signUp(app);
    const bob = await signUp(app);
    await alice.get('/api/leetcode/problems/two-sum');
    const res = await bob.get('/api/leetcode/problems/two-sum');
    expect(res.body.title).toBe('Two Sum');
    expect(lc.count('question(')).toBe(1);
    expect(await LeetCodeProblem.countDocuments()).toBe(1);
  });

  it('returns 404 for a problem LeetCode does not have, without caching it', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const res = await alice.get('/api/leetcode/problems/not-a-problem');
    expect(res.status).toBe(404);
    expect(await LeetCodeProblem.countDocuments()).toBe(0);
  });

  it('returns 502 when LeetCode is down or its response has changed', async () => {
    const alice = await signUp(app);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(502);

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ data: { q0: { title: 'Two Sum' } } })));
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(502);

    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(502);
  });

  it('rejects links that are not LeetCode problems', async () => {
    const lc = fakeLeetCode();
    const alice = await signUp(app);
    const url = encodeURIComponent('https://example.com/problems/two-sum');
    expect((await alice.get(`/api/leetcode/problems/${url}`)).status).toBe(400);
    expect(lc.spy).not.toHaveBeenCalled();
  });

  it('limits lookups per user', async () => {
    fakeLeetCode();
    const limited = createApp({ authRateLimit: 1000, leetCodeLookupLimit: 2 });
    const alice = await signUp(limited);
    await alice.get('/api/leetcode/problems/two-sum');
    await alice.get('/api/leetcode/problems/two-sum');
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(429);
  });
});

describe('connecting a LeetCode account', () => {
  it('starts disconnected', async () => {
    const alice = await signUp(app);
    expect((await alice.get('/api/leetcode/account')).body).toEqual({
      username: null,
      lastSyncedAt: null,
      lastResult: null,
    });
  });

  it('saves the username with LeetCode’s exact spelling', async () => {
    fakeLeetCode({ users: { CodeFan: [] } });
    const alice = await signUp(app);
    const res = await alice.put('/api/leetcode/account', { username: ' codefan ' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('CodeFan');
    expect((await alice.get('/api/leetcode/account')).body.username).toBe('CodeFan');
  });

  it('rejects a username LeetCode does not know', async () => {
    fakeLeetCode({ users: {} });
    const alice = await signUp(app);
    const res = await alice.put('/api/leetcode/account', { username: 'ghost' });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No LeetCode user named "ghost"');
  });

  it('rejects malformed usernames without asking LeetCode', async () => {
    const lc = fakeLeetCode();
    const alice = await signUp(app);
    expect((await alice.put('/api/leetcode/account', { username: 'bad name!' })).status).toBe(400);
    expect(lc.spy).not.toHaveBeenCalled();
  });

  it('disconnects, keeping imported problems', async () => {
    fakeLeetCode({ users: { codefan: [{ slug: 'two-sum', daysAgo: 1 }] } });
    const alice = await signUp(app);
    await alice.put('/api/leetcode/account', { username: 'codefan' });
    await alice.post('/api/leetcode/sync', {});
    expect((await alice.delete('/api/leetcode/account')).status).toBe(204);
    expect((await alice.get('/api/leetcode/account')).body.username).toBeNull();
    expect((await alice.get('/api/problems')).body.total).toBe(1);
  });
});

describe('syncing solves', () => {
  async function connected(solves: { slug: string; daysAgo: number }[]) {
    const lc = fakeLeetCode({ users: { codefan: solves } });
    const alice = await signUp(app);
    await alice.put('/api/leetcode/account', { username: 'codefan' });
    return { alice, lc };
  }

  const byTitle = (res: { body: { problems: Problem[] } }): Record<string, Problem> =>
    Object.fromEntries(res.body.problems.map((p) => [p.title, p]));

  it('imports recent solves as Solved problems with their solve dates', async () => {
    const { alice } = await connected([
      { slug: 'two-sum', daysAgo: 2 },
      { slug: 'lru-cache', daysAgo: 30 },
    ]);
    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'synced', result: { added: 2, updated: 0, unchanged: 0, tooOld: 0, failed: 0 } });

    const problems = byTitle(await alice.get('/api/problems'));
    expect(problems['Two Sum']).toMatchObject({
      status: 'Solved',
      source: 'sync',
      slug: 'two-sum',
      leetcodeNumber: 1,
      difficulty: 'Easy',
      tags: ['Array', 'Hash Table'],
      link: 'https://leetcode.com/problems/two-sum/',
    });
    const solvedDaysAgo = (Date.now() - Date.parse(problems['LRU Cache']!.lastSolvedAt!)) / 86_400_000;
    expect(Math.round(solvedDaysAgo)).toBe(30);
  });

  it('skips solves older than 3 months', async () => {
    const { alice } = await connected([
      { slug: 'two-sum', daysAgo: 89 },
      { slug: 'lru-cache', daysAgo: 91 },
    ]);
    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.body.result).toMatchObject({ added: 1, tooOld: 1 });
    expect(Object.keys(byTitle(await alice.get('/api/problems')))).toEqual(['Two Sum']);
  });

  it('counts a problem solved several times once, using the newest solve', async () => {
    const { alice } = await connected([
      { slug: 'two-sum', daysAgo: 1 },
      { slug: 'two-sum', daysAgo: 5 },
      { slug: 'two-sum', daysAgo: 100 },
    ]);
    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.body.result).toMatchObject({ added: 1, tooOld: 0 });
    const [problem] = (await alice.get('/api/problems')).body.problems;
    expect(Math.round((Date.now() - Date.parse(problem.lastSolvedAt)) / 86_400_000)).toBe(1);
  });

  it('looks up all new problems in a single LeetCode request', async () => {
    const { alice, lc } = await connected([
      { slug: 'two-sum', daysAgo: 1 },
      { slug: 'lru-cache', daysAgo: 2 },
      { slug: '3sum', daysAgo: 3 },
    ]);
    await alice.post('/api/leetcode/sync', {});
    expect(lc.count('question(')).toBe(1);
  });

  it('updates tracked problems without duplicating them', async () => {
    const { alice } = await connected([
      { slug: 'two-sum', daysAgo: 1 },
      { slug: 'lru-cache', daysAgo: 1 },
    ]);
    await alice.post('/api/problems', {
      title: 'Two Sum',
      difficulty: 'Easy',
      link: 'https://leetcode.com/problems/two-sum/',
      status: 'Todo',
      notes: 'my notes',
    });
    await alice.post('/api/problems', {
      title: 'LRU Cache',
      difficulty: 'Medium',
      link: 'https://leetcode.com/problems/lru-cache/',
      status: 'Mastered',
    });

    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.body.result).toMatchObject({ added: 0, updated: 1, unchanged: 1 });

    const problems = byTitle(await alice.get('/api/problems'));
    expect(problems['Two Sum']).toMatchObject({ status: 'Solved', notes: 'my notes', source: 'manual' });
    expect(problems['LRU Cache']!.status).toBe('Mastered'); // never downgraded
  });

  it('changes nothing when run again', async () => {
    const { alice } = await connected([{ slug: 'two-sum', daysAgo: 1 }]);
    await alice.post('/api/leetcode/sync', {});
    await forgetLastAttempt();
    const again = await alice.post('/api/leetcode/sync', {});
    expect(again.body.result).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    expect((await alice.get('/api/problems')).body.total).toBe(1);
  });

  it('counts solves whose details LeetCode does not return', async () => {
    const { alice } = await connected([
      { slug: 'two-sum', daysAgo: 1 },
      { slug: 'vanished-problem', daysAgo: 1 },
    ]);
    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.body.result).toMatchObject({ added: 1, failed: 1 });
  });

  it('records the last sync on the account', async () => {
    const { alice } = await connected([{ slug: 'two-sum', daysAgo: 1 }]);
    await alice.post('/api/leetcode/sync', {});
    const account = (await alice.get('/api/leetcode/account')).body;
    expect(account.lastSyncedAt).not.toBeNull();
    expect(account.lastResult).toMatchObject({ added: 1 });
  });

  it('refuses a manual sync right after another', async () => {
    const { alice } = await connected([]);
    expect((await alice.post('/api/leetcode/sync', {})).status).toBe(200);
    const res = await alice.post('/api/leetcode/sync', {});
    expect(res.status).toBe(429);
  });

  it('auto-sync runs when stale and is skipped when recent', async () => {
    const { alice, lc } = await connected([{ slug: 'two-sum', daysAgo: 1 }]);
    expect((await alice.post('/api/leetcode/sync', { auto: true })).body.status).toBe('synced');
    await forgetLastAttempt();
    expect((await alice.post('/api/leetcode/sync', { auto: true })).body).toEqual({ status: 'fresh' });
    expect(lc.count('recentAcSubmissionList')).toBe(1);
  });

  it('auto-sync is a no-op without a connected account', async () => {
    const alice = await signUp(app);
    expect((await alice.post('/api/leetcode/sync', { auto: true })).body).toEqual({ status: 'not-connected' });
    expect((await alice.post('/api/leetcode/sync', {})).status).toBe(400);
  });

  it('saves nothing when LeetCode is down', async () => {
    const { alice } = await connected([{ slug: 'two-sum', daysAgo: 1 }]);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect((await alice.post('/api/leetcode/sync', {})).status).toBe(502);
    expect((await alice.get('/api/problems')).body.total).toBe(0);
    expect((await alice.get('/api/leetcode/account')).body.lastSyncedAt).toBeNull();
  });

  it('keeps each user’s imports separate', async () => {
    const lc = fakeLeetCode({ users: { codefan: [{ slug: 'two-sum', daysAgo: 1 }], other: [] } });
    const alice = await signUp(app);
    const bob = await signUp(app);
    await alice.put('/api/leetcode/account', { username: 'codefan' });
    await bob.put('/api/leetcode/account', { username: 'other' });
    await alice.post('/api/leetcode/sync', {});
    await bob.post('/api/leetcode/sync', {});
    expect((await alice.get('/api/problems')).body.total).toBe(1);
    expect((await bob.get('/api/problems')).body.total).toBe(0);
    expect(lc.count('recentAcSubmissionList')).toBe(2);
  });
});

describe('solve dates on manual changes', () => {
  it('sets the solve date when a problem is marked Solved, and keeps it after', async () => {
    const alice = await signUp(app);
    const { body } = await alice.post('/api/problems', { title: 'X', difficulty: 'Easy' });
    expect(body.lastSolvedAt).toBeNull();

    const solved = await alice.patch(`/api/problems/${body.id}`, { status: 'Solved' });
    expect(solved.body.lastSolvedAt).not.toBeNull();

    const mastered = await alice.patch(`/api/problems/${body.id}`, { status: 'Mastered' });
    expect(mastered.body.lastSolvedAt).toBe(solved.body.lastSolvedAt);
  });
});

/** Lets the next sync start immediately, as if the one-minute gap had passed. */
async function forgetLastAttempt() {
  const { User } = await import('../src/models/User.js');
  await User.updateMany({}, { $set: { 'leetcode.lastSyncAttemptAt': null } });
}
