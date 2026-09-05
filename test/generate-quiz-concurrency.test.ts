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
    vi.stubGlobal('fetch', async () => {
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
  });
});
