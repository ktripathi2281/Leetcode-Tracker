import { mongo, type Types } from 'mongoose';
import { SYNC_WINDOW_DAYS, type SyncResult } from '@lct/shared';
import { Problem } from '../models/Problem.js';
import { getLeetCodeProblems, getRecentAcceptedSolves } from './leetcode.js';
import { isScheduled, recordReview, scheduleFromSolve } from './reviews.js';
import { DAY_MS } from './time.js';

/** A LeetCode re-solve this close before the review is due still counts as the review ("due today"). */
const EARLY_REVIEW_MS = 12 * 60 * 60 * 1000;

/**
 * Imports the user's recent LeetCode solves from the last SYNC_WINDOW_DAYS.
 * New problems are created as Solved and scheduled for review from their solve date.
 * Tracked ones become Solved (if Todo/Attempted); re-solving a problem that's due for
 * review counts as a successful review. Running it twice changes nothing the second time.
 * Throws LeetCodeUnavailableError if LeetCode can't be reached; nothing is saved then.
 */
export async function syncLeetCodeSolves(userId: Types.ObjectId, username: string): Promise<SyncResult> {
  const solves = await getRecentAcceptedSolves(username);

  // The same problem can appear several times; keep its newest solve.
  const latest = new Map<string, Date>();
  for (const { slug, solvedAt } of solves) {
    const seen = latest.get(slug);
    if (!seen || solvedAt > seen) latest.set(slug, solvedAt);
  }

  const cutoff = Date.now() - SYNC_WINDOW_DAYS * DAY_MS;
  const recent = [...latest].filter(([, solvedAt]) => solvedAt.getTime() >= cutoff);
  const tooOld = latest.size - recent.length;

  const slugs = recent.map(([slug]) => slug);
  const tracked = new Map((await Problem.find({ user: userId, slug: { $in: slugs } })).map((p) => [p.slug, p]));
  const newSlugs = slugs.filter((s) => !tracked.has(s));
  const details = newSlugs.length > 0 ? await getLeetCodeProblems(newSlugs) : new Map();

  const result: SyncResult = { added: 0, updated: 0, unchanged: 0, tooOld, failed: 0, syncedAt: '' };

  for (const [slug, solvedAt] of recent) {
    const problem = tracked.get(slug);
    if (problem) {
      let changed = true;
      if (problem.status === 'Todo' || problem.status === 'Attempted') {
        problem.status = 'Solved';
        scheduleFromSolve(problem, solvedAt);
      } else if (isScheduled(problem) && solvedAt.getTime() >= problem.nextReviewAt!.getTime() - EARLY_REVIEW_MS) {
        recordReview(problem, 'remembered', solvedAt);
      } else if (!problem.lastSolvedAt || problem.lastSolvedAt < solvedAt) {
        problem.lastSolvedAt = solvedAt;
      } else {
        changed = false;
      }
      if (changed) {
        await problem.save();
        result.updated++;
      } else {
        result.unchanged++;
      }
      continue;
    }

    const info = details.get(slug);
    if (!info) {
      result.failed++;
      continue;
    }
    try {
      const created = new Problem({
        user: userId,
        title: info.title,
        slug,
        leetcodeNumber: info.leetcodeNumber,
        difficulty: info.difficulty,
        tags: info.tags,
        link: info.link,
        status: 'Solved',
        source: 'sync',
      });
      scheduleFromSolve(created, solvedAt);
      await created.save();
      result.added++;
    } catch (err) {
      // Added by a request that ran at the same time.
      if (err instanceof mongo.MongoServerError && err.code === 11000) result.unchanged++;
      else throw err;
    }
  }

  result.syncedAt = new Date().toISOString();
  return result;
}
