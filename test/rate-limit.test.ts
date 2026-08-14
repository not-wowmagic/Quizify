import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, TtlCache, hashPayload } from '@/lib/rate-limit';

describe('checkRateLimit (fixed window)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('quiz:ip1', 5, 60_000).allowed).toBe(true);
    }
  });

  it('blocks once the limit is exceeded', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('quiz:ip1', 5, 60_000);
    const blocked = checkRateLimit('quiz:ip1', 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('quiz:ip1', 5, 60_000);
    vi.setSystemTime(new Date('2026-08-14T12:01:00Z'));
    expect(checkRateLimit('quiz:ip1', 5, 60_000).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    checkRateLimit('quiz:ip1', 1, 60_000);
    expect(checkRateLimit('quiz:ip2', 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit('quiz:ip1', 1, 60_000).allowed).toBe(false);
  });
});

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new TtlCache<string>(10, 60_000);
    cache.set('a', 'value');
    expect(cache.get('a')).toBe('value');
  });

  it('expires entries after the TTL', () => {
    const cache = new TtlCache<string>(10, 60_000);
    cache.set('a', 'value');
    vi.setSystemTime(new Date('2026-08-14T12:01:01Z'));
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<string>(2, 60_000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });
});

describe('hashPayload', () => {
  it('is deterministic and stable', () => {
    const payload = { text: 'hello world', n: 10 };
    expect(hashPayload(payload)).toBe(hashPayload(payload));
    expect(hashPayload(payload)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different payloads', () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});
