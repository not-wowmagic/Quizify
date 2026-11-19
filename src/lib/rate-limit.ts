// src/lib/rate-limit.ts
import 'server-only';

import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting and caching for server actions.
 *
 * When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are configured, a
 * global sliding-window limiter (Upstash Redis) is used, which is safe across all
 * serverless instances. Otherwise it falls back to the lightweight
 * in-memory fixed-window limiter below (per-instance on serverless
 * platforms, which still stops naive abuse).
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();
const MAX_BUCKETS = 5000;

/**
 * Bucket used when the request has no trustworthy client address.
 *
 * Headerless callers are collectively throttled in this one bucket. That is a
 * deliberate availability trade: a missing header must not take the whole app
 * down, and it must not let a caller mint unlimited fresh buckets.
 */
export const SHARED_IP_BUCKET = 'unknown';

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

function checkRateLimitInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Lazy cleanup to bound memory usage
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}

// One limiter per (limit, window) combination; the sliding-window config is
// fixed at construction time. The minimal interface keeps the dependency
// replaceable without mocking the module.
export interface RateLimiterLike {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
}

const upstashLimiters = new Map<string, RateLimiterLike>();
let warnedMissingUpstash = false;
let warnedMissingNetlifyHeader = false;
let warnedSharedClientBucket = false;

function warnMissingUpstash(): void {
  if (process.env.NODE_ENV !== 'production' || warnedMissingUpstash) return;
  warnedMissingUpstash = true;
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not configured; ' +
      'paid endpoints deny requests in production, and local/E2E use the in-memory limiter.',
  );
}

function createUpstashLimiter(limit: number, windowSec: number): RateLimiterLike | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const key = `${limit}:${windowSec}`;
  let limiter = upstashLimiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    });
    upstashLimiters.set(key, limiter);
  }
  return limiter;
}

/** Swap only the limiter factory; tests exercise the real decision logic. */
export const rateLimitDeps = {
  createLimiter: createUpstashLimiter,
  defaultCreateLimiter: createUpstashLimiter,
};

function deny(): RateLimitResult {
  return { allowed: false, retryAfterSec: 60 };
}

/**
 * Paid endpoints pass `strict` so a deployment without a working global
 * limiter denies the request instead of granting an unlimited per-instance
 * budget. Local development and the E2E mock keep the in-memory fallback.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  strict = false,
): Promise<RateLimitResult> {
  // e2e suite: never rate-limit the mock server (many quizzes from one IP).
  if (process.env.E2E_MOCK_AI === '1') {
    return { allowed: true, retryAfterSec: 0 };
  }

  const failClosed = strict && process.env.NODE_ENV === 'production';
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const limiter = rateLimitDeps.createLimiter(limit, windowSec);

  if (!limiter) {
    warnMissingUpstash();
    return failClosed ? deny() : checkRateLimitInMemory(key, limit, windowMs);
  }

  try {
    const result = await limiter.limit(key);
    // Upstash returns `reset` as a Unix timestamp in milliseconds.
    return {
      allowed: result.success,
      retryAfterSec: Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch (err) {
    console.error('[rate-limit] Upstash request failed:', err);
    return failClosed ? deny() : checkRateLimitInMemory(key, limit, windowMs);
  }
}

/** Returns a valid IP without brackets, or null for a malformed/missing value. */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim().replace(/^\[|\]$/g, '');
  return isIP(candidate) ? candidate : null;
}

function warnMissingNetlifyHeader(): void {
  if (warnedMissingNetlifyHeader) return;
  warnedMissingNetlifyHeader = true;
  console.warn(
    '[rate-limit] Missing x-nf-client-connection-ip; using x-real-ip for a non-Netlify proxy.',
  );
}

function warnSharedClientBucket(): void {
  if (warnedSharedClientBucket) return;
  warnedSharedClientBucket = true;
  console.warn(
    '[rate-limit] Missing x-nf-client-connection-ip and no usable x-real-ip; ' +
      'using the shared client bucket. Headerless callers are collectively throttled by design.',
  );
}

/** The subset of request headers the client-IP resolver reads. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Resolves the caller IP from proxy headers.
 *
 * Netlify sets x-nf-client-connection-ip from the actual connection. That is
 * the only authoritative value here. X-Forwarded-For is deliberately never
 * consulted: Netlify's XFF lists can contain internal 100.64/10 hops, and
 * neither the left-most nor the right-most entry is reliably the client.
 *
 * x-real-ip is supported only for non-Netlify deployments behind a proxy that
 * sets it, and is validated exactly like the Netlify header. If neither header
 * is present, all such requests share one bucket and are collectively
 * throttled; this is intentional and must not fail the whole app closed.
 */
export function resolveClientIp(h: HeaderReader): string {
  const netlifyIp = normalizeIp(h.get('x-nf-client-connection-ip'));
  if (netlifyIp) return netlifyIp;

  const realIp = normalizeIp(h.get('x-real-ip'));
  if (realIp) {
    warnMissingNetlifyHeader();
    return realIp;
  }

  warnSharedClientBucket();
  return SHARED_IP_BUCKET;
}

export async function getClientIp(): Promise<string> {
  return resolveClientIp(await headers());
}

// =========================================
// TTL cache (e.g. identical quiz requests)
// =========================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      // Evict the oldest entry (Map preserves insertion order)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

/** Stable SHA-256 cache key for a normalized payload. */
export function hashPayload<T>(payload: T): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export type SiteverifyFetch = (url: string, init: RequestInit) => Promise<Response>;

let warnedMissingTurnstile = false;

/**
 * Bot protection is opt-in: verification is skipped while TURNSTILE_SECRET_KEY
 * is unset. Once configured, the token must succeed for the expected hostname
 * and action, and an unreachable siteverify endpoint denies the request.
 */
export async function verifyTurnstile(
  token: string | undefined,
  action?: string,
  siteverifyFetch: SiteverifyFetch = fetch,
): Promise<boolean> {
  // e2e suite: skip the bot check entirely.
  if (process.env.E2E_MOCK_AI === '1') return true;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !warnedMissingTurnstile) {
      warnedMissingTurnstile = true;
      console.warn('[turnstile] TURNSTILE_SECRET_KEY is not configured; bot verification is disabled.');
    }
    return true;
  }
  if (!token) return false;

  try {
    const res = await siteverifyFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    if (!res.ok) return false;
    // SAFETY: siteverify documents this JSON shape; each field is validated
    // before it affects the decision.
    const data = (await res.json()) as { success?: boolean; hostname?: string; action?: string };
    if (data.success !== true) return false;
    const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
    if (expectedHostname && data.hostname !== expectedHostname) return false;
    if (action && data.action !== action) return false;
    return true;
  } catch (err) {
    console.error('[turnstile] Verification request failed:', err);
    return false;
  }
}
