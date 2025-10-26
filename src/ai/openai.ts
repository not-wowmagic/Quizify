'use server';

/**
 * Minimal OpenAI-compatible client helper.
 *
 * This module sends chat completion requests to providers that implement the
 * OpenAI API (e.g. ChatAnywhere) using fetch so we avoid bringing in the full
 * SDK. Consumers supply the target model and the prompt text.
 */

const DEFAULT_OPENAI_BASE_URL = 'https://api.chatanywhere.tech/v1';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
}

export async function callOpenAI(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set.');
  }

  const baseUrl = process.env.OPENAI_API_BASE_URL || DEFAULT_OPENAI_BASE_URL;
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are an assistant that follows instructions precisely.' },
      { role: 'user', content: prompt },
    ],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
  if (!content) {
    throw new Error('OpenAI API returned no content in the response.');
  }

  return String(content);
}
