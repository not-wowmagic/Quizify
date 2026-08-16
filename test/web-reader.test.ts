import { describe, it, expect } from 'vitest';
import { fetchPublicPage } from '@/lib/web-reader';

describe('web-reader SSRF hardening', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(fetchPublicPage('ftp://example.com/file')).rejects.toThrow(/Only http\(s\) URLs are supported/);
    await expect(fetchPublicPage('javascript:alert(1)')).rejects.toThrow(/Only http\(s\) URLs are supported/);
  });

  it('rejects malformed URLs', async () => {
    await expect(fetchPublicPage('not a url')).rejects.toThrow(/Invalid URL/);
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(fetchPublicPage('https://user:pass@example.com/')).rejects.toThrow(/embedded credentials/);
  });

  it('blocks private, loopback, and reserved IP addresses', async () => {
    await expect(fetchPublicPage('http://127.0.0.1/admin')).rejects.toThrow(/not publicly reachable/);
    await expect(fetchPublicPage('http://10.0.0.1/')).rejects.toThrow(/not publicly reachable/);
    await expect(fetchPublicPage('http://192.168.1.1/')).rejects.toThrow(/not publicly reachable/);
    await expect(fetchPublicPage('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/not publicly reachable/);
    await expect(fetchPublicPage('http://[::1]/')).rejects.toThrow(/not publicly reachable/);
  });
});
