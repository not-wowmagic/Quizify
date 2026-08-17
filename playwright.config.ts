import { defineConfig, devices } from '@playwright/test';

const PORT = 9003;
const BASE_URL = `http://localhost:${PORT}`;
// The readiness probe only answers 2xx when the server was started with
// E2E_MOCK_AI=1, so a stale unmocked server on this port can never be
// (re)used — the run fails fast at startup instead of hanging per test.
const MOCK_STATUS_URL = `${BASE_URL}/api/e2e-mock-status`;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production build: every route serves instantly with no per-route dev
    // compilation. Rebuilds are incremental via the persisted .next-e2e cache.
    // Set E2E_DEV_SERVER=1 to fall back to `next dev` (warm-cache iteration).
    command:
      process.env.E2E_DEV_SERVER === '1'
        ? `npx next dev -p ${PORT}`
        : `npx next build && npx next start -p ${PORT}`,
    url: MOCK_STATUS_URL,
    reuseExistingServer: !process.env.CI,
    // Generous enough to cover a cold `next build` on Windows.
    timeout: 240_000,
    env: {
      ...process.env,
      E2E_MOCK_AI: '1',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
      NEXT_E2E_DIST_DIR: '.next-e2e',
    },
    stdout: 'pipe',
  },
});
