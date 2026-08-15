// src/components/quiz/types.ts
// Shared UI-state types for the quiz flow.

export type Difficulty = 'easy' | 'medium' | 'hard' | 'adaptive';

export type QuestionTypeId =
  | 'multiple_choice'
  | 'situational'
  | 'fill_in_the_blank'
  | 'true_false'
  | 'matching'
  | 'mixed';

export type StandardAnswer = { type: 'standard'; selectedIndex: number };
export type MatchingAnswer = { type: 'matching'; matches: Record<number, number>; checked: boolean };
export type QuizAnswer = StandardAnswer | MatchingAnswer;
