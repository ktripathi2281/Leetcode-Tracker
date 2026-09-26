import type { Types } from 'mongoose';
import type { LeetCodeProblemInfo, ProblemSource } from '@lct/shared';
import { Problem, type ProblemDoc } from '../models/Problem.js';
import { logActivity } from './activity.js';
import { isScheduled, recordReview, scheduleFromSolve } from './reviews.js';

// What an accepted LeetCode solution means for the tracker, shared by username sync and
// the browser extension so both follow the same rules.

/** A LeetCode re-solve this close before the review is due still counts as the review ("due today"). */
const EARLY_REVIEW_MS = 12 * 60 * 60 * 1000;

export type SolveEffect = 'solved' | 'reviewed' | 'resolved';

/**
 * Applies a solve at `solvedAt` to a tracked problem, without saving:
 * - Todo/Attempted become Solved, scheduled for review from the solve;
 * - a problem due for review gets a successful review;
 * - otherwise a newer solve just updates the solve date.
 * Returns null if the solve is already reflected (so repeating it changes nothing).
 */
export function applyLeetCodeSolve(problem: ProblemDoc, solvedAt: Date): SolveEffect | null {
  if (problem.status === 'Todo' || problem.status === 'Attempted') {
    problem.status = 'Solved';
    scheduleFromSolve(problem, solvedAt);
    return 'solved';
  }
  if (isScheduled(problem) && solvedAt.getTime() >= problem.nextReviewAt!.getTime() - EARLY_REVIEW_MS) {
    recordReview(problem, 'remembered', solvedAt);
    return 'reviewed';
  }
  if (!problem.lastSolvedAt || problem.lastSolvedAt < solvedAt) {
    problem.lastSolvedAt = solvedAt;
    return 'resolved';
  }
  return null;
}

/** Saves the problem and records the solve (or review) in the activity history. */
export async function saveSolve(problem: ProblemDoc, effect: SolveEffect, solvedAt: Date) {
  await problem.save();
  await logActivity(problem, solvedAt, effect === 'reviewed' ? 'remembered' : undefined);
}

/** A new, unsaved Solved problem from LeetCode's details, scheduled from the solve. */
export function newSolvedProblem(user: Types.ObjectId, info: LeetCodeProblemInfo, solvedAt: Date, source: ProblemSource) {
  const problem = new Problem({
    user,
    title: info.title,
    slug: info.slug,
    leetcodeNumber: info.leetcodeNumber,
    difficulty: info.difficulty,
    tags: info.tags,
    link: info.link,
    status: 'Solved',
    source,
  });
  scheduleFromSolve(problem, solvedAt);
  return problem;
}
