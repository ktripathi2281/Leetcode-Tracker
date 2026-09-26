import { Schema, model } from 'mongoose';
import { ACTIVITY_KINDS, DIFFICULTIES, REVIEW_OUTCOMES } from '@lct/shared';

// One entry per solve or review, for charts over time. A problem only keeps its latest
// solve date, so this is the history. Difficulty and tags are copied in so charts
// don't need a join; they describe the problem as it was at the time.
const activitySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  problem: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  kind: { type: String, enum: ACTIVITY_KINDS, required: true },
  outcome: { type: String, enum: [...REVIEW_OUTCOMES, null], default: null },
  difficulty: { type: String, enum: DIFFICULTIES, required: true },
  tags: { type: [String], default: [] },
  at: { type: Date, required: true },
});

activitySchema.index({ user: 1, at: -1 });
activitySchema.index({ problem: 1 });

export const Activity = model('Activity', activitySchema);
