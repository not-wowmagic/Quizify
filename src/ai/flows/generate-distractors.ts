'use server';

/**
 * @fileOverview Flow to generate challenging distractors for multiple-choice questions.
 *
 * - generateDistractors - A function that generates challenging distractors for multiple-choice questions.
 * - GenerateDistractorsInput - The input type for the generateDistractors function.
 * - GenerateDistractorsOutput - The return type for the generateDistractors function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateDistractorsInputSchema = z.object({
  question: z.string().describe('The multiple-choice question.'),
  correctAnswer: z.string().describe('The correct answer to the question.'),
  numDistractors: z
    .number()
    .describe('The number of distractors to generate.')
    .default(3),
});
export type GenerateDistractorsInput = z.infer<typeof GenerateDistractorsInputSchema>;

const GenerateDistractorsOutputSchema = z.object({
  distractors: z
    .array(z.string())
    .describe('An array of challenging distractor options.'),
});
export type GenerateDistractorsOutput = z.infer<typeof GenerateDistractorsOutputSchema>;

export async function generateDistractors(
  input: GenerateDistractorsInput
): Promise<GenerateDistractorsOutput> {
  return generateDistractorsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateDistractorsPrompt',
  input: {schema: GenerateDistractorsInputSchema},
  output: {schema: GenerateDistractorsOutputSchema},
  prompt: `You are an expert in generating challenging distractor options for multiple-choice questions.

  Given a question and its correct answer, generate {{{numDistractors}}} distractor options that are plausible but incorrect.
  The distractors should be designed to test the understanding of the subject matter and differentiate between those who have a strong grasp of the material and those who do not.
  Make sure that each distractor is different from the correct answer.

  Question: {{{question}}}
  Correct Answer: {{{correctAnswer}}}

  Distractors:`, // The LLM is expected to return an array of strings
});

const generateDistractorsFlow = ai.defineFlow(
  {
    name: 'generateDistractorsFlow',
    inputSchema: GenerateDistractorsInputSchema,
    outputSchema: GenerateDistractorsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
