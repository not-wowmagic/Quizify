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
  /** Short topic label from the AI (e.g. "Cellular Respiration") — used for analytics */
  topic?: string;
}

export interface MatchingQuestion {
  type: 'matching';
  question: string;
  pairs: MatchingPair[];
  /** Short topic label from the AI (e.g. "Cellular Respiration") — used for analytics */
  topic?: string;
  /** Shuffled response indices used by the UI — set during processQuiz */
  shuffledResponseIndices?: number[];
}

export type QuizQuestion = StandardQuestion | MatchingQuestion;

export interface Quiz {
  questions: QuizQuestion[];
  summary?: string;
}
