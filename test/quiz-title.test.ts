import { describe, expect, it } from 'vitest';
import { normalizeQuizTitle, titleFromFilename } from '@/lib/quiz-title';

describe('quiz titles', () => {
  it('removes markdown/quotes and bounds long titles', () => {
    const title = normalizeQuizTitle('"**Cellular Respiration and ATP Production in Detail**"');
    expect(title).toBe('Cellular Respiration and ATP Production in Detail');
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it('falls back from generic and missing titles', () => {
    expect(normalizeQuizTitle('Untitled Quiz')).toBe('Study Quiz');
    expect(normalizeQuizTitle(undefined)).toBe('Study Quiz');
    expect(titleFromFilename('French-Revolution.pdf')).toBe('French-Revolution');
  });
});
