// src/lib/web-reader.ts
// Server-only web article fetching with SSRF hardening.
// Fetches a URL, verifies the resolved host is public, and returns the raw
// HTML. Article extraction (@mozilla/readability) runs client-side in the
// browser via DOMParser, so the Netlify Node runtime never loads jsdom.
import 'server-only';

import { lookup } from 'node:dns/promises';

const MAX_PAGE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

/** Blocks private, loopback, link-local, and reserved IP ranges (IPv4 + IPv6). */
function isBlockedAddress(address: string): boolean {
  if (address.includes(':')) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' || lower === '::' ||
      lower.startsWith('fc') || lower.startsWith('fd') || // fc00::/7 (ULA)
      lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb') // fe80::/10 (link-local)
    );
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||               // link-local
    (a === 172 && b >= 16 && b <= 31) ||      // 172.16/12
    (a === 192 && b === 168) ||               // 192.168/16
    (a === 100 && b >= 64 && b <= 127)        // 100.64/10 (CGNAT)
  );
}

/** Resolves the hostname and rejects when ANY record points to a blocked address. */
async function assertPublicHost(hostname: string): Promise<void> {
  // Literal IPs (already an address) bypass DNS rebinding risk.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    if (isBlockedAddress(hostname.replace(/^\[|\]$/g, ''))) {
      throw new Error('This address is not publicly reachable.');
    }
    return;
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error('Could not resolve this host.');
  }
  for (const { address } of records) {
    if (isBlockedAddress(address)) {
      throw new Error('This host is not publicly reachable.');
    }
  }
}

/** Fetches HTML with manual redirect handling so every hop is SSRF-checked. */
export async function fetchPublicPage(urlStr: string): Promise<{ html: string; finalUrl: string }> {
  if (process.env.E2E_MOCK_AI === '1') {
    // Deterministic canned page for the e2e suite (no network).
    if (urlStr.includes('nonexistent.invalid')) {
      throw new Error('Could not reach that page. It may be down or blocking automated requests.');
    }
    return {
      html: `<!DOCTYPE html><html><head><title>Photosynthesis</title></head><body>
<article><h1>Photosynthesis</h1>
<p>Photosynthesis is the process by which green plants convert light energy into chemical energy. It happens inside chloroplasts, where chlorophyll absorbs sunlight.</p>
<p>The light-dependent reactions occur on the thylakoid membrane and produce ATP and NADPH. The Calvin cycle then fixes carbon dioxide into glucose in the stroma.</p>
<p>Oxygen is released as a byproduct. This process supports nearly all life on Earth by producing the food and oxygen that organisms depend on.</p>
</article></body></html>`,
      finalUrl: urlStr,
    };
  }
  let current = urlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new Error('Invalid URL.');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('Only http(s) URLs are supported.');
    }
    if (u.username || u.password) {
      throw new Error('URLs with embedded credentials are not supported.');
    }

    await assertPublicHost(u.hostname);

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Quizify/1.0; +https://quizify.netlify.app)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error('The page took too long to respond (10 s timeout).');
      }
      throw new Error('Could not reach that page. It may be down or blocking automated requests.');
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without a target.');
      current = new URL(location, current).toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(`The page returned HTTP ${res.status}.`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_PAGE_BYTES) {
      throw new Error('The page is too large (max 2 MB).');
    }
    const html = await res.text();
    if (html.length > MAX_PAGE_BYTES) {
      throw new Error('The page is too large (max 2 MB).');
    }
    return { html, finalUrl: current };
  }
  throw new Error('Too many redirects.');
}
