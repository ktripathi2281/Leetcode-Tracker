import { Router } from 'express';
import {
  changePasswordSchema,
  deleteAccountSchema,
  type ApiError,
  type AuthResponse,
  type ChangePasswordInput,
  type DeleteAccountInput,
} from '@lct/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { User, toAuthUser, type UserDoc } from '../models/User.js';
import { Problem, toProblemDTO } from '../models/Problem.js';
import { Activity } from '../models/Activity.js';
import { AgentLog } from '../models/AgentLog.js';
import { ApiToken } from '../models/ApiToken.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { deleteUsageFor } from '../lib/ai/usage.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { signToken } from '../lib/tokens.js';

const router = Router();
router.use(requireAuth);

const wrongPassword: ApiError = { message: 'That password is not right' };

async function checkPassword(userId: unknown, password: string): Promise<UserDoc | null> {
  const user = await User.findById(userId).select('+passwordHash');
  return user && (await verifyPassword(password, user.passwordHash)) ? user : null;
}

// POST /api/account/change-password — signs out every other session; this one gets a new token
router.post('/change-password', validateBody(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  const user = await checkPassword(req.userId, currentPassword);
  if (!user) {
    res.status(400).json(wrongPassword);
    return;
  }
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  res.json({ token: signToken(user.id, user.tokenVersion), user: toAuthUser(user) } satisfies AuthResponse);
});

// POST /api/account/sign-out-everywhere — ends every session, including this one
router.post('/sign-out-everywhere', async (req, res) => {
  await User.updateOne({ _id: req.userId }, { $inc: { tokenVersion: 1 } });
  res.status(204).end();
});

// GET /api/account/export — everything stored about the user, as a JSON download
router.get('/export', async (req, res) => {
  const user = (await User.findById(req.userId).lean())!;
  const [problems, activity, aiRuns, tokens] = await Promise.all([
    Problem.find({ user: req.userId }).sort({ createdAt: 1 }),
    Activity.find({ user: req.userId }).sort({ at: 1 }).lean(),
    AgentLog.find({ user: req.userId }).sort({ createdAt: 1 }).lean(),
    ApiToken.find({ user: req.userId }).lean(),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      leetcodeUsername: user.leetcode?.username ?? null,
    },
    problems: problems.map(toProblemDTO),
    activity: activity.map((a) => ({ problemId: a.problem, kind: a.kind, outcome: a.outcome, at: a.at })),
    aiRuns: aiRuns.map((r) => ({
      agent: r.agent,
      status: r.status,
      createdAt: r.createdAt,
      input: r.input,
      output: r.output,
      error: r.error,
    })),
    // Names and dates only: token secrets are never stored.
    accessTokens: tokens.map((t) => ({ name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt })),
  };

  res.setHeader('Content-Disposition', `attachment; filename="leetcode-tracker-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
});

// DELETE /api/account — deletes the account and everything in it, for good
router.delete('/', validateBody(deleteAccountSchema), async (req, res) => {
  const { password } = req.body as DeleteAccountInput;
  const user = await checkPassword(req.userId, password);
  if (!user) {
    res.status(400).json(wrongPassword);
    return;
  }
  const mine = { user: user._id };
  await Promise.all([
    Problem.deleteMany(mine),
    Activity.deleteMany(mine),
    AgentLog.deleteMany(mine),
    ApiToken.deleteMany(mine),
    PasswordReset.deleteMany(mine),
    deleteUsageFor(user._id),
  ]);
  await User.deleteOne({ _id: user._id });
  res.status(204).end();
});

export default router;
