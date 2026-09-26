import request from 'supertest';
import type { Express } from 'express';
import type { AuthResponse } from '@lct/shared';

let counter = 0;

/** Registers a fresh user and returns a supertest agent-like helper that sends their token. */
export async function signUp(app: Express) {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: `user${counter}`, email: `user${counter}@example.com`, password: 'password-123' });
  const { token, user } = res.body as AuthResponse;
  const auth = { Authorization: `Bearer ${token}` };

  return {
    user,
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
    put: (url: string, body?: object) => request(app).put(url).set(auth).send(body),
    patch: (url: string, body?: object) => request(app).patch(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}
