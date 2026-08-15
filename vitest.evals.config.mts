import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

// OPT-IN live LLM eval suite: `npm run evals`.
// Uses real API keys — deliberately separate from the default `npm test`
// run, which must never make network calls.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      'server-only': path.resolve(root, 'test/shims/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/evals/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
