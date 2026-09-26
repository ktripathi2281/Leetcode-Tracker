import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { LeetCodeProblem } from '../src/models/LeetCodeProblem.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });

const twoSumResponse = {
  data: {
    question: {
      questionFrontendId: '1',
      title: 'Two Sum',
      titleSlug: 'two-sum',
      difficulty: 'Easy',
      isPaidOnly: false,
      topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
    },
  },
};

function mockLeetCode(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe('GET /api/leetcode/problems/:slug', () => {
  it('returns problem details from LeetCode', async () => {
    const fetchSpy = mockLeetCode(twoSumResponse);
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
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('accepts a full problem URL', async () => {
    mockLeetCode(twoSumResponse);
    const alice = await signUp(app);
    const url = encodeURIComponent('https://leetcode.com/problems/two-sum/description/');
    expect((await alice.get(`/api/leetcode/problems/${url}`)).body.title).toBe('Two Sum');
  });

  it('caches results so LeetCode is asked only once across users', async () => {
    const fetchSpy = mockLeetCode(twoSumResponse);
    const alice = await signUp(app);
    const bob = await signUp(app);
    await alice.get('/api/leetcode/problems/two-sum');
    const res = await bob.get('/api/leetcode/problems/two-sum');
    expect(res.body.title).toBe('Two Sum');
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(await LeetCodeProblem.countDocuments()).toBe(1);
  });

  it('returns 404 for a problem LeetCode does not have, without caching it', async () => {
    mockLeetCode({ data: { question: null } });
    const alice = await signUp(app);
    const res = await alice.get('/api/leetcode/problems/not-a-problem');
    expect(res.status).toBe(404);
    expect(await LeetCodeProblem.countDocuments()).toBe(0);
  });

  it('returns 502 when LeetCode is down or its response has changed', async () => {
    const alice = await signUp(app);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(502);
    mockLeetCode({ data: { question: { title: 'Two Sum' } } });
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(502);
    mockLeetCode({ errors: ['rate limited'] }, 429);
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(502);
  });

  it('rejects links that are not LeetCode problems', async () => {
    const fetchSpy = mockLeetCode(twoSumResponse);
    const alice = await signUp(app);
    const url = encodeURIComponent('https://example.com/problems/two-sum');
    expect((await alice.get(`/api/leetcode/problems/${url}`)).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('limits lookups per user', async () => {
    mockLeetCode(twoSumResponse);
    const limited = createApp({ authRateLimit: 1000, leetCodeLookupLimit: 2 });
    const alice = await signUp(limited);
    await alice.get('/api/leetcode/problems/two-sum');
    await alice.get('/api/leetcode/problems/two-sum');
    expect((await alice.get('/api/leetcode/problems/two-sum')).status).toBe(429);
  });
});
