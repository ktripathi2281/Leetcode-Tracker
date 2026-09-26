import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { MAX_TOKENS_PER_USER, type Problem as ProblemDTO } from '@lct/shared';
import { createApp } from '../src/app.js';
import { Activity } from '../src/models/Activity.js';
import { ApiToken } from '../src/models/ApiToken.js';
import { Problem } from '../src/models/Problem.js';
import { fakeLeetCode } from './fakeLeetCode.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });

afterEach(() => vi.restoreAllMocks());

type User = Awaited<ReturnType<typeof signUp>>;

async function tokenFor(u: User, name = 'Chrome') {
  return (await u.post('/api/tokens', { name })).body.token as string;
}

const asExtension = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string, body: object) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
});

const submission = (fields: object = {}) => ({
  slug: 'two-sum',
  submissionId: '1001',
  lang: 'python3',
  code: 'class Solution:\n    def twoSum(self, nums, target): ...',
  ...fields,
});

describe('access tokens', () => {
  it('shows a new token once, then only its preview', async () => {
    const alice = await signUp(app);
    const created = (await alice.post('/api/tokens', { name: 'Chrome on laptop' })).body;
    expect(created.token).toMatch(/^lct_[A-Za-z0-9_-]{43}$/);
    expect(created.preview).toBe(created.token.slice(0, 10));

    const list = (await alice.get('/api/tokens')).body;
    expect(list).toEqual([{ id: created.id, name: 'Chrome on laptop', preview: created.preview, createdAt: expect.any(String), lastUsedAt: null }]);
    expect(JSON.stringify(list)).not.toContain(created.token);
  });

  it('stores only a hash of the token', async () => {
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    const stored = JSON.stringify(await ApiToken.find().lean());
    expect(stored).not.toContain(token);
  });

  it('lets the extension check its token, and records when it was used', async () => {
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    const res = await asExtension(token).get('/api/extension/me');
    expect(res.body).toEqual({ username: alice.user.username });
    expect((await alice.get('/api/tokens')).body[0].lastUsedAt).not.toBeNull();
  });

  it('stops working as soon as it is revoked', async () => {
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    const [{ id }] = (await alice.get('/api/tokens')).body;
    expect((await alice.delete(`/api/tokens/${id}`)).status).toBe(204);
    const res = await asExtension(token).get('/api/extension/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/revoked/);
  });

  it('only works for the extension, not the rest of the API', async () => {
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    expect((await asExtension(token).get('/api/problems')).status).toBe(401);
    expect((await asExtension(token).get('/api/tokens')).status).toBe(401);
  });

  it('rejects made-up tokens and app sign-ins on extension routes', async () => {
    const alice = await signUp(app);
    expect((await asExtension('lct_not-a-real-token').get('/api/extension/me')).status).toBe(401);
    expect((await alice.get('/api/extension/me')).status).toBe(401);
  });

  it('keeps tokens private to their owner, and limits how many', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    await tokenFor(alice);
    const [{ id }] = (await alice.get('/api/tokens')).body;
    expect((await bob.delete(`/api/tokens/${id}`)).status).toBe(404);
    expect((await bob.get('/api/tokens')).body).toEqual([]);

    for (let i = 1; i < MAX_TOKENS_PER_USER; i++) await tokenFor(alice, `t${i}`);
    expect((await alice.post('/api/tokens', { name: 'one too many' })).status).toBe(400);
  });
});

