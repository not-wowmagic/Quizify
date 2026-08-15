// src/lib/quiz-processors.ts
// Pure quiz logic — no heavy parser imports. This module is safe to include
// in the main client bundle. File parsing lives in file-parsers.ts and is
// dynamically imported only when a user actually uploads a document.
import type { Quiz, QuizQuestion, StandardQuestion, MatchingQuestion } from '@/types/quiz';

// Helper function to shuffle arrays
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

/**
 * Processes a standard (multiple-choice) question — shuffles options and updates correct index.
 */
function processStandardQuestion(q: StandardQuestion): StandardQuestion {
  const optionObjects = q.options.map((opt, index) => ({
    text: opt,
    isCorrect: index === q.correctAnswerIndex
  }));

  // Don't shuffle for true/false questions
  const isTrueFalse = (q.options.length === 2 || q.options.length === 4) &&
    q.options.some(o => o.toLowerCase() === 'true') &&
    q.options.some(o => o.toLowerCase() === 'false');

  let shuffledObjects = optionObjects;
  if (!isTrueFalse) {
    shuffledObjects = shuffleArray(optionObjects);
  }

  const newOptions = shuffledObjects.map(o => o.text);
  const newCorrectAnswerIndex = shuffledObjects.findIndex(o => o.isCorrect);

  return {
    ...q,
    type: 'standard',
    options: newOptions,
    correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0,
  };
}

/**
 * Processes a matching question — shuffles the response column order.
 */
function processMatchingQuestion(q: MatchingQuestion): MatchingQuestion {
  // Create an array of response indices [0, 1, 2, ...] and shuffle them
  const responseIndices = q.pairs.map((_, i) => i);
  const shuffledIndices = shuffleArray(responseIndices);

  return {
    ...q,
    type: 'matching',
    shuffledResponseIndices: shuffledIndices,
  };
}

export const processQuiz = (quizResult: { questions: QuizQuestion[] }): Quiz => {
  // Shuffle question order
  const shuffledQuestions = shuffleArray(quizResult.questions);

  // Process each question based on type
  const processedQuestions = shuffledQuestions.map((q): QuizQuestion => {
    if (q.type === 'matching') {
      return processMatchingQuestion(q);
    }
    return processStandardQuestion(q);
  });

  return { questions: processedQuestions };
};

const isValidInput = (text: string, numQuestions: number | ''): boolean => {
  return text.trim().length >= 100 &&
         numQuestions !== '' &&
         Number(numQuestions) > 0 &&
         Number(numQuestions) <= 50;
};

export const quizHelpers = {
  isValidInput,
  shuffleArray,
};
