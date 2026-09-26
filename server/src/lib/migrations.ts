import { REVIEW_INTERVALS_DAYS } from '@lct/shared';
import { Problem } from '../models/Problem.js';
import { DAY_MS } from './time.js';

/**
 * Schedules a first review for solved problems saved before spaced repetition existed.
 * Safe to run on every start: it only touches problems that have never had a schedule.
 * Returns how many were updated.
 */
export async function backfillReviewSchedules(): Promise<number> {
  // The raw driver runs this as one update pipeline and leaves updatedAt alone.
  const result = await Problem.collection.updateMany(
    { status: { $in: ['Solved', 'Reviewing'] }, nextReviewAt: { $exists: false } },
    [
      {
        $set: {
          reviewStep: 0,
          nextReviewAt: {
            $add: [{ $ifNull: ['$lastSolvedAt', '$updatedAt'] }, REVIEW_INTERVALS_DAYS[0] * DAY_MS],
          },
        },
      },
    ],
  );
  return result.modifiedCount;
}
