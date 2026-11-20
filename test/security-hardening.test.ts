import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  rateLimitDeps,
  verifyTurnstile,
  type SiteverifyFetch,
} from '@/lib/rate-limit';
import { recomputeAttemptScore, saveAttemptForClient, type SaveAttemptInput } from '@/lib/save-attempt';
import { readBoundedText } from '@/lib/web-reader';
import { buildQuizCsv } from '@/lib/quiz-export';
import { resolveOpencodeBaseUrl } from '@/ai/llm';

const VALID_TOKEN = 'valid-token';
const DEVICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function siteverify(body: {
  success: boolean;
  hostname?: string;
  action?: string;
}): SiteverifyFetch {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

const failingFetch: SiteverifyFetch = async () => {
  throw new Error('siteverify unreachable');
};

beforeAll(() => {
  vi.stubEnv('E2E_MOCK_AI', '');
  vi.stubEnv('NODE_ENV', 'test');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  rateLimitDeps.createLimiter = rateLimitDeps.defaultCreateLimiter;
});

describe('S-01 Turnstile enforcement', () => {
  it('skips verification only when no secret is configured', async () => {
    expect(await verifyTurnstile(undefined)).toBe(true);
  });

  it('rejects an invalid token when a secret is configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    expect(await verifyTurnstile('bad', 'createQuiz', siteverify({ success: false }))).toBe(false);
  });

  it('rejects a valid token from the wrong hostname', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.stubEnv('TURNSTILE_EXPECTED_HOSTNAME', 'quizify.netlify.app');
    expect(
      await verifyTurnstile(
        VALID_TOKEN,
        'createQuiz',
        siteverify({ success: true, hostname: 'evil.example', action: 'createQuiz' }),
      ),
    ).toBe(false);
  });

  it('rejects a valid token for the wrong action', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    expect(
      await verifyTurnstile(VALID_TOKEN, 'createQuiz', siteverify({ success: true, action: 'publishQuiz' })),
    ).toBe(false);
  });

  it('fails closed when siteverify is unreachable', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    expect(await verifyTurnstile(VALID_TOKEN, 'createQuiz', failingFetch)).toBe(false);
  });
});

describe('S-02 rate limiting with the in-memory fallback', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps serving in production when Upstash is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = await checkRateLimit('quiz:1.2.3.4', 30, 3_600_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSec).toBe(0);
  });

  it('keeps serving in production when the Redis request errors', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    rateLimitDeps.createLimiter = () => ({
      limit: async () => {
        throw new Error('redis down');
      },
    });
    expect((await checkRateLimit('quiz:1.2.3.5', 30, 3_600_000)).allowed).toBe(true);
  });

  it('still enforces the budget after falling back', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await checkRateLimit('quiz:fallback-budget', 1, 3_600_000)).allowed).toBe(true);
    const blocked = await checkRateLimit('quiz:fallback-budget', 1, 3_600_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('keeps local development working with the in-memory fallback', async () => {
    expect((await checkRateLimit('quiz:1.2.3.7', 30, 3_600_000)).allowed).toBe(true);
  });
});

describe('S-04 server-side score recomputation', () => {
  const question = {
    type: 'standard' as const,
    question: 'Two plus two?',
    options: ['3', '4', '5'],
    correctAnswerIndex: 1,
  };

  function input(score: number, selectedIndex: number): SaveAttemptInput {
    return {
      deviceId: DEVICE,
      title: 'Attempt',
      score,
      total: 1,
      questions: [question],
      answers: [{ index: 0, type: 'standard', correct: true, selectedIndex }],
      language: 'English',
      durationSec: 1,
    };
  }

  it('ignores a forged perfect score and recomputes from the selection', () => {
    const result = recomputeAttemptScore(
      [question],
      [{ index: 0, type: 'standard', correct: true, selectedIndex: 0 }],
    );
    expect(result.score).toBe(0);
    expect(result.answers[0].correct).toBe(false);
  });

  it('accepts a legitimate score', () => {
    const result = recomputeAttemptScore(
      [question],
      [{ index: 0, type: 'standard', correct: false, selectedIndex: 1 }],
    );
    expect(result.score).toBe(1);
    expect(result.answers[0].correct).toBe(true);
  });

  it('saves an attempt whose submitted score matches its total', async () => {
    vi.stubEnv('E2E_MOCK_AI', '1');
    const result = await saveAttemptForClient(input(1, 1), '127.0.0.1');
    expect('id' in result).toBe(true);
  });

  it('rejects a submitted score above the submitted total', async () => {
    vi.stubEnv('E2E_MOCK_AI', '1');
    const result = await saveAttemptForClient(input(5, 1), '127.0.0.1');
    expect(result).toEqual({ error: 'Invalid attempt data.' });
  });

  it('rejects a total that does not match the question count', async () => {
    vi.stubEnv('E2E_MOCK_AI', '1');
    const result = await saveAttemptForClient({ ...input(1, 1), total: 2 }, '127.0.0.1');
    expect(result).toEqual({ error: 'Invalid attempt data.' });
  });

  it('rejects duplicate answer indices', async () => {
    vi.stubEnv('E2E_MOCK_AI', '1');
    const answer = { index: 0, type: 'standard' as const, selectedIndex: 1 };
    const result = await saveAttemptForClient({ ...input(1, 1), answers: [answer, answer] }, '127.0.0.1');
    expect(result).toEqual({ error: 'Invalid attempt data.' });
  });

  it('deduplicates duplicate answers when recomputing', () => {
    const answer = { index: 0, type: 'standard' as const, selectedIndex: 1 };
    const result = recomputeAttemptScore([question], [answer, answer]);
    expect(result.score).toBe(1);
    expect(result.answers).toHaveLength(1);
  });
});

describe('S-06 bounded response reading', () => {
  it('aborts once the cap is exceeded even without content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a'.repeat(700)));
        controller.enqueue(new TextEncoder().encode('b'.repeat(700)));
        controller.close();
      },
    });
    await expect(readBoundedText(stream, 1000)).rejects.toThrow('too large');
  });

  it('returns the full body when it fits under the cap', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('small body'));
        controller.close();
      },
    });
    await expect(readBoundedText(stream, 1000)).resolves.toBe('small body');
  });
});

describe('S-09 CSV formula neutralization', () => {
  it('prefixes leading formula characters with an apostrophe', () => {
    const csv = buildQuizCsv({
      title: 'T',
      questions: [
        {
          type: 'standard',
          question: '=IMPORTDATA("http://evil")',
          options: ['+1', '-1', '@SUM'],
          correctAnswerIndex: 0,
        },
      ],
    });
    expect(csv).not.toContain(',=IMPORTDATA');
    expect(csv).toContain("'=IMPORTDATA");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-1");
    expect(csv).toContain("'@SUM");
  });
});

describe('S-11 OpenCode base URL validation', () => {
  afterEach(() => {
    delete process.env.OPENCODE_BASE_URL;
  });

  it('falls back to the documented default for a non-https or unexpected host', () => {
    vi.stubEnv('OPENCODE_BASE_URL', 'http://evil.example/v1/chat/completions');
    expect(resolveOpencodeBaseUrl(false)).toBe(
      'https://opencode.ai/zen/go/v1/chat/completions',
    );
  });

  it('accepts the documented https host', () => {
    vi.stubEnv('OPENCODE_BASE_URL', 'https://opencode.ai/zen/go/v1/chat/completions');
    expect(resolveOpencodeBaseUrl(false)).toBe('https://opencode.ai/zen/go/v1/chat/completions');
  });
});
