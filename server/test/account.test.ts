import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { mailer, type Email } from '../src/lib/email.js';
import { PasswordReset } from '../src/models/PasswordReset.js';
import { signUp } from './helpers.js';

const app = createApp({ authRateLimit: 1000 });

afterEach(() => vi.restoreAllMocks());

type User = Awaited<ReturnType<typeof signUp>>;

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });
const me = (token: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

async function withSession(u: User) {
  const email = u.user.email;
  const { body } = await login(email, 'password-123');
  return { email, token: body.token as string };
}

/** Captures emails instead of sending them. */
function captureEmail() {
  const sent: Email[] = [];
  vi.spyOn(mailer, 'send').mockImplementation(async (email) => {
    sent.push(email);
    return true;
  });
  return sent;
}

async function requestReset(email: string, sent: Email[]) {
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0)); // sent in the background
  return { res, token: new URL(sent.at(-1)!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')! };
}

describe('changing the password', () => {
  it('requires the current password, then signs out other sessions', async () => {
    const alice = await signUp(app);
    const laptop = await withSession(alice);
    const phone = await withSession(alice);

    const wrong = await request(app)
      .post('/api/account/change-password')
      .set('Authorization', `Bearer ${laptop.token}`)
      .send({ currentPassword: 'nope', newPassword: 'new-password-456' });
    expect(wrong.status).toBe(400);

    const res = await request(app)
      .post('/api/account/change-password')
      .set('Authorization', `Bearer ${laptop.token}`)
      .send({ currentPassword: 'password-123', newPassword: 'new-password-456' });
    expect(res.status).toBe(200);

    expect((await me(res.body.token)).status).toBe(200); // this session continues with the new token
    expect((await me(laptop.token)).status).toBe(401); // old tokens stop working
    expect((await me(phone.token)).status).toBe(401);
    expect((await login(laptop.email, 'password-123')).status).toBe(401);
    expect((await login(laptop.email, 'new-password-456')).status).toBe(200);
  });

  it('enforces the password rules', async () => {
    const alice = await signUp(app);
    const res = await alice.post('/api/account/change-password', { currentPassword: 'password-123', newPassword: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('signing out everywhere', () => {
  it('ends every session', async () => {
    const alice = await signUp(app);
    const a = await withSession(alice);
    const b = await withSession(alice);
    await request(app).post('/api/account/sign-out-everywhere').set('Authorization', `Bearer ${a.token}`);
    expect((await me(a.token)).status).toBe(401);
    expect((await me(b.token)).status).toBe(401);
    expect((await login(a.email, 'password-123')).status).toBe(200); // can sign in again
  });
});

describe('password reset', () => {
  it('emails a one-time link that sets a new password and ends old sessions', async () => {
    const sent = captureEmail();
    const alice = await signUp(app);
    const session = await withSession(alice);

    const { res, token } = await requestReset(alice.user.email, sent);
    expect(res.body.message).toMatch(/If an account uses/);
    expect(sent[0]!.to).toBe(alice.user.email);
    expect(sent[0]!.text).toContain('http://localhost:5173/reset-password?token=');

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' });
    expect(reset.status).toBe(200);
    expect((await login(alice.user.email, 'brand-new-pass')).status).toBe(200);
    expect((await me(session.token)).status).toBe(401);

    // The link works only once.
    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass-1' });
    expect(again.status).toBe(400);
  });

  it('answers the same for unknown emails, and sends nothing', async () => {
    const sent = captureEmail();
    const alice = await signUp(app);
    const known = await request(app).post('/api/auth/forgot-password').send({ email: alice.user.email });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body.message.replace('nobody@example.com', 'X')).toBe(known.body.message.replace(alice.user.email, 'X'));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.to).toBe(alice.user.email);
  });

  it('only honours the newest link, and not after it expires', async () => {
    const sent = captureEmail();
    const alice = await signUp(app);
    const first = await requestReset(alice.user.email, sent);
    const second = await requestReset(alice.user.email, sent);
    expect((await request(app).post('/api/auth/reset-password').send({ token: first.token, password: 'x-password-1' })).status).toBe(400);

    await PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/auth/reset-password').send({ token: second.token, password: 'x-password-1' })).status).toBe(400);
  });

  it('stores only a hash of the link', async () => {
    const sent = captureEmail();
    const alice = await signUp(app);
    const { token } = await requestReset(alice.user.email, sent);
    expect(JSON.stringify(await PasswordReset.find().lean())).not.toContain(token);
  });
});

describe('exporting data', () => {
  it('downloads everything stored about the user', async () => {
    const alice = await signUp(app);
    await alice.post('/api/problems', { title: 'Two Sum', difficulty: 'Easy', status: 'Solved', notes: 'hash map' });
    await alice.post('/api/tokens', { name: 'Chrome' });

    const res = await alice.get('/api/account/export');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="leetcode-tracker-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.body.account).toMatchObject({ username: alice.user.username, email: alice.user.email });
    expect(res.body.problems[0]).toMatchObject({ title: 'Two Sum', notes: 'hash map' });
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.accessTokens).toEqual([expect.objectContaining({ name: 'Chrome' })]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
  });
});

describe('deleting the account', () => {
  it('needs the password, then removes the user and all their data', async () => {
    const alice = await signUp(app);
    const bob = await signUp(app);
    await alice.post('/api/problems', { title: 'Two Sum', difficulty: 'Easy', status: 'Solved' });
    await alice.post('/api/tokens', { name: 'Chrome' });
    await bob.post('/api/problems', { title: 'Bob’s', difficulty: 'Easy' });

    expect((await request(app).delete('/api/account').set('Authorization', `Bearer ${(await withSession(alice)).token}`).send({ password: 'wrong' })).status).toBe(400);

    const res = await request(app)
      .delete('/api/account')
      .set('Authorization', `Bearer ${(await withSession(alice)).token}`)
      .send({ password: 'password-123' });
    expect(res.status).toBe(204);

    const db = mongoose.connection.db!;
    const aliceId = new mongoose.Types.ObjectId(alice.user.id);
    for (const name of ['users', 'problems', 'activities', 'apitokens', 'agentlogs', 'passwordresets']) {
      const filter = name === 'users' ? { _id: aliceId } : { user: aliceId };
      expect(await db.collection(name).countDocuments(filter), name).toBe(0);
    }
    expect((await login(alice.user.email, 'password-123')).status).toBe(401);
    expect((await bob.get('/api/problems')).body.total).toBe(1); // others untouched
  });
});

describe('security basics', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('only allows the configured website to call the API from a browser', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits each visitor separately behind a proxy', async () => {
    const { env } = await import('../src/config/env.js');
    const original = env.TRUST_PROXY;
    env.TRUST_PROXY = 1;
    try {
      const limited = createApp({ generalRateLimit: 2 });
      const from = (ip: string) => request(limited).get('/api/health').set('X-Forwarded-For', ip);
      await from('1.1.1.1');
      await from('1.1.1.1');
      expect((await from('1.1.1.1')).status).toBe(429);
      expect((await from('2.2.2.2')).status).toBe(200);
    } finally {
      env.TRUST_PROXY = original;
    }
  });
});
