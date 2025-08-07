'use server';
/**
 * @fileOverview Flow to generate a summary of the provided text.
 *
 * - generateSummary - A function that generates a one-paragraph summary.
 * - GenerateSummaryInput - The input type for the generateSummary function.
 * - GenerateSummaryOutput - The return type for the generateSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

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

const prompt = ai.definePrompt({
  name: 'generateSummaryPrompt',
  input: {schema: GenerateSummaryInputSchema},
  output: {schema: GenerateSummaryOutputSchema},
  prompt: `You are an expert in summarizing complex topics.
  
  Given the following text, please generate a concise, one-paragraph summary that captures the main points.
  The summary should give the reader a quick overview of the topic.
  
  Lecture Text:
  {{{lectureText}}}
  
  Summary:`,
});

const generateSummaryFlow = ai.defineFlow(
  {
    name: 'generateSummaryFlow',
    inputSchema: GenerateSummaryInputSchema,
    outputSchema: GenerateSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
