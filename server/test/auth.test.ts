import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

const app = createApp({ authRateLimit: 1000 });

const alice = { username: 'alice', email: 'alice@example.com', password: 'correct-horse-1' };

const register = (body: object) => request(app).post('/api/auth/register').send(body);
const login = (body: object) => request(app).post('/api/auth/login').send(body);
const me = (token?: string) => {
  const req = request(app).get('/api/auth/me');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token and the user', async () => {
    const res = await register(alice);
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(String), username: 'alice', email: 'alice@example.com' });
  });

  it('stores a hash, never the plain password', async () => {
    await register(alice);
    const user = await User.findOne({ email: alice.email }).select('+passwordHash').lean();
    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toBe(alice.password);
  });

  it('never returns the password hash', async () => {
    const res = await register(alice);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('normalizes email to lowercase and trims whitespace', async () => {
    const res = await register({ ...alice, email: '  Alice@Example.COM ' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects a duplicate email', async () => {
    await register(alice);
    const res = await register({ ...alice, username: 'alice2', email: 'ALICE@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email is already in use');
  });

  it('rejects a duplicate username regardless of case', async () => {
    await register(alice);
    const res = await register({ ...alice, username: 'ALICE', email: 'other@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Username is already in use');
  });

  it.each([
    ['short password', { ...alice, password: 'short1' }, 'Password must be at least 8 characters'],
    ['bad email', { ...alice, email: 'not-an-email' }, 'Enter a valid email'],
    ['short username', { ...alice, username: 'al' }, 'Username must be at least 3 characters'],
    ['username with spaces', { ...alice, username: 'al ice' }, 'Username can only use letters, numbers, _ and -'],
  ])('rejects invalid input: %s', async (_name, body, message) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for correct credentials', async () => {
    await register(alice);
    const res = await login({ email: alice.email, password: alice.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.username).toBe('alice');
  });

  it('accepts the email in any case', async () => {
    await register(alice);
    const res = await login({ email: 'ALICE@example.com', password: alice.password });
    expect(res.status).toBe(200);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await register(alice);
    const wrongPassword = await login({ email: alice.email, password: 'wrong-password' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: alice.password });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
    expect(unknownEmail.body.message).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const { body } = await register(alice);
    const res = await me(body.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(body.user);
  });

  it('rejects requests without a token', async () => {
    expect((await me()).status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const { body } = await register(alice);
    expect((await me(body.token + 'x')).status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const { body } = await register(alice);
    const forged = jwt.sign({}, 'some-other-secret-that-is-long-enough!!', { subject: body.user.id });
    expect((await me(forged)).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { body } = await register(alice);
    const expired = jwt.sign({}, process.env.JWT_SECRET!, { subject: body.user.id, expiresIn: -10 });
    expect((await me(expired)).status).toBe(401);
  });

  it('rejects the token of a deleted account', async () => {
    const { body } = await register(alice);
    await User.deleteOne({ _id: body.user.id });
    expect((await me(body.token)).status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('blocks repeated login attempts from the same IP', async () => {
    const limited = createApp({ authRateLimit: 3 });
    const attempt = () => request(limited).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many attempts/);
  });
});
