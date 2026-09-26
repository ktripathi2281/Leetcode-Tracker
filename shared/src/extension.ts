import { z } from 'zod';
import type { Language } from './constants';

// ─── Access tokens ────────────────────────────────────────────────────────────

/** Tokens start with this, so they're recognizable (and findable by secret scanners). */
export const API_TOKEN_PREFIX = 'lct_';
export const MAX_TOKENS_PER_USER = 10;

export const createTokenSchema = z.object({
  name: z.string().trim().min(1, 'Name the token, e.g. "Chrome on my laptop"').max(60),
});

export interface ApiTokenSummary {
  id: string;
  name: string;
  /** The first characters, to tell tokens apart; the rest is never shown again. */
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedToken extends ApiTokenSummary {
  /** The full token. Returned once, at creation. */
  token: string;
}

// ─── Submissions from the extension ───────────────────────────────────────────

/** LeetCode's language identifiers mapped to the tracker's. */
const LEETCODE_LANGUAGES: Record<string, Language> = {
  python: 'python',
  python3: 'python',
  pythondata: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'csharp',
  golang: 'go',
  go: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  scala: 'scala',
  php: 'php',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
  postgresql: 'sql',
};

export const toTrackerLanguage = (leetcodeLang: string): Language => LEETCODE_LANGUAGES[leetcodeLang.toLowerCase()] ?? 'other';

export const extensionSubmissionSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Not a LeetCode problem slug').max(120),
  /** LeetCode's submission id; makes a resend harmless. */
  submissionId: z.string().trim().min(1).max(40),
  /** LeetCode's language identifier, e.g. "python3". */
  lang: z.string().trim().min(1).max(30),
  code: z.string().min(1).max(50_000),
  /** When LeetCode accepted it; defaults to now. */
  acceptedAt: z.iso.datetime().optional(),
  runtime: z.string().max(40).optional(),
  memory: z.string().max(40).optional(),
});
export type ExtensionSubmission = z.infer<typeof extensionSubmissionSchema>;

export interface ExtensionSubmissionResult {
  problemId: string;
  title: string;
  /** What the submission did in the tracker. */
  outcome: 'added' | 'solved' | 'reviewed' | 'resolved' | 'duplicate';
}

export interface ExtensionMe {
  username: string;
}
