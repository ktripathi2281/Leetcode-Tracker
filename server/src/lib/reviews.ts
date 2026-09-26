import { REVIEW_INTERVALS_DAYS, type ReviewOutcome, type Status } from '@lct/shared';
import type { ProblemDoc } from '../models/Problem.js';
import { addDays } from './time.js';

// All spaced-repetition rules live here, so manual edits, reviews and LeetCode sync agree.
//
//   Todo / Attempted  → not scheduled
//   Solved / Reviewing → scheduled: nextReviewAt = last success + REVIEW_INTERVALS_DAYS[reviewStep]
//   Mastered          → not scheduled (passed every interval, or marked by hand)

const SOLVED: ReadonlySet<Status> = new Set(['Solved', 'Mastered']);

/** Solved at `at`: first review a day later. */
export function scheduleFromSolve(problem: ProblemDoc, at: Date) {
  problem.lastSolvedAt = at;
  problem.reviewStep = 0;
  problem.nextReviewAt = addDays(at, REVIEW_INTERVALS_DAYS[0]);
}

/**
 * Applies a status the user chose, keeping the schedule consistent with it.
 * Call before other fields are set, while `problem.status` is still the old value.
 */
export function applyStatusChange(problem: ProblemDoc, next: Status, now: Date) {
  const previous = problem.status;
  if (next === previous) return;

  if (next === 'Todo' || next === 'Attempted') {
    problem.nextReviewAt = null;
    problem.reviewStep = 0;
  } else if (next === 'Mastered') {
    if (!SOLVED.has(previous)) problem.lastSolvedAt = now;
    problem.nextReviewAt = null;
  } else if (next === 'Solved') {
    // Newly solved (or demoted from Mastered): start the intervals again.
    scheduleFromSolve(problem, now);
  } else if (next === 'Reviewing') {
    // Wants to review it: make it due now, keeping progress if it has any.
    problem.nextReviewAt = now;
  }
  problem.status = next;
}

/** The outcome of reviewing a scheduled problem at time `at`. */
export function recordReview(problem: ProblemDoc, outcome: ReviewOutcome, at: Date) {
  problem.lastReviewedAt = at;

  if (outcome === 'forgot') {
    problem.status = 'Reviewing';
    problem.reviewStep = 0;
    problem.nextReviewAt = addDays(at, REVIEW_INTERVALS_DAYS[0]);
    return;
  }

  problem.lastSolvedAt = at;
  const step = problem.reviewStep + 1;
  if (step >= REVIEW_INTERVALS_DAYS.length) {
    problem.status = 'Mastered';
    problem.reviewStep = REVIEW_INTERVALS_DAYS.length;
    problem.nextReviewAt = null;
  } else {
    problem.status = 'Reviewing';
    problem.reviewStep = step;
    problem.nextReviewAt = addDays(at, REVIEW_INTERVALS_DAYS[step]!);
  }
}

export const isScheduled = (problem: ProblemDoc) =>
  (problem.status === 'Solved' || problem.status === 'Reviewing') && problem.nextReviewAt !== null;
