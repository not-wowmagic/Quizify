import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateQuiz } from '@/ai/flows/generate-quiz';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('generateQuiz provider concurrency', () => {
  it('keeps a 20-question generation within the provider-safe concurrency limit', async () => {
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('AI_PROVIDER', 'opencode');
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_MODEL', 'test-model');
    vi.stubEnv('OPENCODE_BASE_URL', 'http://provider.test/chat/completions');

    let activeRequests = 0;
    let maxActiveRequests = 0;
    const sessionIds: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get('user-agent')).toBe('Quizify/0.1.0');
      const sessionId = headers.get('x-opencode-session');
      expect(sessionId).toBeTruthy();
      sessionIds.push(sessionId ?? '');
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise(resolve => setTimeout(resolve, 10));
      activeRequests--;

      const questions = Array.from({ length: 10 }, (_, index) => ({
        question: `Question ${index}?`,
        options: [`Correct ${index}`, `Wrong A ${index}`, `Wrong B ${index}`, `Wrong C ${index}`],
        correctAnswerIndex: 0,
      }));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ title: 'Test Quiz', questions }) }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await generateQuiz({
      lectureText: 'This is enough study material to generate a quiz about photosynthesis and how plants convert light energy into chemical energy in chloroplasts.',
      numQuestions: 20,
      difficulty: 'medium',
      questionType: 'multiple_choice',
      language: 'English',
    });

    expect(result.questions).toHaveLength(20);
    expect(maxActiveRequests).toBeLessThanOrEqual(3);
    expect(sessionIds.length).toBeGreaterThan(1);
    expect(new Set(sessionIds).size).toBe(1);
    const firstSession = sessionIds[0];
    sessionIds.length = 0;
    await generateQuiz({
      lectureText: 'This is enough study material to generate a quiz about photosynthesis and how plants convert light energy into chemical energy in chloroplasts.',
      numQuestions: 5,
      difficulty: 'medium',
      questionType: 'multiple_choice',
      language: 'English',
    });
    expect(sessionIds[0]).not.toBe(firstSession);
  });
});
