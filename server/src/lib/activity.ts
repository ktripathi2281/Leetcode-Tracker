import type { ReviewOutcome } from '@lct/shared';
import { Activity } from '../models/Activity.js';
import type { ProblemDoc } from '../models/Problem.js';

/** Records a solve, or a review with its outcome, in the user's history. */
export async function logActivity(problem: ProblemDoc, at: Date, outcome?: ReviewOutcome) {
  await Activity.create({
    user: problem.user,
    problem: problem._id,
    kind: outcome ? 'review' : 'solve',
    outcome: outcome ?? null,
    difficulty: problem.difficulty,
    tags: problem.tags,
    at,
  });
}
