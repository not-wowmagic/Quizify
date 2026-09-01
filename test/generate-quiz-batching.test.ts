import { describe, expect, it } from 'vitest';
import {
  createGenerationTasks,
  MAX_GENERATION_CHUNK_SIZE,
  questionsPerGenerationCall,
} from '@/ai/flows/generate-quiz';

const largeStudyText = Array.from(
  { length: 1200 },
  (_, index) => `Section ${index} explains a distinct concept with supporting details and examples.`,
).join(' ');

describe('large-text generation batching', () => {
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

  it('uses four fast provider calls for a typical 6-8k text with 20 questions', () => {
    const typicalText = 'Nursing care includes assessment, planning, implementation, and evaluation. '.repeat(90);
    const tasks = createGenerationTasks(typicalText, 20);

    expect(typicalText.length).toBeGreaterThan(6000);
    expect(typicalText.length).toBeLessThan(8000);
    expect(tasks).toHaveLength(4);
    expect(tasks.every(task => task.count === 5)).toBe(true);
  });

  it('caps maximum-size quizzes at five concurrent provider calls', () => {
    const tasks = createGenerationTasks(largeStudyText, 50);

    expect(questionsPerGenerationCall(20)).toBe(5);
    expect(questionsPerGenerationCall(50)).toBe(10);
    expect(tasks).toHaveLength(5);
    expect(tasks.every(task => task.count === 10)).toBe(true);
  });
});
