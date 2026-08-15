// src/proxy.ts
// Strict dynamic Content Security Policy with a per-request nonce.
//
// Next.js 16: "middleware" is renamed to "proxy"; the behavior is identical.
// Next.js automatically extracts the nonce from the CSP header (script-src /
// default-src) and applies it to framework-injected scripts and <Script>
// components (see app-render.js: getScriptNonceFromHeader). Scripts rendered
// manually (JSON-LD, service-worker registration) must receive the nonce from
// layout.tsx, which reads it back from the x-nonce response header.
import { NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';

const UMAMI_ORIGIN = 'https://cloud.umami.is';

export function proxy() {
  // CSP nonces must be base64 (a UUID contains hyphens, which are invalid in
  // a nonce source). Web Crypto works on both the Edge and Node runtimes.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  // 'unsafe-inline' is kept alongside the nonce as a safety net: CSP3 makes
  // it inert in browsers where a nonce is present (including with
  // 'strict-dynamic'), but it keeps older browsers from breaking.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com ${UMAMI_ORIGIN}` +
      (isDev ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://cloud.umami.is",
    // worker-src 'self' blob: is required for the pdf.js worker and the
    // service worker (public/sw.js, loaded from 'self').
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets, icons, and the service worker; they need no CSP.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon.png|apple-icon.png|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
