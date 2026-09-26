import { Router, type Request, type Response } from 'express';
import { isValidObjectId, mongo, type QueryFilter, type SortOrder } from 'mongoose';
import {
  createProblemSchema,
  problemListQuerySchema,
  reviewSchema,
  slugFromLeetCodeUrl,
  updateProblemSchema,
  type ApiError,
  type CreateProblemInput,
  type ProblemFacets,
  type ProblemListResponse,
  type ProblemSort,
  type ReviewInput,
  type UpdateProblemInput,
} from '@lct/shared';
import { Problem, toProblemDTO, type ProblemDoc } from '../models/Problem.js';
import { requireAuth } from '../middleware/auth.js';
import { sendValidationError, validateBody } from '../middleware/validate.js';
import { applyStatusChange, isScheduled, recordReview } from '../lib/reviews.js';
import { logActivity } from '../lib/activity.js';
import { Activity } from '../models/Activity.js';
import { startOfNextLocalDay } from '../lib/time.js';

const router = Router();
router.use(requireAuth);

const SORTS: Record<ProblemSort, Record<string, SortOrder>> = {
  recent: { updatedAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  number: { leetcodeNumber: 1, _id: 1 },
  title: { title: 1, _id: 1 },
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notFound = (res: Response) => res.status(404).json({ message: 'Problem not found' } satisfies ApiError);

function findOwnProblem(req: Request) {
  const id = req.params.id;
  if (typeof id !== 'string' || !isValidObjectId(id)) return null;
  return Problem.findOne({ _id: id, user: req.userId });
}

// A second copy of the same LeetCode problem is rejected with a pointer to the existing one.
async function sendDuplicate(req: Request, res: Response, slug: string | null) {
  const existing = slug ? await Problem.findOne({ user: req.userId, slug }).select('_id') : null;
  const body: ApiError = { message: "You're already tracking this problem", existingId: existing?.id };
  res.status(409).json(body);
}

const isDuplicateKey = (err: unknown) => err instanceof mongo.MongoServerError && err.code === 11000;

// GET /api/problems — list with filters, search, sort and pagination
router.get('/', async (req, res) => {
  const parsed = problemListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { status, difficulty, tag, company, search, due, sort, page, limit } = parsed.data;

  const filter: QueryFilter<ProblemDoc> = { user: req.userId };
  if (status) filter.status = status;
  if (difficulty) filter.difficulty = difficulty;
  if (tag) filter.tags = tag;
  if (company) filter.companyTags = company;
  if (search) {
    const or: QueryFilter<ProblemDoc>[] = [{ title: { $regex: escapeRegex(search), $options: 'i' } }];
    const number = Number(search.replace(/^#/, ''));
    if (Number.isInteger(number) && number > 0) or.push({ leetcodeNumber: number });
    filter.$or = or;
  }
  if (due) filter.nextReviewAt = { $ne: null, $lt: startOfNextLocalDay(new Date(), req.timeZone) };

  const [total, problems] = await Promise.all([
    Problem.countDocuments(filter),
    Problem.find(filter)
      .sort(due ? { nextReviewAt: 1, _id: 1 } : SORTS[sort])
      .collation({ locale: 'en' }) // case-insensitive title sort
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  const body: ProblemListResponse = {
    problems: problems.map(toProblemDTO),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
  res.json(body);
});

// GET /api/problems/facets — the user's tags and companies, for filter menus
router.get('/facets', async (req, res) => {
  const [tags, companies] = await Promise.all([
    Problem.distinct('tags', { user: req.userId }),
    Problem.distinct('companyTags', { user: req.userId }),
  ]);
  const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  const body: ProblemFacets = { tags: tags.sort(byName), companies: companies.sort(byName) };
  res.json(body);
});

// GET /api/problems/:id
router.get('/:id', async (req, res) => {
  const problem = await findOwnProblem(req);
  if (!problem) {
    notFound(res);
    return;
  }
  res.json(toProblemDTO(problem));
});

// POST /api/problems
router.post('/', validateBody(createProblemSchema), async (req, res) => {
  const input = req.body as CreateProblemInput;
  const slug = input.link ? slugFromLeetCodeUrl(input.link) : null;

  try {
    const { status = 'Todo', ...fields } = input;
    const now = new Date();
    const problem = new Problem({ ...fields, slug, user: req.userId });
    const solved = applyStatusChange(problem, status, now);
    await problem.save();
    if (solved) await logActivity(problem, now);
    res.status(201).json(toProblemDTO(problem));
  } catch (err) {
    if (isDuplicateKey(err)) return sendDuplicate(req, res, slug);
    throw err;
  }
});

// PATCH /api/problems/:id — only the fields sent are changed
router.patch('/:id', validateBody(updateProblemSchema), async (req, res) => {
  const problem = await findOwnProblem(req);
  if (!problem) {
    notFound(res);
    return;
  }

  const now = new Date();
  const { status, ...fields } = req.body as UpdateProblemInput;
  const solved = status ? applyStatusChange(problem, status, now) : false;
  problem.set(fields);
  if (fields.link !== undefined) problem.slug = fields.link ? slugFromLeetCodeUrl(fields.link) : null;

  try {
    await problem.save();
    if (solved) await logActivity(problem, now);
    res.json(toProblemDTO(problem));
  } catch (err) {
    if (isDuplicateKey(err)) return sendDuplicate(req, res, problem.slug ?? null);
    throw err;
  }
});

// POST /api/problems/:id/review — record how a spaced-repetition review went
router.post('/:id/review', validateBody(reviewSchema), async (req, res) => {
  const problem = await findOwnProblem(req);
  if (!problem) {
    notFound(res);
    return;
  }
  if (!isScheduled(problem)) {
    res.status(400).json({ message: 'This problem has no review scheduled' } satisfies ApiError);
    return;
  }
  const { outcome } = req.body as ReviewInput;
  const now = new Date();
  recordReview(problem, outcome, now);
  await problem.save();
  await logActivity(problem, now, outcome);
  res.json(toProblemDTO(problem));
});

// DELETE /api/problems/:id
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const result = isValidObjectId(id) ? await Problem.deleteOne({ _id: id, user: req.userId }) : null;
  if (!result?.deletedCount) {
    notFound(res);
    return;
  }
  // A problem added by mistake shouldn't leave solves behind in the charts.
  await Activity.deleteMany({ problem: id, user: req.userId });
  res.status(204).end();
});

export default router;
