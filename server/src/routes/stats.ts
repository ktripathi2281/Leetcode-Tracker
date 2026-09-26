import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getActivityStats, getCompanyStats, getSummary, getTopicStats } from '../lib/stats.js';

const router = Router();
router.use(requireAuth);

// GET /api/stats/summary — dashboard numbers
router.get('/summary', async (req, res) => {
  res.json(await getSummary(req.userId!, req.timeZone));
});

// GET /api/stats/activity — solves and reviews per day, with streaks
router.get('/activity', async (req, res) => {
  res.json(await getActivityStats(req.userId!, req.timeZone));
});

// GET /api/stats/topics — progress and struggles per topic
router.get('/topics', async (req, res) => {
  res.json(await getTopicStats(req.userId!));
});

// GET /api/stats/companies — readiness per company tag
router.get('/companies', async (req, res) => {
  res.json(await getCompanyStats(req.userId!));
});

export default router;