describe('submissions from the extension', () => {
  it('adds a new problem as Solved, with the accepted code', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const token = await tokenFor(alice);

    const res = await asExtension(token).post('/api/extension/submissions', submission());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Two Sum', outcome: 'added' });

    const p = (await alice.get(`/api/problems/${res.body.problemId}`)).body as ProblemDTO;
    expect(p).toMatchObject({
      status: 'Solved',
      source: 'extension',
      leetcodeNumber: 1,
      difficulty: 'Easy',
      language: 'python',
      code: submission().code,
    });
    expect(p.nextReviewAt).not.toBeNull();
    expect(await Activity.countDocuments({ user: alice.user.id })).toBe(1);
  });

  it('updates a tracked problem’s code and status, keeping the notes', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const { body: p } = await alice.post('/api/problems', {
      title: 'Two Sum',
      difficulty: 'Easy',
      link: 'https://leetcode.com/problems/two-sum/',
      status: 'Attempted',
      notes: 'my notes',
      code: 'old code',
    });
    const token = await tokenFor(alice);

    const res = await asExtension(token).post('/api/extension/submissions', submission({ lang: 'golang', code: 'func twoSum() {}' }));
    expect(res.body).toMatchObject({ problemId: p.id, outcome: 'solved' });
    const updated = (await alice.get(`/api/problems/${p.id}`)).body as ProblemDTO;
    expect(updated).toMatchObject({ status: 'Solved', notes: 'my notes', code: 'func twoSum() {}', language: 'go' });
  });

  it('counts a re-solve of a due problem as its review', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    const first = await asExtension(token).post('/api/extension/submissions', submission());
    await Problem.updateOne({ _id: first.body.problemId }, { nextReviewAt: new Date(Date.now() - 60_000) });

    const again = await asExtension(token).post('/api/extension/submissions', submission({ submissionId: '1002' }));
    expect(again.body.outcome).toBe('reviewed');
    const p = (await alice.get(`/api/problems/${first.body.problemId}`)).body as ProblemDTO;
    expect(p).toMatchObject({ status: 'Reviewing', reviewStep: 1 });
  });

  it('ignores a resend of the same submission', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    await asExtension(token).post('/api/extension/submissions', submission());
    const resend = await asExtension(token).post('/api/extension/submissions', submission());
    expect(resend.body.outcome).toBe('duplicate');
    expect(await Activity.countDocuments({ user: alice.user.id })).toBe(1);
  });

  it('marks an older AI analysis as out of date when the code changes', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    const { body } = await asExtension(token).post('/api/extension/submissions', submission());
    const { codeHash } = await import('../src/models/Problem.js');
    await Problem.updateOne(
      { _id: body.problemId },
      { postMortem: { timeComplexity: 'O(n)', analyzedAt: new Date(), codeHash: codeHash(submission().code, 'python') } },
    );
    expect((await alice.get(`/api/problems/${body.problemId}`)).body.postMortem.current).toBe(true);
    await asExtension(token).post('/api/extension/submissions', submission({ submissionId: '1002', code: 'faster code' }));
    expect((await alice.get(`/api/problems/${body.problemId}`)).body.postMortem.current).toBe(false);
  });

  it('never trusts a submission time in the future', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    const { body } = await asExtension(token).post(
      '/api/extension/submissions',
      submission({ acceptedAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
    );
    const p = (await alice.get(`/api/problems/${body.problemId}`)).body as ProblemDTO;
    expect(Date.parse(p.lastSolvedAt!)).toBeLessThanOrEqual(Date.now());
  });

  it('rejects unknown problems and bad input', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    expect((await asExtension(token).post('/api/extension/submissions', submission({ slug: 'no-such-problem' }))).status).toBe(404);
    expect((await asExtension(token).post('/api/extension/submissions', submission({ slug: '../etc' }))).status).toBe(400);
    expect((await asExtension(token).post('/api/extension/submissions', submission({ code: '' }))).status).toBe(400);
  });

  it('asks the extension to retry when LeetCode is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const alice = await signUp(app);
    const token = await tokenFor(alice);
    expect((await asExtension(token).post('/api/extension/submissions', submission())).status).toBe(502);
  });

  it('files submissions under the token’s owner only', async () => {
    fakeLeetCode();
    const alice = await signUp(app);
    const bob = await signUp(app);
    await asExtension(await tokenFor(alice)).post('/api/extension/submissions', submission());
    expect((await alice.get('/api/problems')).body.total).toBe(1);
    expect((await bob.get('/api/problems')).body.total).toBe(0);
  });
});
