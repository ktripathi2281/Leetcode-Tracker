import { Schema, model } from 'mongoose';
import { DIFFICULTIES } from '@lct/shared';

// Shared cache of LeetCode problem details. A problem's title, number and tags don't change,
// so each one is fetched from LeetCode once and reused for every user.
const leetCodeProblemSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  leetcodeNumber: { type: Number, default: null },
  title: { type: String, required: true },
  difficulty: { type: String, enum: DIFFICULTIES, required: true },
  tags: { type: [String], default: [] },
  isPaidOnly: { type: Boolean, default: false },
  fetchedAt: { type: Date, default: Date.now },
});

export const LeetCodeProblem = model('LeetCodeProblem', leetCodeProblemSchema);
