import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { parseLeetCodeInput, type ApiError } from '@lct/shared';
import { requireAuth } from '../middleware/auth.js';
import { LeetCodeUnavailableError, getLeetCodeProblem } from '../lib/leetcode.js';

export function leetCodeRouter({ lookupLimit }: { lookupLimit: number }) {
  const router = Router();
  router.use(requireAuth);

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: lookupLimit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many lookups. Please wait a minute.' } satisfies ApiError,
  });

  // GET /api/leetcode/problems/:slug — problem details for auto-filling the form
  router.get('/problems/:slug', limiter, async (req, res) => {
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
      if (err instanceof LeetCodeUnavailableError) {
        console.warn('LeetCode lookup failed:', err.cause);
        res
          .status(502)
          .json({ message: "Couldn't reach LeetCode. Fill in the details yourself, or try again later." } satisfies ApiError);
        return;
      }
      throw err;
    }
  });

  return router;
}
