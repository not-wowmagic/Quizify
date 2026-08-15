// src/lib/device-id.ts
// Anonymous device identity for quiz history. A random UUID is generated once
// and persisted in localStorage; every saved attempt is tagged with it so the
// history panel can list that device's attempts without any login.

const DEVICE_ID_KEY = 'quizify_device_id';

export function getDeviceId(): string {
  // SSR guard: `window` only exists in the browser (typeof checks are banned)
  if (globalThis.window === undefined) return '';

  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      // Storage may be unavailable (private mode), so fall back to an in-memory id
    }
  }
  return id;
}
