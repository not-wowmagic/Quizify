import { describe, expect, it } from 'vitest';
import { normalizeQuizTitle, titleFromFilename, titleFromQuestions } from '@/lib/quiz-title';

describe('quiz titles', () => {
  it('removes markdown/quotes and bounds long titles', () => {
    const title = normalizeQuizTitle('"**Cellular Respiration and ATP Production in Detail**"');
    expect(title).toBe('Cellular Respiration and ATP Production in Detail');
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it('falls back from generic and missing titles', () => {
    expect(normalizeQuizTitle('Untitled Quiz')).toBe('Study Quiz');
    expect(normalizeQuizTitle('Quiz • 8/17/2026')).toBe('Study Quiz');
    expect(normalizeQuizTitle(undefined)).toBe('Study Quiz');
    expect(titleFromFilename('French-Revolution.pdf')).toBe('French Revolution');
  });

  it('derives a useful fallback title from generated question topics', () => {
    expect(titleFromQuestions([{ topic: 'Network Definition' }])).toBe('Network Definition');
    expect(titleFromQuestions([{ topic: 'Network Definition' }, { topic: 'Network Models' }])).toBe('Network Definition');
    expect(titleFromQuestions([{ question: 'What is a data structure?' }])).toBe('Data Structure');
  });
});
