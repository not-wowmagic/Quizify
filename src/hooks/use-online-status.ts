'use client';

// src/hooks/use-online-status.ts
import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const getSnapshot = () => navigator.onLine;

// Server-side snapshot: assume online during SSR/prerender.
const getServerSnapshot = () => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
