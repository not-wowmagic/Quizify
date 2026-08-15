import 'server-only';

/**
 * Unified LLM client for Quizify.
 *
 * Provider is selected via the AI_PROVIDER env variable:
 *   - "opencode" (default) — OpenCode AI gateway (OpenAI-compatible
 *     chat/completions endpoint). Defaults to the Go subscription endpoint
 *     (https://opencode.ai/zen/go/v1/chat/completions); override with
 *     OPENCODE_BASE_URL for Zen pay-as-you-go.
 *   - "gemini" — direct Google Generative Language API (optional fallback)
 *
 * Both providers share the same call signature and options, so the quiz
 * flows are provider-agnostic.
 */

export interface LLMOptions {
  systemInstruction?: string;
  /** Per-attempt timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
  /**
   * Absolute deadline (epoch ms) by which the call must complete. Per-attempt
   * timeouts are clamped to the remaining budget, and no attempt is started
   * once the deadline has passed. Used to bound total quiz wall time.
   */
  deadlineMs?: number;
}

export class LLMAPIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'LLMAPIError';
  }
}

// =========================================
// JSON extraction (provider-agnostic)
// =========================================

/** Named domain type for unparsed JSON values — the boundary contract of extractors. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Extract the first complete, balanced JSON object (or array) from a string.
 * Handles strings, escapes, and brackets balancing.
 */
export function extractJSON(str: string): JsonValue {
  const start = str.indexOf('{');
  const startArray = str.indexOf('[');

  let startIndex = -1;
  let openChar = '{';
  let closeChar = '}';

  if (start !== -1 && startArray !== -1) {
    if (start < startArray) {
      startIndex = start;
      openChar = '{';
      closeChar = '}';
    } else {
      startIndex = startArray;
      openChar = '[';
      closeChar = ']';
    }
  } else if (start !== -1) {
    startIndex = start;
    openChar = '{';
    closeChar = '}';
  } else if (startArray !== -1) {
    startIndex = startArray;
    openChar = '[';
    closeChar = ']';
  }

  if (startIndex === -1) {
    throw new Error('No valid JSON structure (object or array) found in response.');
  }

  // Try direct parsing from startIndex to last index of closeChar
  try {
    const endPos = str.lastIndexOf(closeChar);
    if (endPos > startIndex) {
      const candidate = str.substring(startIndex, endPos + 1);
      return JSON.parse(candidate);
    }
  } catch {
    // Fall back to scanning for brace/bracket balance
  }

  let braceCount = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === openChar) {
        braceCount++;
      } else if (char === closeChar) {
        braceCount--;
        if (braceCount === 0) {
          const candidate = str.substring(startIndex, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to parse extracted JSON structure: ${message}. Content: ${candidate}`);
          }
        }
      }
    }
  }

  throw new Error('No balanced JSON structure found in the response.');
}

// =========================================
// Shared HTTP helper
// =========================================

async function fetchWithRetry<TBody>(
  url: string,
  headers: Record<string, string>,
  body: TBody,
  timeoutMs: number,
  label: string,
  deadlineMs?: number,
  retries = 1,
  delay = 1000
): Promise<JsonValue> {
  for (let i = 0; i <= retries; i++) {
    // Respect the global deadline: clamp the per-attempt timeout to the
    // remaining budget, and refuse to start a doomed attempt.
    const now = Date.now();
    if (deadlineMs !== undefined) {
      const remaining = deadlineMs - now;
      if (remaining <= 0) {
        throw new LLMAPIError(`${label} aborted: global deadline exceeded.`);
      }
      if (timeoutMs > remaining) {
        timeoutMs = remaining;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const attemptStartedAt = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - attemptStartedAt;
      console.info(`[llm] ${label} attempt ${i + 1} returned ${res.status} in ${durationMs}ms`);

      if (res.ok) {
        return await res.json();
      }

      const txt = await res.text();
      // Retry on transient status codes (429 Rate Limit, 5xx server issues).
      // These fail fast, so retrying is cheap; timeouts are covered below.
      if ((res.status === 429 || res.status >= 500) && i < retries) {
        console.warn(
          `${label} returned status ${res.status} (body: ${txt.slice(0, 300)}). Retrying in ${delay}ms (attempt ${i + 1}/${retries})...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      throw new LLMAPIError(`${label} error ${res.status}: ${txt}`, res.status);
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof LLMAPIError) {
        throw err;
      }

      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const errorMessage = isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);

      if (i === retries) {
        throw new LLMAPIError(`Failed to contact ${label}: ${errorMessage}`);
      }

      console.warn(`Request to ${label} failed (${errorMessage}). Retrying in ${delay}ms (attempt ${i + 1}/${retries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new LLMAPIError('Max retries exceeded');
}

// =========================================
// Provider: OpenCode Zen (OpenAI-compatible chat/completions)
// =========================================

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Builds the messages array — system instruction first, then user content. */
export function buildChatMessages(prompt: string, systemInstruction?: string): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
}

export interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

/** Extracts the assistant text from a chat/completions response. */
export function parseOpenAIChatResponse(data: OpenAIChatResponse): string {
  if (data?.error?.message) {
    throw new LLMAPIError(`OpenCode AI API error: ${data.error.message}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason && finishReason !== 'stop') {
      throw new Error(`OpenCode AI API failed to generate a complete response. Finish reason: ${finishReason}`);
    }
    // Trimmed log — the raw response may contain user-supplied text
    console.error('OpenCode AI response (truncated):', JSON.stringify(data).slice(0, 500));
    throw new Error('OpenCode AI API returned no content or an unexpected response structure.');
  }
  return content;
}

