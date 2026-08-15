// src/types/history.ts
// Types shared between the server actions and the history/analytics UI.
import type { QuizQuestion } from '@/types/quiz';

export type AttemptAnswer = {
  index: number;
  type: 'standard' | 'matching';
  correct: boolean;
  topic?: string;
};

export interface QuizAttempt {
  id: string;
  device_id: string;
  quiz_id: string | null;
  title: string;
  score: number;
  total: number;
  /** Raw (unshuffled) questions, re-processed on retake for a fresh shuffle */
  questions: QuizQuestion[];
  answers: AttemptAnswer[];
  difficulty: string | null;
  question_type: string | null;
  language: string;
  duration_sec: number;
  created_at: string;
}
