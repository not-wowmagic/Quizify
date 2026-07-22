// src/ai/flows/generate-explanation.ts
/**
 * @fileOverview Flow to generate an explanation for a quiz question.
 * 
 * - generateExplanation - A function that generates an explanation for a quiz question.
 */

import { callGemini, extractJSON } from '@/ai/gemini';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import { GenerateExplanationOutputSchema } from '@/types/explanation';


export async function generateExplanation(
  input: GenerateExplanationInput
): Promise<GenerateExplanationOutput> {
  return generateExplanationFlow(input);
}


const generateExplanationFlow = async (input: GenerateExplanationInput): Promise<GenerateExplanationOutput> => {
  const prompt = `You are an expert tutor. Given a quiz question and its correct answer, provide a clear and concise explanation of why the answer is correct.\n\nQuestion: ${input.question}\nCorrect Answer: ${input.correctAnswer}\n\nReturn JSON: { "explanation": "..." }`;
  const content = await callGemini(prompt, { jsonMode: true });
  const parsed = extractJSON(content);
  return GenerateExplanationOutputSchema.parse(parsed);
};
