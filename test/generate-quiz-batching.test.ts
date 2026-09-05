import { describe, expect, it } from 'vitest';
import {
  createGenerationTasks,
  MAX_GENERATION_CHUNK_SIZE,
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
});
