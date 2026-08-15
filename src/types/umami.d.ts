// src/types/umami.d.ts
// Minimal type declarations for the Umami analytics tracker injected by
// https://cloud.umami.is/script.js (see src/app/layout.tsx).

interface UmamiTracker {
  track(eventName: string, data?: Record<string, string | number>): void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export {};
