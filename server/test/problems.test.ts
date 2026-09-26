import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });

const twoSum = {
  title: 'Two Sum',
  leetcodeNumber: 1,
  difficulty: 'Easy',
  link: 'https://leetcode.com/problems/two-sum/description/',
  tags: ['Array', 'Hash Table'],
  companyTags: ['Google'],
  code: 'def twoSum(nums, target): ...',
};

describe('creating problems', () => {
  it('creates a problem with defaults and derives the slug from the link', async () => {
    const alice = await signUp(app);
    const res = await alice.post('/api/problems', twoSum);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Two Sum',
      slug: 'two-sum',
      status: 'Todo',
      language: 'python',
      notes: '',
      timeTakenMinutes: null,
    });
  });

  it('ignores fields the client may not set', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    const res = await alice.post('/api/problems', { ...twoSum, user: bob.user.id, createdAt: '2000-01-01' });
    expect(res.status).toBe(201);
    expect((await bob.get('/api/problems')).body.total).toBe(0);
    expect(res.body.createdAt).not.toContain('2000');
  });

  it('requires a title and difficulty', async () => {
    const alice = await signUp(app);
    const res = await alice.post('/api/problems', { title: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(['title', 'difficulty']);
  });

  it('rejects a second copy of the same LeetCode problem, pointing to the first', async () => {
    const alice = await signUp(app);
    const first = await alice.post('/api/problems', twoSum);
    const res = await alice.post('/api/problems', { ...twoSum, link: 'https://leetcode.com/problems/two-sum/' });
    expect(res.status).toBe(409);
    expect(res.body.existingId).toBe(first.body.id);
  });

  it('lets different users track the same problem, and allows several problems without links', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    expect((await alice.post('/api/problems', twoSum)).status).toBe(201);
    expect((await bob.post('/api/problems', twoSum)).status).toBe(201);
    expect((await alice.post('/api/problems', { title: 'Custom A', difficulty: 'Hard' })).status).toBe(201);
    expect((await alice.post('/api/problems', { title: 'Custom B', difficulty: 'Hard' })).status).toBe(201);
  });
});

describe('reading problems', () => {
  it('never shows another user their problems', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    const { body } = await alice.post('/api/problems', twoSum);

    expect((await bob.get(`/api/problems/${body.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/problems/${body.id}`, { status: 'Solved' })).status).toBe(404);
    expect((await bob.delete(`/api/problems/${body.id}`)).status).toBe(404);
    expect((await alice.get(`/api/problems/${body.id}`)).body.status).toBe('Todo');
  });

  it('returns 404 for malformed IDs', async () => {
    const alice = await signUp(app);
    expect((await alice.get('/api/problems/not-an-id')).status).toBe(404);
  });

  it('requires sign in', async () => {
    expect((await request(app).get('/api/problems')).status).toBe(401);
  });
});

describe('listing problems', () => {
  async function seed() {
    const alice = await signUp(app);
    await alice.post('/api/problems', twoSum);
    await alice.post('/api/problems', {
      title: 'LRU Cache',
      leetcodeNumber: 146,
      difficulty: 'Medium',
      status: 'Solved',
      tags: ['Hash Table', 'Design'],
      companyTags: ['Amazon'],
    });
    await alice.post('/api/problems', { title: 'a+b (regex?)', difficulty: 'Hard', tags: ['Math'] });
    return alice;
  }

  const titles = (res: request.Response) => res.body.problems.map((p: { title: string }) => p.title);

  it('filters by status, difficulty, tag and company', async () => {
    const alice = await seed();
    expect(titles(await alice.get('/api/problems?status=Solved'))).toEqual(['LRU Cache']);
    expect(titles(await alice.get('/api/problems?difficulty=Easy'))).toEqual(['Two Sum']);
    expect(titles(await alice.get('/api/problems?tag=Hash%20Table&sort=title'))).toEqual(['LRU Cache', 'Two Sum']);
    expect(titles(await alice.get('/api/problems?company=Amazon'))).toEqual(['LRU Cache']);
  });

  it('searches titles safely, and by problem number', async () => {
    const alice = await seed();
    expect(titles(await alice.get('/api/problems?search=lru'))).toEqual(['LRU Cache']);
    // Regex characters are matched literally rather than breaking the query.
    expect(titles(await alice.get(`/api/problems?search=${encodeURIComponent('b (regex?')}`))).toEqual(['a+b (regex?)']);
    expect(titles(await alice.get('/api/problems?search=146'))).toEqual(['LRU Cache']);
    expect(titles(await alice.get('/api/problems?search=%23146'))).toEqual(['LRU Cache']);
  });

  it('sorts and paginates', async () => {
    const alice = await seed();
    const page1 = await alice.get('/api/problems?sort=title&limit=2');
    expect(titles(page1)).toEqual(['a+b (regex?)', 'LRU Cache']);
    expect(page1.body).toMatchObject({ total: 3, page: 1, pages: 2 });
    expect(titles(await alice.get('/api/problems?sort=title&limit=2&page=2'))).toEqual(['Two Sum']);
    expect(titles(await alice.get('/api/problems?sort=recent'))[0]).toBe('a+b (regex?)');
  });

  it('rejects unknown sort values and oversized pages', async () => {
    const alice = await seed();
    expect((await alice.get('/api/problems?sort=password')).status).toBe(400);
    expect((await alice.get('/api/problems?limit=1000')).status).toBe(400);
  });

  it('lists the tags and companies in use', async () => {
    const alice = await seed();
    const { body } = await alice.get('/api/problems/facets');
    expect(body).toEqual({ tags: ['Array', 'Design', 'Hash Table', 'Math'], companies: ['Amazon', 'Google'] });
  });
});

describe('updating and deleting', () => {
  it('changes only the fields sent', async () => {
    const alice = await signUp(app);
    const { body } = await alice.post('/api/problems', twoSum);
    const res = await alice.patch(`/api/problems/${body.id}`, { status: 'Solved', notes: 'Use a map' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Solved', notes: 'Use a map', code: twoSum.code, tags: twoSum.tags });
  });

  it('updates the slug when the link changes, and clears it when the link is removed', async () => {
    const alice = await signUp(app);
    const { body } = await alice.post('/api/problems', twoSum);
    const moved = await alice.patch(`/api/problems/${body.id}`, { link: 'https://leetcode.com/problems/3sum/' });
    expect(moved.body.slug).toBe('3sum');
    const cleared = await alice.patch(`/api/problems/${body.id}`, { link: '' });
    expect(cleared.body.slug).toBeNull();
  });

  it('rejects an empty update', async () => {
    const alice = await signUp(app);
    const { body } = await alice.post('/api/problems', twoSum);
    expect((await alice.patch(`/api/problems/${body.id}`, {})).status).toBe(400);
  });

  it('deletes a problem', async () => {
    const alice = await signUp(app);
    const { body } = await alice.post('/api/problems', twoSum);
    expect((await alice.delete(`/api/problems/${body.id}`)).status).toBe(204);
    expect((await alice.get(`/api/problems/${body.id}`)).status).toBe(404);
  });
});
