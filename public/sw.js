// public/sw.js
// Quizify offline service worker that caches the app shell so the app loads
// (and lets users retake quizzes already in their history page) when offline.
//
// Strategy:
//   - Cache-first  for static shell assets (_next/static, fonts, icons).
//   - Network-first for HTML navigations, falling back to a cached shell.
//   - Server actions (POST) are never intercepted and stay online-only.
//
// Bump CACHE_NAME to invalidate all previous caches on deploy.

const CACHE_NAME = 'quizify-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

const SHELL_ASSET = /\/_next\/static\/|\.(?:css|js|mjs|woff2?|ttf|otf|svg|png|jpg|jpeg|gif|webp|ico)$/;

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return; // Server actions and POSTs stay online-only
  if (request.mode === 'navigate') {
    // Network-first for HTML so fresh pages win; fall back to the cached shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? caches.match('/')),
        ),
    );
    return;
  }

  // Only cache same-origin, static shell assets.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !SHELL_ASSET.test(url.pathname)) return;

  // Cache-first for static assets.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
