// src/types/quiz.ts

export interface MatchingPair {
  premise: string;
  response: string;
}

export interface StandardQuestion {
  type: 'standard';
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

export interface MatchingQuestion {
  type: 'matching';
  question: string;
  pairs: MatchingPair[];
  /** Shuffled response indices used by the UI — set during processQuiz */
  shuffledResponseIndices?: number[];
}

export type QuizQuestion = StandardQuestion | MatchingQuestion;

export interface Quiz {
  questions: QuizQuestion[];
  summary?: string;
}
