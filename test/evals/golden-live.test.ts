import { describe, it, expect } from 'vitest';
import { generateQuiz, QuizQuestionSchema, stringSimilarity, SIMILARITY_THRESHOLD } from '@/ai/flows/generate-quiz';
import { goldenTexts } from './golden-subjects';

// =========================================
// LIVE golden benchmark, OPT-IN only.
// Runs real LLM generation against 10 subject texts and asserts the same
// quality invariants the deterministic validators enforce.
//
// Run with:  npm run evals
// Requires OPENCODE_API_KEY (or GEMINI_API_KEY + AI_PROVIDER=gemini).
// Skipped automatically when no API key is present.
// =========================================

const hasKey = Boolean(process.env.OPENCODE_API_KEY || process.env.GEMINI_API_KEY);

describe.skipIf(!hasKey)('live LLM evals (golden benchmark)', () => {
  it('generates schema-conformant, duplicate-free, topic-tagged quizzes', async () => {
    const failures: string[] = [];

    for (const subject of goldenTexts) {
      try {
        const output = await generateQuiz({
          lectureText: subject.text,
          numQuestions: 5,
          difficulty: 'medium',
          questionType: 'mixed',
          language: 'English',
        });

        for (const q of output.questions) {
          const parsed = QuizQuestionSchema.safeParse(q);
          if (!parsed.success) {
            failures.push(`[${subject.subject}] schema violation: ${parsed.error.message}`);
            continue;
          }
          if (!q.topic || q.topic.trim().length === 0) {
            failures.push(`[${subject.subject}] missing topic on: ${q.question.slice(0, 60)}`);
          }
          if (q.type === 'standard') {
            if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) {
              failures.push(`[${subject.subject}] correctAnswerIndex out of bounds: ${q.question.slice(0, 60)}`);
            }
            for (let i = 0; i < q.options.length; i++) {
              for (let j = i + 1; j < q.options.length; j++) {
                if (stringSimilarity(q.options[i], q.options[j]) > SIMILARITY_THRESHOLD) {
                  failures.push(`[${subject.subject}] near-duplicate options: "${q.options[i]}" / "${q.options[j]}"`);
                }
              }
            }
          }
        }
      } catch (e) {
        failures.push(`[${subject.subject}] generation failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 300_000);
});
