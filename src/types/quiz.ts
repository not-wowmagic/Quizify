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
  /** Short topic label from the AI (e.g. "Cellular Respiration"), used for analytics */
  topic?: string;
  /** Timestamp/source anchor, e.g. "Discussed at 04:15 in the lecture." */
  supportingText?: string;
  /** Difficulty tier, present for adaptive quizzes */
  difficultyTier?: 'easy' | 'medium' | 'hard';
}

export interface MatchingQuestion {
  type: 'matching';
  question: string;
  pairs: MatchingPair[];
  /** Short topic label from the AI (e.g. "Cellular Respiration"), used for analytics */
  topic?: string;
  /** Difficulty tier, present for adaptive quizzes */
  difficultyTier?: 'easy' | 'medium' | 'hard';
  /** Shuffled response indices used by the UI, set during processQuiz */
  shuffledResponseIndices?: number[];
}

export type QuizQuestion = StandardQuestion | MatchingQuestion;

export interface Quiz {
  questions: QuizQuestion[];
  title?: string;
  summary?: string;
}
