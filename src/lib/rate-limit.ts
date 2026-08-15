// src/lib/rate-limit.ts
import 'server-only';

import { headers } from 'next/headers';
import { createHash } from 'node:crypto';

/**
 * Lightweight in-memory rate limiting and caching for server actions.
 *
 * Note: on serverless platforms (Netlify Functions) each function instance
 * has its own memory, so limits are per-instance rather than global. This is
 * still effective at stopping naive abuse. For strict global limits, swap the
 * Map for a shared store (e.g. Upstash Redis) — the API stays the same.
 */

// =========================================
// Fixed-window rate limiter
// =========================================

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();
const MAX_BUCKETS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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

/** Resolves the caller IP from proxy headers inside a server action. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return h.get('x-real-ip') ?? 'unknown';
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

// =========================================
// Cloudflare Turnstile (optional bot protection)
// =========================================

/**
 * Verifies a Turnstile token server-side. When TURNSTILE_SECRET_KEY is not
 * configured, verification is skipped (returns true) so local development and
 * deployments without bot protection keep working.
 */
export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    // SAFETY: Turnstile siteverify returns a documented JSON shape;
    // `success` is the only field consumed and is boolean-checked below.
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] Verification request failed:', err);
    // Fail closed when configured but unreachable
    return false;
  }
}
