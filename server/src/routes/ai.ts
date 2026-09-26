import { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { isValidObjectId } from 'mongoose';
import {
  AGENT_LABELS,
  tutorRequestSchema,
  weeklyPlanRequestSchema,
  type AgentUsage,
  type ApiError,
  type TutorReply,
  type WeeklyPlan,
} from '@lct/shared';
import type { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Problem, codeHash, toProblemDTO } from '../models/Problem.js';
import { AiNotConfiguredError, AiUnavailableError } from '../lib/ai/client.js';
import { AiOutputError, runAgent } from '../lib/ai/run.js';
import { UsageLimitError, getUsage } from '../lib/ai/usage.js';
import { analyzeSolution } from '../lib/ai/postMortem.js';
import { tutorReply } from '../lib/ai/tutor.js';
import { planWeek } from '../lib/ai/planner.js';
import { validateBody } from '../middleware/validate.js';
import { AgentLog } from '../models/AgentLog.js';

function hoursUntil(iso: string) {
  return Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 3_600_000));
}

/** Turns AI failures into clear responses; anything else goes to the general error handler. */
function sendAiError(err: unknown, res: Response, next: NextFunction) {
  const send = (status: number, message: string, extra: object = {}) =>
    res.status(status).json({ message, ...extra } satisfies ApiError & object);

  if (err instanceof UsageLimitError) {
    const { agent, limit, resetsAt } = err.usage;
    return send(
      429,
      `You've used all ${limit} ${AGENT_LABELS[agent].toLowerCase()} runs for today. More in ${hoursUntil(resetsAt)} hours.`,
      { usage: err.usage },
    );
  }
  if (err instanceof AiNotConfiguredError) return send(503, "AI features aren't set up on this server yet.");
  if (err instanceof AiUnavailableError) return send(502, 'Gemini is busy right now. Please try again in a minute.');
  if (err instanceof AiOutputError) return send(502, "The AI's answer came back garbled. Please try again.");
  next(err);
}

async function findOwnProblem(req: Request) {
  const id = req.params.problemId;
  if (typeof id !== 'string' || !isValidObjectId(id)) return null;
  return Problem.findOne({ _id: id, user: req.userId });
}

const problemNotFound = (res: Response) => res.status(404).json({ message: 'Problem not found' } satisfies ApiError);

export function aiRouter({ burstLimit }: { burstLimit: number }) {
  const router = Router();
  router.use(requireAuth);

  // Daily limits bound the cost; this stops a runaway client hammering the endpoints.
  const burst = rateLimit({
    windowMs: 60 * 1000,
    limit: burstLimit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Slow down a little. Try again in a minute.' } satisfies ApiError,
  });

  // GET /api/ai/usage — today's use of each agent
  router.get('/usage', async (req, res) => {
    const usage: AgentUsage[] = await getUsage(req.userId!);
    res.json(usage);
  });

  // POST /api/ai/post-mortem/:problemId — analyze the saved solution
  router.post('/post-mortem/:problemId', burst, async (req, res, next) => {
    const problem = await findOwnProblem(req);
    if (!problem) return problemNotFound(res);
    if (!problem.code.trim()) {
      res.status(400).json({ message: 'Add your solution code first.' } satisfies ApiError);
      return;
    }

    try {
      const { result, usage } = await runAgent(
        {
          user: req.userId!,
          agent: 'post-mortem',
          problem: problem._id,
          input: { problem: problem.title, language: problem.language, codeLines: problem.code.split('\n').length },
        },
        (run) => analyzeSolution(run, problem),
      );
      problem.postMortem = { ...result, analyzedAt: new Date(), codeHash: codeHash(problem.code, problem.language) };
      await problem.save();
      res.json({ problem: toProblemDTO(problem), usage });
    } catch (err) {
      sendAiError(err, res, next);
    }
  });

  // POST /api/ai/tutor/:problemId — the tutor's next reply in a hint conversation
  router.post('/tutor/:problemId', burst, validateBody(tutorRequestSchema), async (req, res, next) => {
    const problem = await findOwnProblem(req);
    if (!problem) return problemNotFound(res);
    const { messages, includeCode } = req.body as z.output<typeof tutorRequestSchema>;

    try {
      const { result, usage } = await runAgent(
        {
          user: req.userId!,
          agent: 'tutor',
          problem: problem._id,
          input: { problem: problem.title, message: messages.at(-1)!.text, turn: messages.length, includeCode },
        },
        (run) => tutorReply(run, problem, messages, includeCode),
      );
      res.json({ reply: result, usage } satisfies TutorReply);
    } catch (err) {
      sendAiError(err, res, next);
    }
  });

  // POST /api/ai/weekly-plan — plan the next 7 days from the user's data
  router.post('/weekly-plan', burst, validateBody(weeklyPlanRequestSchema), async (req, res, next) => {
    const { minutesPerDay } = req.body as z.output<typeof weeklyPlanRequestSchema>;
    try {
      const { result, usage } = await runAgent({ user: req.userId!, agent: 'planner', input: { minutesPerDay } }, (run) =>
        planWeek(run, { user: req.userId!, timeZone: req.timeZone, now: new Date() }, minutesPerDay),
      );
      res.json({ plan: result, usage });
    } catch (err) {
      sendAiError(err, res, next);
    }
  });

  // GET /api/ai/weekly-plan/latest — the most recent plan, if any
  router.get('/weekly-plan/latest', async (req, res) => {
    const log = await AgentLog.findOne({ user: req.userId, agent: 'planner', status: 'ok' }).sort({ createdAt: -1 }).lean();
    res.json({ plan: (log?.output as WeeklyPlan | undefined) ?? null });
  });

  return router;
}
