import { z } from 'zod';

// Load server/.env if present (not in tests). In production, variables come from the host instead.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — fine.
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  // Where the website runs, for CORS. Several allowed, comma-separated; the first is the main one.
  CLIENT_URL: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),
  // Proxies in front of the server (1 on Render), so rate limits see real client IPs. 0 locally.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Required to start the server; tests use an in-memory database instead.
  MONGODB_URI: z.string().startsWith('mongodb').optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // Email (password reset) via Resend. Without a key, emails are printed to the log instead.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('LeetCode Tracker <onboarding@resend.dev>'),
  GEMINI_API_KEY: z.string().optional(),
  // A pinned model, not a "-latest" alias, so behaviour only changes when this does.
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  // Tried when the main model stays overloaded after retries. Empty to disable.
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash'),
  // Minimum gap between requests to LeetCode, to stay well clear of its limits.
  LEETCODE_REQUEST_GAP_MS: z.coerce.number().int().min(0).default(300),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

/** The website's main address, for links in emails. */
export const appUrl = env.CLIENT_URL[0]!;
