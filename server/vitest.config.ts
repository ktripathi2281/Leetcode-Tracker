import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      BCRYPT_ROUNDS: '4', // fast hashing in tests
      LEETCODE_REQUEST_GAP_MS: '0',
    },
    setupFiles: ['./test/setup.ts'],
    // The first run downloads a MongoDB binary for the in-memory database.
    hookTimeout: 120_000,
  },
});
