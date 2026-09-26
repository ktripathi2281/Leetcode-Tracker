import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import healthRoutes from './routes/health.js';
import problemRoutes from './routes/problems.js';
import statsRoutes from './routes/stats.js';
import { authRouter } from './routes/auth.js';
import { leetCodeRouter } from './routes/leetcode.js';
import { aiRouter } from './routes/ai.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { timeZone } from './middleware/timezone.js';

export interface AppOptions {
  /** Max login/register attempts per IP per 15 minutes. */
  authRateLimit?: number;
  /** Max LeetCode lookups per user per minute. */
  leetCodeLookupLimit?: number;
  /** Max AI requests per user per minute (on top of the daily limits). */
  aiBurstLimit?: number;
}

// Builds the Express app without starting it, so tests can use it directly.
export function createApp({ authRateLimit = 20, leetCodeLookupLimit = 30, aiBurstLimit = 10 }: AppOptions = {}) {
  const app = express();

  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(timeZone);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRouter({ rateLimit: authRateLimit }));
  app.use('/api/problems', problemRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/leetcode', leetCodeRouter({ lookupLimit: leetCodeLookupLimit }));
  app.use('/api/ai', aiRouter({ burstLimit: aiBurstLimit }));

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
