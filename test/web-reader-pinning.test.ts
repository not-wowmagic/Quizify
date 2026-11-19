import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent, Response, fetch } from 'undici';
import type { LookupFunction } from 'node:net';
import { fetchPublicPage, type DnsLookup, type WebReaderDeps } from '@/lib/web-reader';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pinned DNS lookup', () => {
  it('returns the validated address without resolving the hostname again', async () => {
    vi.stubEnv('E2E_MOCK_AI', '0');

    let capturedLookup: LookupFunction | null = null;
    const dnsLookup = vi.fn<DnsLookup>();
    dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(async () => {
      const pinnedLookup = capturedLookup;
      expect(pinnedLookup).not.toBeNull();
      if (pinnedLookup === null) throw new Error('pinned lookup was not installed');

      const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        pinnedLookup('example.test', { all: true, family: 0 }, (error, addresses) => {
          if (error) {
            reject(error);
            return;
          }
          if (!Array.isArray(addresses)) {
            reject(new Error('pinned lookup returned a single address'));
            return;
          }
          const [first] = addresses;
          if (!first) {
            reject(new Error('pinned lookup returned no addresses'));
            return;
          }
          resolve(first);
        });
      });

      expect(resolved).toEqual({ address: '93.184.216.34', family: 4 });
      return new Response('hello', { status: 200, headers: { 'content-length': '5' } });
    });

    const deps: WebReaderDeps = {
      lookup: dnsLookup,
      fetch: fetchMock,
      createAgent: pinnedLookup => {
        capturedLookup = pinnedLookup;
        return new Agent({ connect: { lookup: pinnedLookup } });
      },
    };

    await expect(fetchPublicPage('http://example.test/', deps)).resolves.toEqual({
      html: 'hello',
      finalUrl: 'http://example.test/',
    });
    expect(dnsLookup).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
