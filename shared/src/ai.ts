import { z } from 'zod';

export const AGENTS = ['post-mortem', 'tutor', 'planner'] as const;
export type AgentName = (typeof AGENTS)[number];

export const AGENT_LABELS: Record<AgentName, string> = {
  'post-mortem': 'Solution post-mortem',
  tutor: 'Socratic tutor',
  planner: 'Weekly planner',
};

/** Uses per user per day (UTC), to keep the Gemini bill bounded. */
export const AGENT_DAILY_LIMITS: Record<AgentName, number> = {
  'post-mortem': 20,
  tutor: 60,
  planner: 5,
};

export interface AgentUsage {
  agent: AgentName;
  used: number;
  limit: number;
  /** When the daily count resets (midnight UTC). */
  resetsAt: string;
}

// ─── Post-mortem ──────────────────────────────────────────────────────────────

export interface PostMortem {
  timeComplexity: string;
  spaceComplexity: string;
  isOptimal: boolean;
  /** What the solution does well and where it falls short, in a few sentences. */
  assessment: string;
  /** A better approach, if there is one. */
  betterApproach: string | null;
  /** Inputs the code may get wrong. */
  edgeCases: string[];
  /** One sentence to remember next time. */
  keyTakeaway: string;
  analyzedAt: string;
  /** False once the code has changed since the analysis. */
  current: boolean;
}

// ─── Tutor ────────────────────────────────────────────────────────────────────

export const TUTOR_MAX_MESSAGES = 30;
export const TUTOR_MAX_MESSAGE_LENGTH = 2_000;

export const tutorMessageSchema = z.object({
  role: z.enum(['user', 'tutor']),
  text: z.string().trim().min(1).max(TUTOR_MAX_MESSAGE_LENGTH, `Keep messages under ${TUTOR_MAX_MESSAGE_LENGTH} characters`),
});
export type TutorMessage = z.infer<typeof tutorMessageSchema>;

export const tutorRequestSchema = z.object({
  /** The conversation so far, ending with the student's new message. */
  messages: z
    .array(tutorMessageSchema)
    .min(1)
    .max(TUTOR_MAX_MESSAGES, 'This conversation is long. Start a new one to keep going.')
    .refine((m) => m.at(-1)?.role === 'user', 'The last message must be yours'),
  /** Whether the tutor may read the student's saved code. */
  includeCode: z.boolean().default(true),
});
export type TutorRequest = z.input<typeof tutorRequestSchema>;

export interface TutorReply {
  reply: string;
  usage: AgentUsage;
}

// ─── Weekly planner ───────────────────────────────────────────────────────────

export const weeklyPlanRequestSchema = z.object({
  minutesPerDay: z.number().int().min(15, 'At least 15 minutes').max(240, 'At most 4 hours').default(60),
});
export type WeeklyPlanRequest = z.input<typeof weeklyPlanRequestSchema>;

export const PLAN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const PLAN_TASK_KINDS = ['review', 'practice', 'new'] as const;

export interface PlanTask {
  kind: (typeof PLAN_TASK_KINDS)[number];
  title: string;
  /** A tracked problem (reviews, practice). */
  problemId: string | null;
  /** A LeetCode problem to try (new), verified to exist. */
  link: string | null;
  why: string;
}

export interface WeeklyPlan {
  id: string;
  createdAt: string;
  summary: string;
  focusTopics: { topic: string; why: string }[];
  days: { day: (typeof PLAN_DAYS)[number]; minutes: number; tasks: PlanTask[] }[];
}
