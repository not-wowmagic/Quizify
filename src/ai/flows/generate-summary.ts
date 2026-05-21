/**
 * @fileOverview Flow to generate a summary of the provided text.
 *
 * - generateSummary - A function that generates a one-paragraph summary.
 * - GenerateSummaryInput - The input type for the generateSummary function.
 * - GenerateSummaryOutput - The return type for the generateSummary function.
 */

import { callGemini } from '@/ai/gemini';
import { z } from 'zod';

const GenerateSummaryInputSchema = z.object({
  lectureText: z.string().describe('The text of the lecture to summarize.'),
});
export type GenerateSummaryInput = z.infer<typeof GenerateSummaryInputSchema>;

const GenerateSummaryOutputSchema = z.object({
  summary: z.string().describe('A one-paragraph summary of the lecture text.'),
});
export type GenerateSummaryOutput = z.infer<typeof GenerateSummaryOutputSchema>;

export async function generateSummary(
  input: GenerateSummaryInput
): Promise<GenerateSummaryOutput> {
  return generateSummaryFlow(input);
}

const generateSummaryFlow = async (input: { lectureText: string }) => {
  const validatedInput = GenerateSummaryInputSchema.parse(input);
  
  const prompt = `Summarize the following text in one concise paragraph that captures the main points and key concepts:\n\n${validatedInput.lectureText}\n\nProvide ONLY the summary text without any additional formatting or JSON.`;
  const content = await callGemini(prompt);
  
  // Create and validate the output
  const result = {
    summary: content.trim()
  };
  
  return GenerateSummaryOutputSchema.parse(result);
};
