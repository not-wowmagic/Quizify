import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('undici', () => ({
  Agent: class {
    async close(): Promise<void> {}
  },
  fetch: fetchMock,
}));

import { fetchPublicPage } from '@/lib/web-reader';

describe('redirect target validation', () => {
  beforeEach(() => {
    vi.stubEnv('E2E_MOCK_AI', '0');
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://127.0.0.1/' }),
      text: async () => '',
    });
  });

  it('rejects a redirect to a blocked host before fetching it', async () => {
    await expect(fetchPublicPage('http://93.184.216.34/')).rejects.toThrow(
      /not publicly reachable/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
