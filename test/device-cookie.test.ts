import { describe, expect, it, vi } from 'vitest';
import {
  BOT_COOKIE_NAME,
  BOT_TTL_MS,
  botCookieOptions,
  DEVICE_COOKIE_NAME,
  deviceCookieOptions,
  readBotCheck,
  readSignedDeviceId,
  resolveAuthoritativeDeviceId,
  signBotCheck,
  signDeviceId,
} from '@/lib/device-cookie';

const SECRET = 'test-secret';
const DEVICE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('S-03 device binding', () => {
  it('round-trips a signed device id', () => {
    expect(readSignedDeviceId(signDeviceId(DEVICE_A, SECRET), SECRET)).toBe(DEVICE_A);
  });

  it('rejects a forged signature for another device', () => {
    const forged = signDeviceId(DEVICE_A, SECRET).replace(DEVICE_A, DEVICE_B);
    expect(readSignedDeviceId(forged, SECRET)).toBe(null);
  });

  it('never lets a forged client id override the bound cookie', () => {
    expect(resolveAuthoritativeDeviceId(DEVICE_A, DEVICE_B)).toBe(DEVICE_A);
  });

  it('accepts a client id only on first binding, and rejects malformed ids', () => {
    expect(resolveAuthoritativeDeviceId(null, DEVICE_B)).toBe(DEVICE_B);
    expect(resolveAuthoritativeDeviceId(null, 'not-a-uuid')).toBe(null);
    expect(resolveAuthoritativeDeviceId(null, undefined)).toBe(null);
  });

  it('uses a hardened cookie in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const options = deviceCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    vi.unstubAllEnvs();
  });

  it('names the cookie consistently', () => {
    expect(DEVICE_COOKIE_NAME).toBe('quizify_device');
  });

  it('round-trips a short-lived bot proof', () => {
    const expiresAt = Date.now() + BOT_TTL_MS;
    const proof = signBotCheck(expiresAt, SECRET);
    expect(readBotCheck(proof, Date.now(), SECRET)).toBe(true);
    expect(readBotCheck(proof, expiresAt + 1, SECRET)).toBe(false);
    expect(readBotCheck(proof.replace(String(expiresAt), String(expiresAt + 1)), Date.now(), SECRET)).toBe(false);
    expect(readBotCheck(undefined, Date.now(), SECRET)).toBe(false);
  });

  it('uses the same hardened bot cookie flags', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const options = botCookieOptions();
    expect(BOT_COOKIE_NAME).toBe('quizify_bot');
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(BOT_TTL_MS / 1000);
    vi.unstubAllEnvs();
  });
});
