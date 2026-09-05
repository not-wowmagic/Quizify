import 'server-only';

/**
 * Unified LLM client for Quizify.
 *
 * Provider is selected via the AI_PROVIDER env variable:
 *   - "opencode" (default), the opencode AI gateway (OpenAI-compatible
 *     chat/completions endpoint). Defaults to the subscription endpoint
 *     (https://opencode.ai/zen/go/v1/chat/completions); override with
 *     OPENCODE_BASE_URL for opencode Zen pay-as-you-go.
 *   - "gemini", the direct Google Generative Language API (optional fallback)
 *
 * Both providers share the same call signature and options, so the quiz
 * flows are provider-agnostic.
 *
 * When E2E_MOCK_AI=1 (Playwright e2e suite) every call returns a canned,
 * deterministic response instead of hitting the network, so browser tests
 * are fast, free, and never rate-limited.
 */

export type LLMProvider = 'opencode' | 'gemini';

export interface LLMOptions {
  systemInstruction?: string;
  /** Optional per-call provider override used by bounded fallback flows. */
  provider?: LLMProvider;
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

/** Named domain type for unparsed JSON values (the boundary contract of extractors). */
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
  retries = 2,
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
        delay = Math.round(delay * (1.5 + Math.random() * 0.5));
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
      delay = Math.round(delay * (1.5 + Math.random() * 0.5));
    }
  }
  throw new LLMAPIError('Max retries exceeded');
}

// =========================================
// Provider: opencode (OpenAI-compatible chat/completions)
// =========================================

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Builds the messages array with the system instruction first, then user content. */
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

interface OpenAIResponsesResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { message?: string };
}

/** Extracts the assistant text from a chat/completions response. */
export function parseOpenAIChatResponse(data: OpenAIChatResponse): string {
  if (data?.error?.message) {
    throw new LLMAPIError(`opencode AI API error: ${data.error.message}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason && finishReason !== 'stop') {
      throw new Error(`opencode AI API failed to generate a complete response. Finish reason: ${finishReason}`);
    }
    // Trimmed log (the raw response may contain user-supplied text)
    console.error('opencode AI response (truncated):', JSON.stringify(data).slice(0, 500));
    throw new Error('opencode AI API returned no content or an unexpected response structure.');
  }
  return content;
}

/** Extracts assistant text from an OpenAI Responses API response. */
export function parseOpenAIResponsesResponse(data: OpenAIResponsesResponse): string {
  if (data?.error?.message) {
    throw new LLMAPIError(`opencode AI API error: ${data.error.message}`);
  }
  const content = data?.output_text || data?.output?.flatMap(item => item.content ?? []).find(item => item.text)?.text;
  if (!content) {
    console.error('opencode AI response (truncated):', JSON.stringify(data).slice(0, 500));
    throw new Error('opencode AI API returned no content or an unexpected response structure.');
  }
  return content;
}

async function callOpenCodeChat(prompt: string, options: LLMOptions = {}): Promise<string> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    throw new Error('OPENCODE_API_KEY environment variable is not set. Add it in the Netlify dashboard (or local .env.local for development).');
  }

  const model = process.env.OPENCODE_MODEL || 'muse-spark-1.2-contributor';
  const usesResponsesAPI = model === 'muse-spark-1.2-contributor';
  // Muse is served through Responses; most other Go models use chat completions.
  const url = process.env.OPENCODE_BASE_URL || `https://opencode.ai/zen/go/v1/${usesResponsesAPI ? 'responses' : 'chat/completions'}`;
  const timeoutMs = options.timeoutMs ?? 30000;

  const messages = buildChatMessages(prompt, options.systemInstruction);
  const body = usesResponsesAPI
    ? { model, input: messages }
    : { model, messages };

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
      'opencode AI API',
      options.deadlineMs
    );
    // SAFETY: response is JSON from the documented OpenAI-compatible API;
    // parseOpenAIChatResponse validates the shape and surfaces API errors.
    return usesResponsesAPI
      ? parseOpenAIResponsesResponse(data as OpenAIResponsesResponse)
      : parseOpenAIChatResponse(data as OpenAIChatResponse);
  } catch (err: unknown) {
    console.error('opencode AI API execution error:', err);
    throw err;
  }
}

// =========================================
// Provider: Gemini (direct Google API, optional fallback)
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
    // Trimmed log (the raw response may contain user-supplied text)
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

/** Resolves the active provider from AI_PROVIDER (default: opencode). */
export function resolveProvider(): LLMProvider {
  const provider = (process.env.AI_PROVIDER ?? 'opencode').trim().toLowerCase();
  if (provider === 'opencode' || provider === 'gemini') {
    return provider;
  }
  throw new Error(`AI_PROVIDER has an invalid value "${provider}". Use "opencode" or "gemini".`);
}

export async function callLLM(prompt: string, options: LLMOptions = {}): Promise<string> {
  if (process.env.E2E_MOCK_AI === '1') {
    return mockLLM(prompt);
  }
  const provider = options.provider ?? resolveProvider();
  if (provider === 'gemini') {
    return callGeminiDirect(prompt, options);
  }
  return callOpenCodeChat(prompt, options);
}

// =========================================
// Vision (multimodal image input)
// =========================================

/**
 * Calls a vision-capable model through the opencode gateway using
 * OpenAI-compatible image parts. The model is configurable via
 * OPENCODE_VISION_MODEL (defaults to "mimo-v2.5", which is vision-capable
 * and included in the opencode subscription with zero-retention).
 */
