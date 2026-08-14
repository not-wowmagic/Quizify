import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // Next.js 'server-only' module throws outside RSC; stub it for tests
      'server-only': path.resolve(root, 'test/shims/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