async function callOpenCodeChat(prompt: string, options: LLMOptions = {}): Promise<string> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    throw new Error('OPENCODE_API_KEY environment variable is not set. Add it in the Netlify dashboard (or local .env.local for development).');
  }

  const model = process.env.OPENCODE_MODEL || 'deepseek-v4-flash';
  // OpenCode Go (subscription) endpoint by default — see https://opencode.ai/docs/go/
  const url = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1/chat/completions';
  const timeoutMs = options.timeoutMs ?? 30000;

  const body = {
    model,
    messages: buildChatMessages(prompt, options.systemInstruction),
  };

  try {
    const data = await fetchWithRetry(
      url,
      {
        'Content-Type': 'application/json',
        // API key sent as a header so it never lands in URL logs
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      timeoutMs,
      'OpenCode AI API',
      options.deadlineMs
    );
    // SAFETY: response is JSON from the documented OpenAI-compatible API;
    // parseOpenAIChatResponse validates the shape and surfaces API errors.
    return parseOpenAIChatResponse(data as OpenAIChatResponse);
  } catch (err: unknown) {
    console.error('OpenCode AI API execution error:', err);
    throw err;
  }
}

// =========================================
// Provider: Gemini (direct Google API — optional fallback)
// =========================================

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}

function getGeminiResponseText(data: GeminiResponse): string {
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    const candidate = data?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini API failed to generate complete response. Finish reason: ${candidate.finishReason}`);
    }
    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Gemini API request was blocked: ${data.promptFeedback.blockReason}`);
    }
    // Trimmed log — the raw response may contain user-supplied text
    console.error('Gemini Response (truncated):', JSON.stringify(data).slice(0, 500));
    throw new Error('Gemini API returned no content or an unexpected response structure.');
  }

  return String(content);
}

interface GeminiRequestBody {
  contents: Array<{ parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
}

async function callGeminiDirect(prompt: string, options: LLMOptions = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Add it in the Netlify dashboard (or local .env.local for development).');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;
  const timeoutMs = options.timeoutMs ?? 30000;

  const body: GeminiRequestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  if (options.systemInstruction) {
    body.systemInstruction = {
      parts: [
        {
          text: options.systemInstruction,
        },
      ],
    };
  }

  try {
    const data = await fetchWithRetry(
      url,
      {
        'Content-Type': 'application/json',
        // API key sent as a header so it never lands in URL logs
        'x-goog-api-key': apiKey,
      },
      body,
      timeoutMs,
      'Gemini API',
      options.deadlineMs
    );
    // SAFETY: response is JSON from the documented Gemini generateContent API;
    // getGeminiResponseText validates the shape and surfaces block/error reasons.
    return getGeminiResponseText(data as GeminiResponse);
  } catch (err: unknown) {
    console.error('Gemini API execution error:', err);
    throw err;
  }
}

// =========================================
// Public entry point
// =========================================

export type LLMProvider = 'opencode' | 'gemini';

/** Resolves the active provider from AI_PROVIDER (default: opencode). */
export function resolveProvider(): LLMProvider {
  const provider = (process.env.AI_PROVIDER ?? 'opencode').trim().toLowerCase();
  if (provider === 'opencode' || provider === 'gemini') {
    return provider;
  }
  throw new Error(`AI_PROVIDER has an invalid value "${provider}". Use "opencode" or "gemini".`);
}

export async function callLLM(prompt: string, options: LLMOptions = {}): Promise<string> {
  const provider = resolveProvider();
  if (provider === 'gemini') {
    return callGeminiDirect(prompt, options);
  }
  return callOpenCodeChat(prompt, options);
}
