import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildChatMessages, parseOpenAIChatResponse, parseOpenAIResponsesResponse, resolveProvider, LLMAPIError } from '@/ai/llm';

interface MuseRequestBody {
  model?: string;
  input?: unknown;
}

describe('buildChatMessages', () => {
  it('puts the system instruction first, then the user content', () => {
    const messages = buildChatMessages('user prompt', 'system rules');
    expect(messages).toEqual([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'user prompt' },
    ]);
  });

  it('omits the system message when not provided', () => {
    const messages = buildChatMessages('only user');
    expect(messages).toEqual([{ role: 'user', content: 'only user' }]);
  });

  it('never leaks user content into the system role', () => {
    const messages = buildChatMessages('user text', 'system text');
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('system text');
    expect(messages[1].content).toBe('user text');
  });
});

describe('parseOpenAIChatResponse', () => {
  it('extracts the assistant message content', () => {
    const text = parseOpenAIChatResponse({
      choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }],
    });
    expect(text).toBe('{"a":1}');
  });

  it('throws on an API error body', () => {
    expect(() =>
      parseOpenAIChatResponse({ error: { message: 'insufficient quota' } })
    ).toThrowError(LLMAPIError);
    expect(() =>
      parseOpenAIChatResponse({ error: { message: 'insufficient quota' } })
    ).toThrowError(/insufficient quota/);
  });

  it('throws when content is missing', () => {
    expect(() => parseOpenAIChatResponse({ choices: [{ message: {}, finish_reason: 'stop' }] })).toThrow(
      /no content/
    );
    expect(() => parseOpenAIChatResponse({})).toThrow(/no content/);
  });

  it('throws on non-stop finish reasons', () => {
    expect(() =>
      parseOpenAIChatResponse({ choices: [{ message: {}, finish_reason: 'length' }] })
    ).toThrow(/finish reason: length/i);
  });
});

describe('parseOpenAIResponsesResponse', () => {
  it('extracts output_text from a Responses API response', () => {
    expect(parseOpenAIResponsesResponse({ output_text: '{"ok":true}' })).toBe('{"ok":true}');
  });
});

describe('resolveProvider', () => {
  const original = process.env.AI_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = original;
  });

  it('defaults to opencode', () => {
    delete process.env.AI_PROVIDER;
    expect(resolveProvider()).toBe('opencode');
  });

  it('accepts opencode and gemini', () => {
    process.env.AI_PROVIDER = 'gemini';
    expect(resolveProvider()).toBe('gemini');
    process.env.AI_PROVIDER = 'OPEncode';
    expect(resolveProvider()).toBe('opencode');
  });

  it('throws for invalid providers', () => {
    process.env.AI_PROVIDER = 'anthropic';
    expect(() => resolveProvider()).toThrow(/invalid value/);
  });
});

describe('callLLM env key errors (no network)', () => {
  beforeEach(() => {
    vi.stubEnv('OPENCODE_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('AI_PROVIDER', 'opencode');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports a missing OPENCODE_API_KEY with the env var name (for client error mapping)', async () => {
    const { callLLM } = await import('@/ai/llm');
    await expect(callLLM('hello')).rejects.toThrow(/OPENCODE_API_KEY/);
  });
});

describe('callLLM provider defaults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses the Muse Spark OpenCode model when no model is configured', async () => {
    let requestedModel = '';
    vi.stubGlobal('fetch', async (_url: string, init: { body?: BodyInit }) => {
      // SAFETY: this test supplies the JSON request body and only reads its model field.
      const requestBody = JSON.parse(String(init.body)) as { model?: string };
      requestedModel = requestBody.model ?? '';
      return new Response(JSON.stringify({ output_text: '{"ok":true}' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER', 'opencode');
    vi.stubEnv('OPENCODE_MODEL', '');

    const { callLLM } = await import('@/ai/llm');
    await expect(callLLM('hello')).resolves.toBe('{"ok":true}');
    expect(requestedModel).toBe('muse-spark-1.2-contributor');
  });

  it('uses the Responses API for Muse Spark', async () => {
    let requestUrl = '';
    let requestBody: MuseRequestBody = {};
    vi.stubGlobal('fetch', async (url: string, init: { body?: BodyInit }) => {
      requestUrl = url;
      // SAFETY: this test supplies the JSON request body and only reads its request fields.
      requestBody = JSON.parse(String(init.body)) as typeof requestBody;
      return new Response(JSON.stringify({ output_text: '{"questions":[]}' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER', 'opencode');
    vi.stubEnv('OPENCODE_MODEL', 'muse-spark-1.2-contributor');

    const { callLLM } = await import('@/ai/llm');
    await expect(callLLM('hello')).resolves.toBe('{"questions":[]}');
    expect(requestUrl).toContain('/responses');
    expect(requestBody.model).toBe('muse-spark-1.2-contributor');
    expect(requestBody.input).toBeDefined();
  });
});

describe('callLLM deadline handling (stubbed fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('fails fast without calling the API when the deadline has already passed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER', 'opencode');

    const { callLLM } = await import('@/ai/llm');
    await expect(callLLM('hi', { deadlineMs: Date.now() - 1000 })).rejects.toThrow(/deadline exceeded/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamps the per-attempt timeout to the remaining deadline and aborts', async () => {
    vi.useFakeTimers();
    let abortSignal: AbortSignal | undefined;

    vi.stubGlobal('fetch', (_url: string, init: { signal?: AbortSignal }) => {
      abortSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      });
    });
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER', 'opencode');

    const { callLLM } = await import('@/ai/llm');
    // 60s nominal timeout, but only 5s remain until the deadline
    const promise = callLLM('hi', { timeoutMs: 60_000, deadlineMs: Date.now() + 5000 });
    // Attach the handler immediately so the rejection is never unhandled
    const assertion = expect(promise).rejects.toThrow(/deadline exceeded|timed out after/);
    // Advance past the abort (5s) AND the 1s retry delay so attempt 2 runs
    await vi.advanceTimersByTimeAsync(10_000);

    expect(abortSignal?.aborted).toBe(true);
    await assertion;
  });

  it('does not start a second attempt once the deadline has passed', async () => {
    vi.useFakeTimers();
    let fetchCalls = 0;

    vi.stubGlobal('fetch', (_url: string, init: { signal?: AbortSignal }) => {
      fetchCalls++;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      });
    });
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER', 'opencode');

    const { callLLM } = await import('@/ai/llm');
    const promise = callLLM('hi', { timeoutMs: 60_000, deadlineMs: Date.now() + 4000 });
    // Attach the handler immediately so the rejection is never unhandled
    const assertion = expect(promise).rejects.toThrow(/deadline exceeded/);
    await vi.advanceTimersByTimeAsync(60_000);

    // First attempt aborted at 4s; the deadline blocks the retry attempt.
    expect(fetchCalls).toBe(1);
    await assertion;
  });
});
