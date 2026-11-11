import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { headerStore } = vi.hoisted(() => ({ headerStore: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => headerStore.get(name.toLowerCase()) ?? null,
  }),
}));

import { checkRateLimit, getClientIp, SHARED_IP_BUCKET } from '@/lib/rate-limit';

function setHeaders(values: Record<string, string>): void {
  headerStore.clear();
  for (const [name, value] of Object.entries(values)) {
    headerStore.set(name.toLowerCase(), value);
  }
}

beforeEach(() => {
  headerStore.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getClientIp', () => {
  it('prefers x-nf-client-connection-ip over X-Forwarded-For', async () => {
    setHeaders({
      'x-nf-client-connection-ip': '203.0.113.5',
      'x-forwarded-for': '198.51.100.1',
    });
    await expect(getClientIp()).resolves.toBe('203.0.113.5');
  });

  it('uses the rightmost XFF entry, so different forged prefixes share a bucket', async () => {
    setHeaders({ 'x-forwarded-for': 'forged-a, 203.0.113.9' });
    const first = await getClientIp();
    setHeaders({ 'x-forwarded-for': 'forged-b, 203.0.113.9' });
    const second = await getClientIp();

    expect(first).toBe('203.0.113.9');
    expect(second).toBe(first);
  });

  it('falls back to one shared bucket when no IP headers are present', async () => {
    setHeaders({});
    await expect(getClientIp()).resolves.toBe(SHARED_IP_BUCKET);
  });

  it('does not let a malformed header mint a bucket', async () => {
    setHeaders({ 'x-forwarded-for': 'not-an-ip' });
    await expect(getClientIp()).resolves.toBe(SHARED_IP_BUCKET);
  });

  it('ignores a malformed Netlify header and uses the rightmost valid XFF', async () => {
    setHeaders({
      'x-nf-client-connection-ip': 'not-an-ip',
      'x-forwarded-for': '1.2.3.4, 203.0.113.7',
    });
    await expect(getClientIp()).resolves.toBe('203.0.113.7');
  });
});

describe('missing Upstash warning', () => {
  it('warns once in production when Upstash is not configured', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { checkRateLimit: freshCheckRateLimit } = await import('@/lib/rate-limit');
    await freshCheckRateLimit('warn-test-1', 10, 60_000);
    await freshCheckRateLimit('warn-test-2', 10, 60_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/UPSTASH/);
  });
});
