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
  it('prefers x-nf-client-connection-ip over anything else', async () => {
    setHeaders({
      'x-nf-client-connection-ip': '203.0.113.5',
      'x-real-ip': '198.51.100.2',
      'x-forwarded-for': '192.0.2.10',
    });
    await expect(getClientIp()).resolves.toBe('203.0.113.5');
  });

  it('ignores forged X-Forwarded-For and uses the shared bucket', async () => {
    setHeaders({ 'x-forwarded-for': '203.0.113.9' });
    await expect(getClientIp()).resolves.toBe(SHARED_IP_BUCKET);
  });

  it('does not let different forged XFF values mint different buckets', async () => {
    setHeaders({ 'x-forwarded-for': '203.0.113.9' });
    const first = await getClientIp();
    setHeaders({ 'x-forwarded-for': '198.51.100.9' });
    const second = await getClientIp();

    expect(first).toBe(SHARED_IP_BUCKET);
    expect(second).toBe(SHARED_IP_BUCKET);
  });

  it('uses x-real-ip only as the documented non-Netlify fallback', async () => {
    setHeaders({ 'x-real-ip': '203.0.113.7' });
    await expect(getClientIp()).resolves.toBe('203.0.113.7');
  });

  it('falls back to the shared bucket when no usable IP headers are present', async () => {
    setHeaders({});
    await expect(getClientIp()).resolves.toBe(SHARED_IP_BUCKET);
  });

  it('rejects a malformed Netlify header without using XFF', async () => {
    setHeaders({
      'x-nf-client-connection-ip': 'not-an-ip',
      'x-forwarded-for': '203.0.113.9',
    });
    await expect(getClientIp()).resolves.toBe(SHARED_IP_BUCKET);
  });
});

describe('missing client-IP warnings', () => {
  it('warns once and names the missing header when using the shared bucket', async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getClientIp: freshGetClientIp } = await import('@/lib/rate-limit');

    setHeaders({});
    await freshGetClientIp();
    await freshGetClientIp();

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toMatch(/x-nf-client-connection-ip/);
    expect(message).toMatch(/shared client bucket/);
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
