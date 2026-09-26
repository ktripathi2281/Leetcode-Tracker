import { Schema, model } from 'mongoose';
import { REVIEW_INTERVALS_DAYS } from '@lct/shared';
import { Activity } from '../models/Activity.js';
import { Problem } from '../models/Problem.js';
import { DAY_MS } from './time.js';

// One-off data fixes for data saved by older versions. Each runs once per database,
// recorded by name; each is also safe to re-run, in case two servers start at once.

const Migration = model(
  'Migration',
  new Schema({
    name: { type: String, required: true, unique: true },
    ranAt: { type: Date, required: true },
    changed: { type: Number, required: true },
  }),
);

/** Schedules a first review for solved problems saved before spaced repetition existed. */
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

/**
 * Rebuilds approximate history for problems solved before the activity log existed,
 * from what each problem remembers: its last solve, and its last review.
 */
export async function backfillActivity(): Promise<number> {
  const logged = new Set((await Activity.distinct('problem')).map(String));
  const problems = await Problem.find({ lastSolvedAt: { $ne: null } }).lean();

  const entries = problems
    .filter((p) => !logged.has(String(p._id)))
    .flatMap((p) => {
      const base = { user: p.user, problem: p._id, difficulty: p.difficulty, tags: p.tags };
      const solvedAt = p.lastSolvedAt!;
      const reviewedAt = p.lastReviewedAt;
      // A successful review sets both dates to the same moment; a later review date means "needed help".
      if (reviewedAt && reviewedAt.getTime() === solvedAt.getTime()) {
        return [{ ...base, kind: 'review', outcome: 'remembered', at: reviewedAt }];
      }
      const solve = { ...base, kind: 'solve', outcome: null, at: solvedAt };
      return reviewedAt && reviewedAt > solvedAt ? [solve, { ...base, kind: 'review', outcome: 'forgot', at: reviewedAt }] : [solve];
    });

  if (entries.length > 0) await Activity.insertMany(entries);
  return entries.length;
}

const MIGRATIONS = [
  { name: '2026-09-schedule-first-reviews', run: backfillReviewSchedules },
  { name: '2026-09-activity-from-solve-dates', run: backfillActivity },
];

export async function runMigrations() {
  for (const { name, run } of MIGRATIONS) {
    if (await Migration.exists({ name })) continue;
    const changed = await run();
    await Migration.updateOne({ name }, { $setOnInsert: { ranAt: new Date(), changed } }, { upsert: true });
    console.log(`Migration ${name}: ${changed} changed`);
  }
}
