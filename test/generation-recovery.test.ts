import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateQuiz, markGenerationCancelled } from '@/ai/flows/generate-quiz';

const input = {
  lectureText: 'Study material about photosynthesis, chloroplasts, light energy and the Calvin cycle in plants for several sentences.',
  numQuestions: 5,
  difficulty: 'medium' as const,
  questionType: 'multiple_choice' as const,
  language: 'English',
};

function validQuestions(prefix: string) {
  return Array.from({ length: 6 }, (_, index) => ({
    question: `${prefix} question ${index + 1}?`,
    options: [`Correct ${index + 1}`, `Wrong ${index + 1}`],
    correctAnswerIndex: 0,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('F-01 cooperative generation cancellation', () => {
  it('stops calling the provider once the generation is cancelled', async () => {
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('AI_PROVIDER', 'opencode');
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    const generationId = '11111111-1111-4111-8111-111111111111';
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      markGenerationCancelled(generationId);
      return new Response(
        JSON.stringify({ output_text: JSON.stringify({ title: 'Quiz', questions: validQuestions('A') }) }),
        { status: 200 },
      );
    });

    await generateQuiz(input, generationId);
    expect(calls).toBe(1);
  });
});

describe('F-02 provider-agnostic malformed-output recovery', () => {
  it('falls back for the default opencode provider when the first pass is malformed', async () => {
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('AI_PROVIDER', 'opencode');
    vi.stubEnv('OPENCODE_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const providers: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const isGemini = url.includes('generativelanguage');
      providers.push(isGemini ? 'gemini' : 'opencode');
      if (!isGemini) {
        return new Response(JSON.stringify({ output_text: JSON.stringify({ questions: [{ bad: true }] }) }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Recovered', questions: validQuestions('B') }) }] } }],
        }),
        { status: 200 },
      );
    });

    const result = await generateQuiz(input);
    expect(result.questions).toHaveLength(5);
    expect(providers).toContain('opencode');
    expect(providers).toContain('gemini');
  });
});
