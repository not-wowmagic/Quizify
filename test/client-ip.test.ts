import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveClientIp, SHARED_IP_BUCKET, type HeaderReader } from '@/lib/rate-limit';

function headersOf(values: Record<string, string>): HeaderReader {
  const store = new Map(
    Object.entries(values).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return { get: name => store.get(name.toLowerCase()) ?? null };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolveClientIp', () => {
  it('prefers x-nf-client-connection-ip over anything else', () => {
    expect(
      resolveClientIp(
        headersOf({
          'x-nf-client-connection-ip': '203.0.113.5',
          'x-real-ip': '198.51.100.2',
          'x-forwarded-for': '192.0.2.10',
        }),
      ),
    ).toBe('203.0.113.5');
  });

  it('ignores forged X-Forwarded-For and uses the shared bucket', () => {
    expect(resolveClientIp(headersOf({ 'x-forwarded-for': '203.0.113.9' }))).toBe(SHARED_IP_BUCKET);
  });

  it('does not let different forged XFF values mint different buckets', () => {
    const first = resolveClientIp(headersOf({ 'x-forwarded-for': '203.0.113.9' }));
    const second = resolveClientIp(headersOf({ 'x-forwarded-for': '198.51.100.9' }));

    expect(first).toBe(SHARED_IP_BUCKET);
    expect(second).toBe(SHARED_IP_BUCKET);
  });

  it('uses x-real-ip only as the documented non-Netlify fallback', () => {
    expect(resolveClientIp(headersOf({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('falls back to the shared bucket when no usable IP headers are present', () => {
    expect(resolveClientIp(headersOf({}))).toBe(SHARED_IP_BUCKET);
  });

  it('rejects a malformed Netlify header without using XFF', () => {
    expect(
      resolveClientIp(
        headersOf({
          'x-nf-client-connection-ip': 'not-an-ip',
          'x-forwarded-for': '203.0.113.9',
        }),
      ),
    ).toBe(SHARED_IP_BUCKET);
  });
});

describe('missing client-IP warnings', () => {
  it('warns once and names the missing header when using the shared bucket', async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { resolveClientIp: freshResolveClientIp } = await import('@/lib/rate-limit');

    freshResolveClientIp(headersOf({}));
    freshResolveClientIp(headersOf({}));

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
