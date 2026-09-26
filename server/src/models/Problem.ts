import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { DIFFICULTIES, LANGUAGE_IDS, PROBLEM_SOURCES, STATUSES, type Problem as ProblemDTO } from '@lct/shared';

const problemSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    // Derived from `link` when it points at leetcode.com; identifies the problem for sync and the extension.
    slug: { type: String, default: null },
    leetcodeNumber: { type: Number, default: null },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    status: { type: String, enum: STATUSES, default: 'Todo' },
    link: { type: String, default: '' },
    tags: { type: [String], default: [] },
    companyTags: { type: [String], default: [] },
    language: { type: String, enum: LANGUAGE_IDS, default: 'python' },
    code: { type: String, default: '' },
    approach: { type: String, default: '' },
    notes: { type: String, default: '' },
    timeTakenMinutes: { type: Number, default: null },
    lastSolvedAt: { type: Date, default: null },
    source: { type: String, enum: PROBLEM_SOURCES, default: 'manual' },
  },
  { timestamps: true },
);

// A user tracks each LeetCode problem at most once. Problems without a LeetCode link are exempt.
problemSchema.index(
  { user: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);
problemSchema.index({ user: 1, updatedAt: -1 });
problemSchema.index({ user: 1, status: 1 });
problemSchema.index({ user: 1, tags: 1 });
problemSchema.index({ user: 1, companyTags: 1 });

export type ProblemDoc = HydratedDocument<InferSchemaType<typeof problemSchema>>;

export const Problem = model('Problem', problemSchema);

export function toProblemDTO(p: ProblemDoc): ProblemDTO {
  return {
    id: p._id.toString(),
    title: p.title,
    slug: p.slug ?? null,
    leetcodeNumber: p.leetcodeNumber ?? null,
    difficulty: p.difficulty,
    status: p.status,
    link: p.link,
    tags: p.tags,
    companyTags: p.companyTags,
    language: p.language,
    code: p.code,
    approach: p.approach,
    notes: p.notes,
    timeTakenMinutes: p.timeTakenMinutes ?? null,
    lastSolvedAt: p.lastSolvedAt?.toISOString() ?? null,
    source: p.source,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
