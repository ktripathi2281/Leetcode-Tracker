import { z } from 'zod';

/** Only solves from this many days back are imported. */
export const SYNC_WINDOW_DAYS = 90;
/** Opening the app syncs automatically if the last sync is older than this. */
export const AUTO_SYNC_AFTER_HOURS = 12;
/** LeetCode's public data only lists this many recent accepted solves. */
export const LEETCODE_RECENT_LIMIT = 20;

export const leetCodeUsernameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your LeetCode username')
  .max(50, 'That username is too long')
  .regex(/^[A-Za-z0-9_.-]+$/, 'LeetCode usernames only use letters, numbers, _, - and .');

export const connectLeetCodeSchema = z.object({ username: leetCodeUsernameSchema });
export type ConnectLeetCodeInput = z.infer<typeof connectLeetCodeSchema>;

export const syncRequestSchema = z.object({
  /** Background sync on app open: skipped if the last sync is recent. */
  auto: z.boolean().default(false),
});

export interface SyncResult {
  /** New problems created from LeetCode solves. */
  added: number;
  /** Tracked problems marked Solved or given a newer solve date. */
  updated: number;
  /** Solves already reflected in the tracker. */
  unchanged: number;
  /** Solves older than the sync window. */
  tooOld: number;
  /** Solves whose problem details LeetCode didn't return. */
  failed: number;
  syncedAt: string;
}

export interface LeetCodeAccount {
  username: string | null;
  lastSyncedAt: string | null;
  lastResult: SyncResult | null;
}

export type SyncResponse =
  | { status: 'synced'; result: SyncResult }
  /** Auto-sync only: the last sync was recent enough (or one is running). */
  | { status: 'fresh' }
  /** Auto-sync only: no LeetCode account connected. */
  | { status: 'not-connected' };
