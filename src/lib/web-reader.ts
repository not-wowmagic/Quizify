// src/lib/web-reader.ts
// Server-only web article fetching with SSRF hardening.
// Fetches a URL, validates every resolved address as global unicast, pins the
// validated address into an undici Agent so DNS cannot rebind between the check
// and the connection, and returns the raw HTML. Article extraction
// (@mozilla/readability) runs client-side in the browser via DOMParser, so the
// Netlify Node runtime never loads jsdom.
import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';

const MAX_PAGE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_PORTS = new Set(['', '80', '443']);

type ValidatedAddress = { address: string; family: 4 | 6 };

/**
 * True when the address is NOT global unicast. IPv4-mapped IPv6 is unwrapped
 * and re-tested as IPv4, so ::ffff:127.0.0.1 and ::ffff:7f00:1 are both
 * rejected. This blocks loopback, private, CGNAT, link-local, ULA, multicast,
 * unspecified, documentation, NAT64, 6to4 and other reserved ranges.
 */
export function isBlockedAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return true;
  }

  if (parsed instanceof ipaddr.IPv6) {
    if (parsed.isIPv4MappedAddress()) {
      return isBlockedAddress(parsed.toIPv4Address().toString());
    }
    return parsed.range() !== 'unicast';
  }

  return parsed.range() !== 'unicast';
}

/** Resolves a hostname once and returns only addresses that passed the check. */
async function resolvePublicHost(hostname: string): Promise<ValidatedAddress[]> {
  const bare = hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(bare);
  if (literalFamily !== 0) {
    if (isBlockedAddress(bare)) {
      throw new Error('This address is not publicly reachable.');
    }
    return [{ address: bare, family: literalFamily as 4 | 6 }];
  }

  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Could not resolve this host.');
  }
  if (records.length === 0) {
    throw new Error('Could not resolve this host.');
  }
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new Error('This host is not publicly reachable.');
    }
  }

  return records.map(record => ({ address: record.address, family: record.family as 4 | 6 }));
}

/**
 * Pins the already-validated addresses into a per-hop undici Agent. The custom
 * lookup never performs DNS: it returns only an address that resolvePublicHost
 * validated, so a second DNS answer cannot point the connection at a private IP.
 */
function createPinnedAgent(addresses: ValidatedAddress[]): Agent {
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    const wantedFamily = options.family === 4 || options.family === 6 ? options.family : undefined;
    const candidates = wantedFamily
      ? addresses.filter(entry => entry.family === wantedFamily)
      : addresses;

    if (candidates.length === 0) {
      const error = Object.assign(new Error('No validated address for the requested family.'), {
        code: 'ENOTFOUND',
      });
      callback(error, '', 4);
      return;
    }

    if (options.all) {
      callback(null, candidates);
      return;
    }

    const chosen = candidates[0];
    callback(null, chosen.address, chosen.family);
  };

  return new Agent({ connect: { lookup: pinnedLookup } });
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
    if (!ALLOWED_PORTS.has(u.port)) {
      throw new Error('Only ports 80 and 443 are supported.');
    }

    const addresses = await resolvePublicHost(u.hostname);
    const agent = createPinnedAgent(addresses);

    try {
      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await fetch(current, {
          redirect: 'manual',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          dispatcher: agent,
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; Quizify/1.0; +https://quizify.netlify.app)',
            accept: 'text/html,application/xhtml+xml',
          },
        });
      } catch (err) {
        if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
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
    } finally {
      await agent.close().catch(() => undefined);
    }
  }
  throw new Error('Too many redirects.');
}
