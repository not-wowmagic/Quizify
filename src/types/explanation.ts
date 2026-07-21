// src/types/explanation.ts
import { z } from 'zod';

export const GenerateExplanationInputSchema = z.object({
  question: z.string().max(5000).describe('The quiz question.'),
  correctAnswer: z.string().max(5000).describe('The correct answer to the question.'),
});
export type GenerateExplanationInput = z.infer<typeof GenerateExplanationInputSchema>;

export const GenerateExplanationOutputSchema = z.object({
  explanation: z.string().describe('A detailed explanation of why the answer is correct.'),
});
export type GenerateExplanationOutput = z.infer<typeof GenerateExplanationOutputSchema>;
