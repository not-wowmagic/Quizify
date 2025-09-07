// src/ai/openrouter.ts
// Try both hostnames that OpenRouter documents sometimes use. Some networks
// or DNS setups may resolve one and not the other.
const OPENROUTER_URLS = [
  'https://openrouter.ai/api/v1/chat/completions',
];

export async function callOpenRouter(model: string, prompt: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set.');
  }

  const messages = [
    { role: 'system', content: 'You are an assistant that follows instructions precisely.' },
    { role: 'user', content: prompt },
  ];

  // Optional headers recommended by OpenRouter docs
  const extraHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_REFERER) extraHeaders['HTTP-Referer'] = process.env.OPENROUTER_REFERER;
  if (process.env.OPENROUTER_X_TITLE) extraHeaders['X-Title'] = process.env.OPENROUTER_X_TITLE;

  let lastError: any = null;
  for (const url of OPENROUTER_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...extraHeaders,
        },
        body: JSON.stringify({ model, messages }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`OpenRouter API error ${res.status} at ${url}: ${txt}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
      if (!content) throw new Error(`OpenRouter returned no content (url: ${url})`);
      return String(content);
    } catch (err) {
      // Keep the last error and try next URL. Also log for visibility.
      // Some low-level network errors from undici are opaque; logging
      // helps surface DNS/proxy/TLS problems in the server console.
      try {
        console.error(`OpenRouter fetch error for ${url}:`, err);
      } catch (e) {
        // ignore logging failures
      }
      lastError = err;
    }
  }

  // If we reach here, all endpoints failed. Throw a detailed error.
  const message = lastError ? String((lastError as any).stack || lastError) : 'Unknown fetch error';
  throw new Error('Failed to call OpenRouter: ' + message);
}
