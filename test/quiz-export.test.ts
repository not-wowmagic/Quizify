import { describe, it, expect } from 'vitest';
import { buildAnkiTxt, buildQuizCsv } from '@/lib/quiz-export';
import type { Quiz } from '@/types/quiz';

const sampleQuiz: Quiz = {
  questions: [
    {
      type: 'standard',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswerIndex: 1,
      topic: 'Math',
    },
    {
      type: 'matching',
      question: 'Match each term with its definition:',
      pairs: [
        { premise: 'Photosynthesis', response: 'Plants convert light to energy' },
        { premise: 'Respiration', response: 'Cells release energy from glucose' },
      ],
      topic: 'Biology',
    },
  ],
};

describe('buildAnkiTxt', () => {
  it('produces one Tab-separated note per question', () => {
    const output = buildAnkiTxt(sampleQuiz);
    const notes = output.split('\n').filter(line => line.includes('\t'));
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note).toContain('\t');
    }
  });

  it('puts the question and options on the front, correct answer on the back', () => {
    const [front, back] = buildAnkiTxt({ questions: [sampleQuiz.questions[0]] }).split('\t');
    expect(front).toContain('What is 2 + 2?');
    expect(front).toContain('A. 3');
    expect(front).toContain('B. 4');
    expect(back).toBe('B. 4');
  });

  it('renders matching questions as premise lists with mapped responses', () => {
    const [front, back] = buildAnkiTxt({ questions: [sampleQuiz.questions[1]] }).split('\t');
    expect(front).toContain('1. Photosynthesis');
    expect(front).toContain('2. Respiration');
    expect(back).toContain('1. Plants convert light to energy');
    expect(back).toContain('2. Cells release energy from glucose');
  });
});

describe('buildQuizCsv', () => {
  it('emits a header row plus one row per question', () => {
    const rows = buildQuizCsv(sampleQuiz).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe('Question,Options,Correct Answer,Topic');
  });

  it('includes the topic column', () => {
    const rows = buildQuizCsv(sampleQuiz).split('\n');
    expect(rows[1]).toContain('Math');
    expect(rows[2]).toContain('Biology');
  });

  it('quotes fields containing commas or quotes', () => {
    const tricky: Quiz = {
      questions: [{
        type: 'standard',
        question: 'Choose the "best" option, please?',
        options: ['Option A, with comma', 'Option B'],
        correctAnswerIndex: 0,
      }],
    };
    const row = buildQuizCsv(tricky).split('\n')[1];
    expect(row.startsWith('"')).toBe(true);
    expect(row).toContain('""best""');
  });
});
