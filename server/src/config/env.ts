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
  CLIENT_URL: z.url().default('http://localhost:5173'),
  // Required to start the server; tests use an in-memory database instead.
  MONGODB_URI: z.string().startsWith('mongodb').optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  GEMINI_API_KEY: z.string().optional(),
  // Minimum gap between requests to LeetCode, to stay well clear of its limits.
  LEETCODE_REQUEST_GAP_MS: z.coerce.number().int().min(0).default(300),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
