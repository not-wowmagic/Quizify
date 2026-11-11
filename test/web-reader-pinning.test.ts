import { describe, expect, it, vi } from 'vitest';
import type { LookupFunction } from 'node:net';

const { dnsLookupMock, fetchMock, captured } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
  fetchMock: vi.fn(),
  captured: { lookup: null as LookupFunction | null },
}));

vi.mock('node:dns/promises', () => ({ lookup: dnsLookupMock }));
vi.mock('undici', () => ({
  Agent: class {
    constructor(options: { connect: { lookup: LookupFunction } }) {
      captured.lookup = options.connect.lookup;
    }
    async close(): Promise<void> {}
  },
  fetch: fetchMock,
}));

import { fetchPublicPage } from '@/lib/web-reader';

describe('pinned DNS lookup', () => {
  it('returns the validated address without resolving the hostname again', async () => {
    vi.stubEnv('E2E_MOCK_AI', '0');
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    fetchMock.mockImplementation(async () => {
      const lookup = captured.lookup;
      expect(lookup).not.toBeNull();
      if (!lookup) throw new Error('pinned lookup was not installed');

      const resolved = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        lookup('example.test', { all: false, family: 0 }, (error, address, family) => {
          if (error) reject(error);
          else if (typeof address === 'string') resolve({ address, family: family ?? 0 });
          else reject(new Error('unexpected address array'));
        });
      });

      expect(resolved).toEqual({ address: '93.184.216.34', family: 4 });
      return {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-length': '5' }),
        text: async () => 'hello',
      };
    });

    await expect(fetchPublicPage('http://example.test/')).resolves.toEqual({
      html: 'hello',
      finalUrl: 'http://example.test/',
    });
    expect(dnsLookupMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
