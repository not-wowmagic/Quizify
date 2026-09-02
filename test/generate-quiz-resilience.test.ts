import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dedupeQuestionOptions,
  generateQuiz,
  getGenerationQuestionCount,
} from '@/ai/flows/generate-quiz';

function standardQuestions(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    question: `${prefix} question ${index + 1}?`,
    options: [`Correct ${index + 1}`, `Wrong A ${index + 1}`, `Wrong B ${index + 1}`, `Wrong C ${index + 1}`],
    correctAnswerIndex: 0,
  }));
}

const input = {
  lectureText: 'This is enough study material to generate questions about photosynthesis, chloroplasts, light energy, chemical energy, and the Calvin cycle in plants.',
  numQuestions: 5,
  difficulty: 'medium' as const,
  questionType: 'multiple_choice' as const,
  language: 'English',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('generateQuiz provider resilience', () => {
  it('oversamples provider requests to absorb validation drops', () => {
    expect(getGenerationQuestionCount(20)).toBe(23);
    expect(getGenerationQuestionCount(50)).toBe(58);
  });

  it('keeps distinct labels that share a suffix', () => {
    const question = {
      type: 'standard' as const,
      question: 'Which nursing specialty applies?',
      options: ['Pediatric Nursing', 'Geriatric Nursing', 'Emergency Medicine', 'Public Health'],
      correctAnswerIndex: 0,
    };

    expect(dedupeQuestionOptions([question])).toHaveLength(1);
  });

  it('tops up a short Gemini response to the requested count', async () => {
    let geminiCalls = 0;
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', async () => {
      geminiCalls++;
      const questions = geminiCalls === 1
        ? standardQuestions(4, 'Initial')
        : standardQuestions(3, 'Top up');
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Test Quiz', questions }) }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await generateQuiz(input);

    expect(result.questions).toHaveLength(5);
    expect(geminiCalls).toBe(2);
  });

  it('falls back to OpenCode only when Gemini produces no usable output', async () => {
    const providers: string[] = [];
    vi.stubEnv('E2E_MOCK_AI', '');
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('OPENCODE_API_KEY', 'fallback-key');
    vi.stubGlobal('fetch', async (url: string) => {
      providers.push(url.includes('generativelanguage') ? 'gemini' : 'opencode');
      if (url.includes('generativelanguage')) {
        return new Response(JSON.stringify({ error: { message: 'provider unavailable' } }), { status: 503 });
      }
      return new Response(JSON.stringify({
        output_text: JSON.stringify({ title: 'Fallback Quiz', questions: standardQuestions(6, 'Fallback') }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await generateQuiz(input);

    expect(result.questions).toHaveLength(5);
    expect(providers).toContain('gemini');
    expect(providers).toContain('opencode');
  });
});
