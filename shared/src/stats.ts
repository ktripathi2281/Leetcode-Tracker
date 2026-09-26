export const ACTIVITY_KINDS = ['solve', 'review'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Weeks of history on the analytics page. */
export const ACTIVITY_WEEKS = 12;
/** Window for "needed help" counts per topic. */
export const STRUGGLE_WINDOW_DAYS = 90;

export interface ActivityDay {
  /** Local calendar date in the user's time zone, YYYY-MM-DD. */
  date: string;
  solves: number;
  reviews: number;
}

export interface ActivityStats {
  /** Every day from a Monday ACTIVITY_WEEKS - 1 weeks ago through today, oldest first. */
  days: ActivityDay[];
  /** Consecutive days with a solve or review, ending today (or yesterday, if today is still empty). */
  currentStreak: number;
  /** Longest run in the last year. */
  longestStreak: number;
}

export interface TopicStats {
  topic: string;
  total: number;
  /** Todo or Attempted. */
  unsolved: number;
  /** Solved or Reviewing. */
  practicing: number;
  mastered: number;
  /** Reviews answered "I needed help" in the last STRUGGLE_WINDOW_DAYS. */
  neededHelp: number;
}

export interface CompanyStats {
  company: string;
  total: number;
  /** Solved, Reviewing or Mastered. */
  solved: number;
}
