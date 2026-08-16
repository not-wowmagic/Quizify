// src/proxy.ts
// Strict dynamic Content Security Policy with a per-request nonce.
//
// Next.js 16: "middleware" is renamed to "proxy"; the behavior is identical.
// The nonce must reach BOTH the browser and the render pipeline:
//   - content-security-policy is set on the REQUEST headers so Next's
//     app-render (parseRequestHeaders -> getScriptNonceFromHeader) applies
//     the nonce to framework-injected scripts and <Script> components.
//   - x-nonce is set on the REQUEST headers so layout.tsx can read it back
//     via headers() and apply it to manually rendered scripts (JSON-LD,
//     next-themes init, service-worker registration, Umami).
//   - Content-Security-Policy is also set on the RESPONSE for the browser.
import { NextRequest, NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';

const UMAMI_ORIGIN = 'https://cloud.umami.is';
// Umami Cloud sends analytics events from a gateway host that is distinct from
// the script origin; both must be allowed in connect-src or every event is
// blocked by the CSP (see the gateway.umami.is console errors).
const UMAMI_GATEWAY_ORIGIN = 'https://gateway.umami.is';

export function proxy(request: NextRequest) {
  // CSP nonces must be base64 (a UUID contains hyphens, which are invalid in
  // a nonce source). Web Crypto works on both the Edge and Node runtimes.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com ${UMAMI_ORIGIN}` +
      (isDev ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://cloud.umami.is " + UMAMI_GATEWAY_ORIGIN,
    // worker-src 'self' blob: is required for the pdf.js worker and the
    // service worker (public/sw.js, loaded from 'self').
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  // Mirror the nonce into the request headers so the render pipeline and
  // layout.tsx can both see it (request headers, not response headers, are
  // what Next's renderer and headers() observe).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets, icons, and the service worker; they need no CSP.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon.png|apple-icon.png|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
