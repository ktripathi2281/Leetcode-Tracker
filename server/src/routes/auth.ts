import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { mongo } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import {
  PASSWORD_RESET_MINUTES,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
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
import { PasswordReset } from '../models/PasswordReset.js';
import { mailer, passwordResetEmail } from '../lib/email.js';
import { appUrl } from '../config/env.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

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
      const body: AuthResponse = { token: signToken(user.id, user.tokenVersion), user: toAuthUser(user) };
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

    const body: AuthResponse = { token: signToken(user.id, user.tokenVersion), user: toAuthUser(user) };
    res.json(body);
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  // POST /api/auth/forgot-password — emails a one-time reset link, if the account exists.
  // The answer is the same either way, and the email is sent in the background, so
  // neither the response nor its timing reveals which emails have accounts.
  router.post('/forgot-password', limiter, validateBody(forgotPasswordSchema), async (req, res) => {
    const { email } = req.body as ForgotPasswordInput;
    res.json({ message: `If an account uses ${email}, we've sent it a link to reset the password.` });

    const user = await User.findOne({ email });
    if (!user) return;
    const token = randomBytes(32).toString('base64url');
    await PasswordReset.deleteMany({ user: user._id }); // only the newest link works
    await PasswordReset.create({
      user: user._id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_MINUTES * 60_000),
    });
    const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await mailer.send(passwordResetEmail(user.email, user.username, link, PASSWORD_RESET_MINUTES));
  });

  // POST /api/auth/reset-password — sets a new password with a reset link's token
  router.post('/reset-password', limiter, validateBody(resetPasswordSchema), async (req, res) => {
    const { token, password } = req.body as ResetPasswordInput;
    // Claimed atomically, so a link works exactly once.
    const reset = await PasswordReset.findOneAndDelete({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
    const user = reset ? await User.findById(reset.user) : null;
    if (!user) {
      res.status(400).json({ message: 'This reset link has expired or was already used. Ask for a new one.' } satisfies ApiError);
      return;
    }
    user.passwordHash = await hashPassword(password);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // sign out every existing session
    await user.save();
    res.json({ message: 'Password changed. Sign in with your new password.' });
  });

  return router;
}
