import { describe, expect, it } from 'vitest';
import {
  GenerateQuizInputSchema,
  QuizPayloadSchema,
  QuizQuestionSchema,
} from '@/ai/flows/generate-quiz';

const validInput = {
  lectureText: 'x'.repeat(100),
  numQuestions: 10,
  difficulty: 'medium' as const,
  questionType: 'multiple_choice' as const,
  language: 'English',
};

const standardQuestion = {
  type: 'standard' as const,
  question: 'What is 2 + 2?',
  options: ['3', '4'],
  correctAnswerIndex: 1,
};

describe('createQuiz strict input schema', () => {
  const strict = GenerateQuizInputSchema.strict();

  it('accepts a valid payload', () => {
    expect(strict.safeParse(validInput).success).toBe(true);
  });

  it('rejects a missing lectureText', () => {
    const { lectureText: _omit, ...withoutText } = validInput;
    expect(strict.safeParse(withoutText).success).toBe(false);
  });

  it('rejects the wrong numQuestions type', () => {
    expect(strict.safeParse({ ...validInput, numQuestions: '10' }).success).toBe(false);
  });

  it('rejects numQuestions above 50', () => {
    expect(strict.safeParse({ ...validInput, numQuestions: 51 }).success).toBe(false);
  });

  it('rejects lectureText above 100,000 characters', () => {
    expect(strict.safeParse({ ...validInput, lectureText: 'x'.repeat(100_001) }).success).toBe(false);
  });

  it('rejects unknown keys under strict() and reports unrecognized_keys', () => {
    const result = strict.safeParse({ ...validInput, admin: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.code === 'unrecognized_keys')).toBe(true);
    }
  });
});

describe('quiz payload and question bounds', () => {
  it('rejects more than 50 questions', () => {
    const questions = Array.from({ length: 51 }, () => standardQuestion);
    expect(QuizPayloadSchema.safeParse({ questions }).success).toBe(false);
  });

  it('rejects a standard question with more than six options', () => {
    const question = {
      ...standardQuestion,
      options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    };
    expect(QuizQuestionSchema.safeParse(question).success).toBe(false);
  });

  it('rejects correctAnswerIndex outside the options array', () => {
    const question = {
      ...standardQuestion,
      options: ['A', 'B'],
      correctAnswerIndex: 2,
    };
    expect(QuizQuestionSchema.safeParse(question).success).toBe(false);
  });

  it('rejects a matching question with more than eight pairs', () => {
    const question = {
      type: 'matching' as const,
      question: 'Match the pairs',
      pairs: Array.from({ length: 9 }, (_, i) => ({ premise: `P${i}`, response: `R${i}` })),
    };
    expect(QuizQuestionSchema.safeParse(question).success).toBe(false);
  });
});
