import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { fetchPublicPage, isBlockedAddress } from '@/lib/web-reader';

beforeAll(() => {
  vi.stubEnv('E2E_MOCK_AI', '0');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('address classification', () => {
  it.each([
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'ff02::1',
    '64:ff9b::7f00:1',
    '2001:db8::1',
    '2002::1',
  ])('blocks %s', address => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])(
    'allows global unicast %s',
    address => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('fetchPublicPage address and port protections', () => {
  it('rejects IPv4-mapped IPv6 loopback in URL form', async () => {
    await expect(fetchPublicPage('http://[::ffff:127.0.0.1]/')).rejects.toThrow(
      /not publicly reachable/,
    );
    await expect(fetchPublicPage('http://[::ffff:7f00:1]/')).rejects.toThrow(
      /not publicly reachable/,
    );
  });

  it('rejects cloud metadata, unspecified, and CGNAT literals', async () => {
    await expect(fetchPublicPage('http://169.254.169.254/')).rejects.toThrow(
      /not publicly reachable/,
    );
    await expect(fetchPublicPage('http://0.0.0.0/')).rejects.toThrow(/not publicly reachable/);
    await expect(fetchPublicPage('http://[::]/')).rejects.toThrow(/not publicly reachable/);
    await expect(fetchPublicPage('http://100.64.0.1/')).rejects.toThrow(/not publicly reachable/);
  });

  it('rejects a private-range hostname', async () => {
    await expect(fetchPublicPage('http://localhost/')).rejects.toThrow(/not publicly reachable/);
  });

  it('rejects a non-80/443 port', async () => {
    await expect(fetchPublicPage('http://example.com:8080/')).rejects.toThrow(
      /ports 80 and 443/,
    );
  });
});

describe('local server reachability', () => {
  let server: Server;
  let port = 0;
  let requests = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      requests++;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>SSRF_MARKER</body></html>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address && typeof address === 'object') port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('does not reach a loopback server through either mapped IPv6 form', async () => {
    await expect(fetchPublicPage(`http://[::ffff:127.0.0.1]:${port}/mapped`)).rejects.toThrow();
    await expect(fetchPublicPage(`http://[::ffff:7f00:1]:${port}/mapped`)).rejects.toThrow();
    expect(requests).toBe(0);
  });
});