export async function callLLMVision(
  prompt: string,
  imageDataUrl: string,
  options: LLMOptions = {},
): Promise<string> {
  if (process.env.E2E_MOCK_AI === '1') {
    return mockLLM(prompt);
  }
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    throw new Error('OPENCODE_API_KEY environment variable is not set. Add it in the Netlify dashboard (or local .env.local for development).');
  }

  const model = process.env.OPENCODE_VISION_MODEL || 'mimo-v2.5';
  const url = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1/chat/completions';
  const timeoutMs = options.timeoutMs ?? 45000;

  // OpenAI-compatible content parts; text and image_url are the documented
  // shapes for multimodal chat/completions requests.
  type VisionContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
  const messages: Array<{ role: 'system' | 'user'; content: string | VisionContentPart[] }> = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ],
  });

  try {
    const data = await fetchWithRetry(
      url,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      { model, messages },
      timeoutMs,
      'opencode Vision API',
      options.deadlineMs
    );
    // SAFETY: response is JSON from the documented OpenAI-compatible API;
    // parseOpenAIChatResponse validates the shape and surfaces API errors.
    return parseOpenAIChatResponse(data as OpenAIChatResponse);
  } catch (err: unknown) {
    if (err instanceof LLMAPIError) {
      // Models without image support commonly reject with 400, so surface it.
      throw new LLMAPIError(
        `Vision request failed: ${err.message}. If the model rejects image input, set OPENCODE_VISION_MODEL to a vision-capable model (e.g. mimo-v2.5).`,
        err.status,
      );
    }
    throw err;
  }
}

// =========================================
// Deterministic mock (E2E_MOCK_AI=1, Playwright suite)
// =========================================

interface MockStandardQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  topic: string;
  supportingText?: string;
}

const MOCK_STANDARD: MockStandardQuestion[] = [
  {
    question: 'Which organelle is responsible for photosynthesis?',
    options: ['Chloroplast', 'Mitochondria', 'Nucleus', 'Ribosome'],
    correctAnswerIndex: 0,
    topic: 'PhotosynthesisOverview',
    supportingText: 'Photosynthesis occurs in the chloroplast.',
  },
  {
    question: 'What is the main pigment that captures light energy in plants?',
    options: ['Chlorophyll', 'Melanin', 'Hemoglobin', 'Carotene'],
    correctAnswerIndex: 0,
    topic: 'Light-DependentReactions',
  },
  {
    question: 'The Calvin cycle produces which molecule?',
    options: ['Glucose', 'ATP only', 'Oxygen', 'Water'],
    correctAnswerIndex: 0,
    topic: 'CalvinCycle',
  },
  {
    question: 'True or False: Photosynthesis converts light energy into chemical energy.',
    options: ['True', 'False'],
    correctAnswerIndex: 0,
    topic: 'EnergyConversion',
  },
  {
    question: 'Which gas do plants absorb from the atmosphere for photosynthesis?',
    options: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
    correctAnswerIndex: 0,
    topic: 'GasExchange',
  },
  {
    question: 'Where do the light-dependent reactions take place?',
    options: ['Thylakoid membrane', 'Stroma', 'Cytoplasm', 'Cell wall'],
    correctAnswerIndex: 0,
    topic: 'Light-DependentReactions',
  },
  {
    question: 'Which molecule carries energy from the light reactions to the Calvin cycle?',
    options: ['ATP and NADPH', 'Glucose and O2', 'Water and CO2', 'Ribulose and starch'],
    correctAnswerIndex: 0,
    topic: 'CalvinCycle',
  },
  {
    question: 'What happens to oxygen produced during photosynthesis?',
    options: ['Released as a byproduct', 'Stored in the vacuole', 'Used to make glucose', 'Converted to carbon dioxide'],
    correctAnswerIndex: 0,
    topic: 'GasExchange',
  },
];

const MOCK_MATCHING = {
  question: 'Match each stage of photosynthesis with its location:',
  pairs: [
    { premise: 'Light-dependent reactions', response: 'Thylakoid membrane' },
    { premise: 'Calvin cycle', response: 'Stroma' },
    { premise: 'Water splitting', response: 'Photosystem II' },
    { premise: 'Glucose synthesis', response: 'RuBisCO' },
  ],
  topic: 'PhotosynthesisOverview',
};

/** Builds a deterministic mock response matching what the real provider returns. */
export function mockLLM(prompt: string): string {
  if (prompt.includes('Summarize the following study material')) {
    return 'Photosynthesis is the process by which plants convert light energy into chemical energy. It occurs in the chloroplast, where chlorophyll captures light, driving the light-dependent reactions on the thylakoid membrane. The energy from these reactions powers the Calvin cycle in the stroma, which fixes carbon dioxide into glucose, releasing oxygen as a byproduct.';
  }

  if (prompt.includes('"guidance"')) {
    return JSON.stringify({
      guidance: 'Great question. Think about where light energy is captured first: chlorophyll sits in the thylakoid membrane, so the light-dependent reactions happen there before the Calvin cycle uses that energy in the stroma.',
    });
  }

  if (prompt.includes('Extract all readable text from the attached image')) {
    return JSON.stringify({
      text: 'Photosynthesis converts light energy into chemical energy in the chloroplast.',
    });
  }

  const isMatching = prompt.includes('"premise"') || prompt.includes('"pairs"');
  const requested = parseInt(prompt.match(/Generate (\d+)/)?.[1] ?? '3', 10);
  const count = Number.isFinite(requested) ? Math.min(Math.max(1, requested), 50) : 3;

  if (isMatching) {
    return JSON.stringify({
      title: 'Photosynthesis and Light Energy',
      questions: Array.from({ length: count }, () => ({ ...MOCK_MATCHING })),
    });
  }

  const questions = Array.from({ length: count }, (_, i) => {
    const base = MOCK_STANDARD[i % MOCK_STANDARD.length];
    return { ...base, options: [...base.options] };
  });
  return JSON.stringify({ title: 'Photosynthesis and Light Energy', questions });
}
