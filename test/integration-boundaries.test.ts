import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Response } from 'undici';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, rateLimitDeps, verifyTurnstile, type SiteverifyFetch } from '@/lib/rate-limit';
import { fetchPublicPage } from '@/lib/web-reader';
import { readSignedDeviceId, signDeviceId, resolveAuthoritativeDeviceId } from '@/lib/device-cookie';

let server: Server;
let siteverifyFetch: SiteverifyFetch;
let lastAction = '';

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => {
      body += String(chunk);
    });
    request.on('end', () => {
      const form = new URLSearchParams(body);
      lastAction = form.get('response') ?? '';
      const valid = lastAction === 'good-token';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        success: valid,
        hostname: valid ? 'quizify.netlify.app' : 'attacker.example',
        action: 'createQuiz',
      }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  // SAFETY: listen(0) on a real TCP socket always yields an AddressInfo.
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  siteverifyFetch = async (_url, init) => fetch(base, init);
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  rateLimitDeps.createLimiter = rateLimitDeps.defaultCreateLimiter;
});

describe('HTTP-level boundary integration', () => {
  it('enforces Turnstile through a real siteverify HTTP round trip', async () => {
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubEnv('TURNSTILE_EXPECTED_HOSTNAME', 'quizify.netlify.app');
    expect(await verifyTurnstile('good-token', 'createQuiz', siteverifyFetch)).toBe(true);
    expect(await verifyTurnstile('bad-token', 'createQuiz', siteverifyFetch)).toBe(false);
  });

  it('returns a retryable denial in production when the global limiter is missing', async () => {
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('NODE_ENV', 'production');
    const first = await checkRateLimit('quiz:integration', 30, 3_600_000, true);
    const second = await checkRateLimit('quiz:integration', 30, 3_600_000, true);
    expect(first.allowed).toBe(false);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSec).toBeGreaterThan(0);
  });

  it('reads a pinned page body through injected HTTP doubles', async () => {
    vi.stubEnv('E2E_MOCK_AI', '');
    const lookup = async () => [{ address: '93.184.215.14', family: 4 }];
    const pinnedFetch = async () => new Response('<html><body>pinned</body></html>', { status: 200 });
    const result = await fetchPublicPage('https://example.com/article', {
      lookup,
      fetch: pinnedFetch,
      // SAFETY: the fetch double opens no connection; the agent only needs close().
      createAgent: () => ({ close: async () => undefined }) as never,
    });
    expect(result.html).toContain('pinned');
    expect(result.finalUrl).toBe('https://example.com/article');
  });

  it('keeps device ownership when a forged client id is replayed', () => {
    const secret = 'integration-secret';
    const owner = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const attacker = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const cookie = signDeviceId(owner, secret);
    expect(readSignedDeviceId(cookie, secret)).toBe(owner);
    expect(resolveAuthoritativeDeviceId(readSignedDeviceId(cookie, secret), attacker)).toBe(owner);
  });
});
