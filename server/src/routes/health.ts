import { Router } from 'express';
import type { HealthResponse } from '@lct/shared';
import { dbStatus } from '../config/db.js';

const router = Router();

router.get('/', (_req, res) => {
  const body: HealthResponse = { status: 'ok', db: dbStatus(), timestamp: new Date().toISOString() };
  res.json(body);
});

export default router;
