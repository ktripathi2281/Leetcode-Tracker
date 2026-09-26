import { z } from 'zod';
import { DIFFICULTIES, LANGUAGE_IDS, STATUSES, type Difficulty, type Language, type Status } from './constants';

const tagList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(40, 'Tags must be at most 40 characters'))
    .max(max, `At most ${max} tags`)
    // Drop duplicates that differ only in case, keeping the first spelling.
    .transform((tags) => tags.filter((t, i) => tags.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i));

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine((s) => s === '' || /^https?:\/\/\S+$/i.test(s), 'Enter a full link starting with https://');

// No defaults here: updates must only touch the fields that were sent.
const problemFields = {
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
  leetcodeNumber: z.number().int().positive('Enter a positive number').max(100_000).nullable(),
  difficulty: z.enum(DIFFICULTIES, 'Choose a difficulty'),
  status: z.enum(STATUSES, 'Choose a status'),
  link: httpUrl,
  tags: tagList(20),
  companyTags: tagList(20),
  language: z.enum(LANGUAGE_IDS),
  code: z.string().max(50_000, 'Code must be at most 50,000 characters'),
  approach: z.string().max(5_000, 'Approach must be at most 5,000 characters'),
  notes: z.string().max(10_000, 'Notes must be at most 10,000 characters'),
  timeTakenMinutes: z.number().int().min(1, 'Enter at least 1 minute').max(1_440, 'At most 24 hours').nullable(),
};

/** Unknown fields (user, createdAt, ...) are stripped, so clients can't set them. */
const { title, difficulty, ...optionalFields } = problemFields;
export const createProblemSchema = z.object({ title, difficulty, ...z.object(optionalFields).partial().shape });
export type CreateProblemInput = z.infer<typeof createProblemSchema>;

export const updateProblemSchema = z
  .object(problemFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;

export const PROBLEM_SORTS = {
  recent: 'Recently updated',
  oldest: 'Oldest first',
  number: 'Problem number',
  title: 'Title A–Z',
} as const;
export type ProblemSort = keyof typeof PROBLEM_SORTS;

export const problemListQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  company: z.string().trim().min(1).max(40).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** Only problems due for review by the end of today, most overdue first (ignores sort). */
  due: z.stringbool().optional(),
  sort: z.enum(Object.keys(PROBLEM_SORTS) as [ProblemSort, ...ProblemSort[]]).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProblemListQuery = z.output<typeof problemListQuerySchema>;

export const PROBLEM_SOURCES = ['manual', 'sync'] as const;
export type ProblemSource = (typeof PROBLEM_SOURCES)[number];

export interface Problem {
  id: string;
  title: string;
  slug: string | null;
  leetcodeNumber: number | null;
  difficulty: Difficulty;
  status: Status;
  link: string;
  tags: string[];
  companyTags: string[];
  language: Language;
  code: string;
  approach: string;
  notes: string;
  timeTakenMinutes: number | null;
  /** When it was last solved (from LeetCode sync, or when marked Solved). */
  lastSolvedAt: string | null;
  /** How it got into the tracker. */
  source: ProblemSource;
  /** When the next spaced-repetition review is due; null if not scheduled (unsolved or Mastered). */
  nextReviewAt: string | null;
  /** Successful reviews in a row; indexes REVIEW_INTERVALS_DAYS. */
  reviewStep: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemListResponse {
  problems: Problem[];
  total: number;
  page: number;
  pages: number;
}

export interface ProblemFacets {
  tags: string[];
  companies: string[];
}
