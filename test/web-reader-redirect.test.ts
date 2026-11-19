import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent, Response, fetch } from 'undici';
import { fetchPublicPage, type WebReaderDeps } from '@/lib/web-reader';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('redirect target validation', () => {
  it('rejects a redirect to a blocked host before fetching it', async () => {
    vi.stubEnv('E2E_MOCK_AI', '0');

    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response('', { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    );

    const deps: WebReaderDeps = {
      lookup: async () => {
        throw new Error('unexpected DNS lookup');
      },
      fetch: fetchMock,
      createAgent: () => new Agent(),
    };

    await expect(fetchPublicPage('http://93.184.216.34/', deps)).rejects.toThrow(
      /not publicly reachable/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
