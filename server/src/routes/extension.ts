import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { isValidObjectId, mongo } from 'mongoose';
import {
  MAX_TOKENS_PER_USER,
  createTokenSchema,
  extensionSubmissionSchema,
  toTrackerLanguage,
  type ApiError,
  type CreatedToken,
  type ExtensionMe,
  type ExtensionSubmission,
  type ExtensionSubmissionResult,
} from '@lct/shared';
import type { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireApiToken } from '../middleware/apiToken.js';
import { validateBody } from '../middleware/validate.js';
import { ApiToken, generateToken, toTokenSummary } from '../models/ApiToken.js';
import { Problem, type ProblemDoc } from '../models/Problem.js';
import { logActivity } from '../lib/activity.js';
import { LeetCodeUnavailableError, getLeetCodeProblem } from '../lib/leetcode.js';
import { applyLeetCodeSolve, newSolvedProblem, saveSolve } from '../lib/solves.js';

// ─── Managing tokens (signed in to the app) ───────────────────────────────────

export const tokenRoutes = Router();
tokenRoutes.use(requireAuth);

// GET /api/tokens
tokenRoutes.get('/', async (req, res) => {
  const tokens = await ApiToken.find({ user: req.userId }).sort({ createdAt: -1 });
  res.json(tokens.map(toTokenSummary));
});

// POST /api/tokens — the full token is in this response only
tokenRoutes.post('/', validateBody(createTokenSchema), async (req, res) => {
  if ((await ApiToken.countDocuments({ user: req.userId })) >= MAX_TOKENS_PER_USER) {
    res.status(400).json({ message: `You can have up to ${MAX_TOKENS_PER_USER} tokens. Revoke one first.` } satisfies ApiError);
    return;
  }
  const { name } = req.body as z.output<typeof createTokenSchema>;
  const { token, tokenHash, preview } = generateToken();
  const doc = await ApiToken.create({ user: req.userId, name, tokenHash, preview });
  res.status(201).json({ ...toTokenSummary(doc), token } satisfies CreatedToken);
});

// DELETE /api/tokens/:id — revoke; the extension stops working at once
tokenRoutes.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const result = isValidObjectId(id) ? await ApiToken.deleteOne({ _id: id, user: req.userId }) : null;
  if (!result?.deletedCount) {
    res.status(404).json({ message: 'Token not found' } satisfies ApiError);
    return;
  }
  res.status(204).end();
});

// ─── Used by the extension (access token) ─────────────────────────────────────

export function extensionRoutes({ submissionLimit }: { submissionLimit: number }) {
  const router = Router();
  router.use(requireApiToken);

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: submissionLimit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many submissions at once. Try again in a minute.' } satisfies ApiError,
  });

  // GET /api/extension/me — lets the extension check its token
  router.get('/me', (req, res) => {
    res.json({ username: req.user!.username } satisfies ExtensionMe);
  });

  // POST /api/extension/submissions — an accepted LeetCode submission
  router.post('/submissions', limiter, validateBody(extensionSubmissionSchema), async (req, res) => {
    const sub = req.body as ExtensionSubmission;
    const now = Date.now();
    // Trust the client's time only within reason.
    const acceptedAt = sub.acceptedAt ? new Date(Math.min(Date.parse(sub.acceptedAt), now)) : new Date(now);

    const respond = (problem: ProblemDoc, outcome: ExtensionSubmissionResult['outcome']) =>
      res.json({ problemId: problem.id, title: problem.title, outcome } satisfies ExtensionSubmissionResult);
    const keepCode = (problem: ProblemDoc) => {
      problem.code = sub.code;
      problem.language = toTrackerLanguage(sub.lang);
      problem.lastSubmissionId = sub.submissionId;
    };

    let problem = await Problem.findOne({ user: req.userId, slug: sub.slug });
    if (problem?.lastSubmissionId === sub.submissionId) return respond(problem, 'duplicate');

    if (!problem) {
      let info;
      try {
        info = await getLeetCodeProblem(sub.slug);
      } catch (err) {
        if (!(err instanceof LeetCodeUnavailableError)) throw err;
        res.status(502).json({ message: "Couldn't reach LeetCode to look up this problem. It will retry." } satisfies ApiError);
        return;
      }
      if (!info) {
        res.status(404).json({ message: 'LeetCode has no problem with that slug' } satisfies ApiError);
        return;
      }
      const created = newSolvedProblem(req.userId!, info, acceptedAt, 'extension');
      keepCode(created);
      try {
        await created.save();
        await logActivity(created, acceptedAt);
        return respond(created, 'added');
      } catch (err) {
        if (!(err instanceof mongo.MongoServerError && err.code === 11000)) throw err;
        // Added a moment ago by another request: continue with that one.
        problem = await Problem.findOne({ user: req.userId, slug: sub.slug });
        if (!problem) throw err;
        if (problem.lastSubmissionId === sub.submissionId) return respond(problem, 'duplicate');
      }
    }

    // A tracked problem: the latest accepted code replaces the saved code; notes stay.
    const effect = applyLeetCodeSolve(problem, acceptedAt);
    keepCode(problem);
    if (effect) await saveSolve(problem, effect, acceptedAt);
    else await problem.save();
    respond(problem, effect ?? 'resolved');
  });

  return router;
}
