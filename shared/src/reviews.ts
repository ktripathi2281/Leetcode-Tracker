import { z } from 'zod';
import type { Difficulty, Status } from './constants';

/**
 * Days until the next review, by review step. A solved problem starts at step 0
 * (review in 1 day); each successful review moves one step on. Passing the last
 * step marks the problem Mastered.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60] as const;

export const REVIEW_OUTCOMES = ['remembered', 'forgot'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const reviewSchema = z.object({ outcome: z.enum(REVIEW_OUTCOMES, 'Choose how the review went') });
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Header the client sends so "due today" follows the user's own calendar day. */
export const TIMEZONE_HEADER = 'X-Timezone';

export interface StatsSummary {
  total: number;
  byStatus: Record<Status, number>;
  byDifficulty: Record<Difficulty, { total: number; solved: number }>;
  /** Due by the end of the user's today. */
  dueNow: number;
  /** Due within the next 7 days, including today. */
  dueThisWeek: number;
  /** Problems with a solve in the last 7 days. */
  solvedThisWeek: number;
}
