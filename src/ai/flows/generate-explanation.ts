// src/ai/flows/generate-explanation.ts
'use server';
/**
 * @fileOverview Flow to generate an explanation for a quiz question.
 * 
 * - generateExplanation - A function that generates an explanation for a quiz question.
 */

import { callOpenRouter } from '@/ai/openrouter';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import { GenerateExplanationInputSchema, GenerateExplanationOutputSchema } from '@/types/explanation';


export async function generateExplanation(
  input: GenerateExplanationInput
): Promise<GenerateExplanationOutput> {
  return generateExplanationFlow(input);
}


const generateExplanationFlow = async (input: GenerateExplanationInput): Promise<GenerateExplanationOutput> => {
  const prompt = `You are an expert tutor. Given a quiz question and its correct answer, provide a clear and concise explanation of why the answer is correct.\n\nQuestion: ${input.question}\nCorrect Answer: ${input.correctAnswer}\n\nReturn JSON: { "explanation": "..." }`;
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
  const content = await callOpenRouter(model, prompt);
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const match = content.match(/\{[\s\S]*\}/m);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Failed to parse JSON explanation: ' + content);
  }
  return GenerateExplanationOutputSchema.parse(parsed);
};
