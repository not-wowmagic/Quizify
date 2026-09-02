import { describe, expect, it } from 'vitest';
import {
  createGenerationTasks,
  MAX_GENERATION_CHUNK_SIZE,
  questionsPerGenerationCall,
  generationModelOverride,
  buildStandardQuizPrompt,
} from '@/ai/flows/generate-quiz';
import { splitQuestionCount } from '@/lib/quiz-batching';

const largeStudyText = Array.from(
  { length: 1200 },
  (_, index) => `Section ${index} explains a distinct concept with supporting details and examples.`,
).join(' ');

describe('large-text generation batching', () => {
  it('splits high-count client requests into independently bounded actions', () => {
    expect(splitQuestionCount(20)).toEqual([10, 10]);
    expect(splitQuestionCount(50)).toEqual([10, 10, 10, 10, 10]);
  });

  it('keeps model prompts bounded while distributing questions across the document', () => {
    const tasks = createGenerationTasks(largeStudyText, 10, 10);

    expect(tasks).toHaveLength(2);
    expect(tasks.reduce((total, task) => total + task.count, 0)).toBe(10);
    expect(tasks.every(task => task.chunk.length <= MAX_GENERATION_CHUNK_SIZE)).toBe(true);
    expect(tasks[0].chunk).not.toBe(tasks[1].chunk);
  });

  it('reduces a 50-question quiz to five provider batches', () => {
    const tasks = createGenerationTasks(largeStudyText, 50, 10);

    expect(tasks).toHaveLength(5);
    expect(tasks.reduce((total, task) => total + task.count, 0)).toBe(50);
  });

  it('uses two provider calls for a typical 6-8k text with 20 questions', () => {
    const typicalText = Array.from(
      { length: 90 },
      (_, index) => `Nursing section ${index} covers assessment, planning, implementation, and evaluation.`,
    ).join(' ');
    const tasks = createGenerationTasks(typicalText, 20);

    expect(typicalText.length).toBeGreaterThan(6000);
    expect(typicalText.length).toBeLessThan(8000);
    expect(tasks).toHaveLength(2);
    expect(tasks.reduce((total, task) => total + task.count, 0)).toBe(20);
    expect(tasks.every(task => task.count === 10)).toBe(true);
  });

  it('caps maximum-size quizzes at five concurrent provider calls', () => {
    const tasks = createGenerationTasks(largeStudyText, 50);

    expect(questionsPerGenerationCall(20)).toBe(10);
    expect(questionsPerGenerationCall(50)).toBe(10);
    expect(tasks).toHaveLength(5);
    expect(tasks.every(task => task.count === 10)).toBe(true);
    expect(generationModelOverride(20)).toBe('muse-spark-1.2-contributor');
    expect(generationModelOverride(50)).toBe('mimo-v2.5');
  });

  it('keeps the low-cost provider prompt concise and omits optional quote generation', () => {
    const document = 'Grounded study material. '.repeat(200);
    const prompt = buildStandardQuizPrompt(document, {
      questionsPerChunk: 5,
      questionType: 'multiple_choice',
      difficulty: 'medium',
      language: 'English',
    });

    expect(prompt.length - document.length).toBeLessThan(1000);
    expect(prompt).not.toContain('supportingText');
    expect(prompt).toContain('correctAnswerIndex');
  });
});
