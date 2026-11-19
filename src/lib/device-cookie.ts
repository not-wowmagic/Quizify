// src/lib/device-cookie.ts
// Binds anonymous history to a signed, HttpOnly cookie so a client cannot
// choose another device's id. There is no account system and no user identity.
import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEVICE_COOKIE_NAME = 'quizify_device';
export const BOT_COOKIE_NAME = 'quizify_bot';
export const BOT_TTL_MS = 2 * 60 * 60 * 1000;
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;
const DEV_SECRET = 'quizify-local-device-binding';

export function deviceCookieSecret(): string {
  const configured = process.env.DEVICE_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    console.warn('[device-cookie] DEVICE_COOKIE_SECRET is not configured; using a fallback signing key.');
  }
  return DEV_SECRET;
}

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.E2E_MOCK_AI !== '1',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}

export function botCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.E2E_MOCK_AI !== '1',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(BOT_TTL_MS / 1000),
  };
}

export function signDeviceId(deviceId: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(deviceId).digest('base64url');
  return `${deviceId}.${signature}`;
}

/** A short-lived proof that Cloudflare Turnstile accepted this browser. */
export function signBotCheck(expiresAt: number, secret: string): string {
  const signature = createHmac('sha256', secret).update(`bot:${expiresAt}`).digest('base64url');
  return `${expiresAt}.${signature}`;
}

/** Returns true only for an unexpired, correctly signed bot proof. */
export function readBotCheck(value: string | undefined, now: number, secret: string): boolean {
  if (!value) return false;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return false;

  const expiresAt = Number(value.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`bot:${expiresAt}`).digest('base64url'),
  );
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** A validated cookie always wins over any client-supplied device id. */
export function resolveAuthoritativeDeviceId(
  boundId: string | null,
  clientDeviceId: string | undefined,
): string | null {
  if (boundId) return boundId;
  if (clientDeviceId && DEVICE_ID_RE.test(clientDeviceId)) return clientDeviceId;
  return null;
}

/** Returns the bound id only when both the signature and the UUID shape hold. */
export function readSignedDeviceId(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;

  const deviceId = value.slice(0, separator);
  if (!DEVICE_ID_RE.test(deviceId)) return null;

  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(createHmac('sha256', secret).update(deviceId).digest('base64url'));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return deviceId;
}
