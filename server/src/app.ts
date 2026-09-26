import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import healthRoutes from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';

export interface AppOptions {
  /** Max login/register attempts per IP per 15 minutes. */
  authRateLimit?: number;
}

// Builds the Express app without starting it, so tests can use it directly.
export function createApp({ authRateLimit = 20 }: AppOptions = {}) {
  const app = express();

  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRouter({ rateLimit: authRateLimit }));

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
