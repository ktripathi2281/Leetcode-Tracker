import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  AUTO_SYNC_AFTER_HOURS,
  connectLeetCodeSchema,
  parseLeetCodeInput,
  syncRequestSchema,
  type ApiError,
  type ConnectLeetCodeInput,
  type LeetCodeAccount,
  type SyncResponse,
  type SyncResult,
} from '@lct/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { User, type UserDoc } from '../models/User.js';
import { LeetCodeUnavailableError, findLeetCodeUser, getLeetCodeProblem } from '../lib/leetcode.js';
import { syncLeetCodeSolves } from '../lib/sync.js';

const HOUR_MS = 60 * 60 * 1000;
/** A manual sync can't start within this long of the previous one. */
const MIN_SYNC_GAP_MS = 60 * 1000;

function sendUnavailable(res: Response, err: LeetCodeUnavailableError) {
  console.warn('LeetCode request failed:', err.cause);
  res.status(502).json({ message: "Couldn't reach LeetCode. Please try again later." } satisfies ApiError);
}

function toAccount(user: UserDoc): LeetCodeAccount {
  const lc = user.leetcode;
  return {
    username: lc?.username ?? null,
    lastSyncedAt: lc?.lastSyncedAt?.toISOString() ?? null,
    lastResult: (lc?.lastResult as SyncResult | null) ?? null,
  };
}

export function leetCodeRouter({ lookupLimit }: { lookupLimit: number }) {
  const router = Router();
  router.use(requireAuth);

  const lookupLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: lookupLimit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many lookups. Please wait a minute.' } satisfies ApiError,
  });

  // GET /api/leetcode/problems/:slug — problem details for auto-filling the form
  router.get('/problems/:slug', lookupLimiter, async (req, res) => {
    const raw = req.params.slug;
    const slug = typeof raw === 'string' ? parseLeetCodeInput(raw) : null;
    if (!slug) {
      res.status(400).json({ message: 'That is not a LeetCode problem link' } satisfies ApiError);
      return;
    }

    try {
      const info = await getLeetCodeProblem(slug);
      if (!info) {
        res.status(404).json({ message: 'No LeetCode problem found at that link' } satisfies ApiError);
        return;
      }
      res.json(info);
    } catch (err) {
      if (err instanceof LeetCodeUnavailableError) return sendUnavailable(res, err);
      throw err;
    }
  });

  // GET /api/leetcode/account — connected username and last sync
  router.get('/account', async (req, res) => {
    const user = await User.findById(req.userId);
    res.json(toAccount(user!));
  });

  // PUT /api/leetcode/account — connect (or change) the LeetCode username
  router.put('/account', lookupLimiter, validateBody(connectLeetCodeSchema), async (req, res) => {
    const { username } = req.body as ConnectLeetCodeInput;

    let canonical: string | null;
    try {
      canonical = await findLeetCodeUser(username);
    } catch (err) {
      if (err instanceof LeetCodeUnavailableError) return sendUnavailable(res, err);
      throw err;
    }
    if (!canonical) {
      res.status(404).json({ message: `No LeetCode user named "${username}"` } satisfies ApiError);
      return;
    }

    const user = (await User.findById(req.userId))!;
    // A different account starts over, so the next sync imports its solves right away.
    if (user.leetcode?.username !== canonical) {
      user.leetcode = { username: canonical, lastSyncedAt: null, lastSyncAttemptAt: null, lastResult: null };
      await user.save();
    }
    res.json(toAccount(user));
  });

  // DELETE /api/leetcode/account — disconnect; imported problems are kept
  router.delete('/account', async (req, res) => {
    await User.updateOne(
      { _id: req.userId },
      { $set: { leetcode: { username: null, lastSyncedAt: null, lastSyncAttemptAt: null, lastResult: null } } },
    );
    res.status(204).end();
  });

  // POST /api/leetcode/sync — import recent solves. With { auto: true }, only if the last sync is stale.
  router.post('/sync', validateBody(syncRequestSchema), async (req, res) => {
    const { auto } = req.body as { auto: boolean };
    const now = Date.now();

    // Claim the sync atomically, so two requests can't run at once and syncs can't be spammed.
    const conditions: object[] = [
      { 'leetcode.username': { $type: 'string' } },
      { $or: [{ 'leetcode.lastSyncAttemptAt': null }, { 'leetcode.lastSyncAttemptAt': { $lt: new Date(now - MIN_SYNC_GAP_MS) } }] },
    ];
    if (auto) {
      const staleBefore = new Date(now - AUTO_SYNC_AFTER_HOURS * HOUR_MS);
      conditions.push({ $or: [{ 'leetcode.lastSyncedAt': null }, { 'leetcode.lastSyncedAt': { $lt: staleBefore } }] });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.userId, $and: conditions },
      { $set: { 'leetcode.lastSyncAttemptAt': new Date(now) } },
      { returnDocument: 'after' },
    );

    if (!user) {
      const current = await User.findById(req.userId);
      const connected = !!current?.leetcode?.username;
      if (auto) {
        res.json({ status: connected ? 'fresh' : 'not-connected' } satisfies SyncResponse);
      } else if (!connected) {
        res.status(400).json({ message: 'Connect your LeetCode account first' } satisfies ApiError);
      } else {
        res.status(429).json({ message: 'Synced a moment ago. Try again in a minute.' } satisfies ApiError);
      }
      return;
    }

    try {
      const result = await syncLeetCodeSolves(user._id, user.leetcode!.username!);
      await User.updateOne(
        { _id: user._id },
        { $set: { 'leetcode.lastSyncedAt': new Date(result.syncedAt), 'leetcode.lastResult': result } },
      );
      res.json({ status: 'synced', result } satisfies SyncResponse);
    } catch (err) {
      if (err instanceof LeetCodeUnavailableError) return sendUnavailable(res, err);
      throw err;
    }
  });

  return router;
}
