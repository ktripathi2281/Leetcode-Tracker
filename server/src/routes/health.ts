import { Router } from 'express';
import type { HealthResponse } from '@lct/shared';

const router = Router();

router.get('/', (_req, res) => {
  const body: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() };
  res.json(body);
});

export default router;
