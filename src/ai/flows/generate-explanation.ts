// src/ai/flows/generate-explanation.ts
'use server';
/**
 * @fileOverview Flow to generate an explanation for a quiz question.
 * 
 * - generateExplanation - A function that generates an explanation for a quiz question.
 */

import {ai} from '@/ai/genkit';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import { GenerateExplanationInputSchema, GenerateExplanationOutputSchema } from '@/types/explanation';


export async function generateExplanation(
  input: GenerateExplanationInput
): Promise<GenerateExplanationOutput> {
  return generateExplanationFlow(input);
}


const prompt = ai.definePrompt({
  name: 'generateExplanationPrompt',
  input: {schema: GenerateExplanationInputSchema},
  output: {schema: GenerateExplanationOutputSchema},
  prompt: `You are an expert tutor. Given a quiz question and its correct answer, provide a clear and concise explanation of why the answer is correct.

  Question: {{{question}}}
  Correct Answer: {{{correctAnswer}}}

  Explanation:`,
});


const generateExplanationFlow = ai.defineFlow(
  {
    name: 'generateExplanationFlow',
    inputSchema: GenerateExplanationInputSchema,
    outputSchema: GenerateExplanationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
