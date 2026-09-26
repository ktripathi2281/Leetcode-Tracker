import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { mongo } from 'mongoose';
import {
  loginSchema,
  registerSchema,
  type ApiError,
  type AuthResponse,
  type LoginInput,
  type RegisterInput,
} from '@lct/shared';
import { User, toAuthUser } from '../models/User.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../lib/passwords.js';
import { signToken } from '../lib/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export interface AuthRouterOptions {
  /** Max login/register attempts per IP per 15 minutes. */
  rateLimit: number;
}

export function authRouter({ rateLimit: limit }: AuthRouterOptions) {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in a few minutes.' } satisfies ApiError,
  });

  router.post('/register', limiter, validateBody(registerSchema), async (req, res) => {
    const { username, email, password } = req.body as RegisterInput;

    try {
      const user = await User.create({ username, email, passwordHash: await hashPassword(password) });
      const body: AuthResponse = { token: signToken(user.id), user: toAuthUser(user) };
      res.status(201).json(body);
    } catch (err) {
      // Rely on the unique indexes rather than a lookup first, so two simultaneous
      // sign-ups with the same name can't both succeed.
      if (err instanceof mongo.MongoServerError && err.code === 11000) {
        const field = 'email' in (err.keyPattern ?? {}) ? 'Email' : 'Username';
        const body: ApiError = { message: `${field} is already in use` };
        res.status(409).json(body);
        return;
      }
      throw err;
    }
  });

  router.post('/login', limiter, validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as LoginInput;
    const user = await User.findOne({ email }).select('+passwordHash');

    let valid = false;
    if (user) {
      valid = await verifyPassword(password, user.passwordHash);
    } else {
      await burnPasswordCheck(password);
    }

    if (!user || !valid) {
      const body: ApiError = { message: 'Invalid email or password' };
      res.status(401).json(body);
      return;
    }

    const body: AuthResponse = { token: signToken(user.id), user: toAuthUser(user) };
    res.json(body);
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  return router;
}
