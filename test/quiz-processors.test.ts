import { describe, it, expect } from 'vitest';
import { processQuiz, quizHelpers } from '@/lib/quiz-processors';
import type { QuizQuestion, StandardQuestion } from '@/types/quiz';

describe('processQuiz', () => {
  it('preserves every question and remaps the correct answer after shuffling', () => {
    const questions: StandardQuestion[] = Array.from({ length: 8 }, (_, i) => ({
      type: 'standard',
      question: `Question ${i}?`,
      options: ['A', 'B', 'C', 'D'],
      correctAnswerIndex: i % 4,
    }));

    const quiz = processQuiz({ questions });

    expect(quiz.questions).toHaveLength(8);

    // The correct option text must match the original correct option text,
    // regardless of where it was shuffled to (question order is shuffled too,
    // so match by question text, not index).
    const original = new Map(questions.map(q => [q.question, q.options[q.correctAnswerIndex]]));
    quiz.questions.forEach((q) => {
      if (q.type === 'standard') {
        expect(q.options[q.correctAnswerIndex]).toBe(original.get(q.question));
        expect(q.correctAnswerIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctAnswerIndex).toBeLessThan(q.options.length);
      }
    });
  });

  it('does not shuffle true/false questions', () => {
    const questions: QuizQuestion[] = [
      {
        type: 'standard',
        question: 'Water boils at 100°C?',
        options: ['True', 'False'],
        correctAnswerIndex: 0,
      },
    ];

    const quiz = processQuiz({ questions });
    const q = quiz.questions[0];
    if (q.type === 'standard') {
      expect(q.options).toEqual(['True', 'False']);
      expect(q.correctAnswerIndex).toBe(0);
    }
  });

  it('shuffles matching response columns into a permutation', () => {
    const questions: QuizQuestion[] = [
      {
        type: 'matching',
        question: 'Match terms.',
        pairs: [
          { premise: 'A', response: '1' },
          { premise: 'B', response: '2' },
          { premise: 'C', response: '3' },
          { premise: 'D', response: '4' },
          { premise: 'E', response: '5' },
        ],
      },
    ];

    const quiz = processQuiz({ questions });
    const q = quiz.questions[0];
    if (q.type === 'matching' && q.shuffledResponseIndices) {
      const indices = [...q.shuffledResponseIndices].sort((a, b) => a - b);
      expect(indices).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(q.shuffledResponseIndices).size).toBe(5);
    }
  });
});

describe('quizHelpers', () => {
  it('validates input length and question count bounds', () => {
    expect(quizHelpers.isValidInput('x'.repeat(100), 10)).toBe(true);
    expect(quizHelpers.isValidInput('short', 10)).toBe(false);
    expect(quizHelpers.isValidInput('x'.repeat(100), 0)).toBe(false);
    expect(quizHelpers.isValidInput('x'.repeat(100), 51)).toBe(false);
    expect(quizHelpers.isValidInput('x'.repeat(100), '')).toBe(false);
  });

  it('shuffleArray returns a permutation of the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = quizHelpers.shuffleArray(input);
    expect(shuffled).toHaveLength(input.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b));
  });
});
