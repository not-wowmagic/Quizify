'use server';

/**
 * @fileOverview Flow to generate challenging distractors for multiple-choice questions.
 *
 * - generateDistractors - A function that generates challenging distractors for multiple-choice questions.
 * - GenerateDistractorsInput - The input type for the generateDistractors function.
 * - GenerateDistractorsOutput - The return type for the generateDistractors function.
 */

import { callOpenRouter } from '@/ai/openrouter';
import { z } from 'zod';

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

const generateDistractorsFlow = async (input: any) => {
  const prompt = `You are an expert in generating challenging distractor options for multiple-choice questions.\n\nGiven a question and its correct answer, generate ${input.numDistractors} distractor options that are plausible but incorrect. Return JSON: { "distractors": ["a","b",...] }\n\nQuestion: ${input.question}\nCorrect Answer: ${input.correctAnswer}`;
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
  const content = await callOpenRouter(model, prompt);
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const match = content.match(/\{[\s\S]*\}/m);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Failed to parse JSON distractors: ' + content);
  }
  return GenerateDistractorsOutputSchema.parse(parsed);
};
