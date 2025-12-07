'use server';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(model: string, prompt: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set.');
  }

  const messages = [
    { role: 'system', content: 'You are an assistant that follows instructions precisely.' },
    { role: 'user', content: prompt },
  ];

  const extraHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_REFERER) extraHeaders['HTTP-Referer'] = process.env.OPENROUTER_REFERER;
  if (process.env.OPENROUTER_X_TITLE) extraHeaders['X-Title'] = process.env.OPENROUTER_X_TITLE;

  try {
    const res = await fetch(OPENROUTER_URL, {
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
      throw new Error(`OpenRouter API error ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (!content) throw new Error('OpenRouter returned no content');
    return String(content);
  } catch (err) {
    console.error('OpenRouter fetch error:', err);
    throw err;
  }
}
