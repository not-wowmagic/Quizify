import { NextResponse } from 'next/server';

// Readiness probe for the Playwright e2e suite (playwright.config.ts webServer.url).
// Answers 2xx only when the server process was started with E2E_MOCK_AI=1, so a
// stale unmocked server on the e2e port can never be (re)used — the run fails
// fast at startup instead of hanging per test.
export const dynamic = 'force-dynamic';

export function GET() {
  if (process.env.E2E_MOCK_AI === '1') {
    return NextResponse.json({ mocked: true });
  }
  return NextResponse.json({ mocked: false }, { status: 404 });
}