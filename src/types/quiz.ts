// src/types/quiz.ts
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

export interface Quiz {
  questions: QuizQuestion[];
  summary?: string;
}
