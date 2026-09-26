import { Router } from 'express';
import { DIFFICULTIES, STATUSES, type Difficulty, type Status, type StatsSummary } from '@lct/shared';
import { Problem } from '../models/Problem.js';
import { requireAuth } from '../middleware/auth.js';
import { addDays, startOfNextLocalDay } from '../lib/time.js';

const router = Router();
router.use(requireAuth);

// GET /api/stats/summary — dashboard numbers
router.get('/summary', async (req, res) => {
  const user = req.userId; // an ObjectId, as aggregation $match needs
  const now = new Date();
  const endOfToday = startOfNextLocalDay(now, req.timeZone);
  const scheduledBefore = (date: Date) => ({ user, nextReviewAt: { $ne: null, $lt: date } });

  const [groups, dueNow, dueThisWeek, solvedThisWeek] = await Promise.all([
    Problem.aggregate<{ _id: { status: Status; difficulty: Difficulty }; count: number }>([
      { $match: { user } },
      { $group: { _id: { status: '$status', difficulty: '$difficulty' }, count: { $sum: 1 } } },
    ]),
    Problem.countDocuments(scheduledBefore(endOfToday)),
    Problem.countDocuments(scheduledBefore(addDays(endOfToday, 6))),
    Problem.countDocuments({ user, lastSolvedAt: { $gte: addDays(now, -7) } }),
  ]);

  const summary: StatsSummary = {
    total: 0,
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatsSummary['byStatus'],
    byDifficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, { total: 0, solved: 0 }])) as StatsSummary['byDifficulty'],
    dueNow,
    dueThisWeek,
    solvedThisWeek,
  };
  for (const { _id, count } of groups) {
    summary.total += count;
    summary.byStatus[_id.status] += count;
    summary.byDifficulty[_id.difficulty].total += count;
    if (_id.status !== 'Todo' && _id.status !== 'Attempted') summary.byDifficulty[_id.difficulty].solved += count;
  }
  res.json(summary);
});

export default router;
