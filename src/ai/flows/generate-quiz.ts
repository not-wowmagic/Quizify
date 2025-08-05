// src/ai/flows/generate-quiz.ts
'use server';
/**
 * @fileOverview Generates a multiple-choice quiz from lecture text using GenAI.
 *
 * - generateQuiz - A function that handles the quiz generation process.
 * - GenerateQuizInput - The input type for the generateQuiz function.
 * - GenerateQuizOutput - The return type for the generateQuiz function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateQuizInputSchema = z.object({
  lectureText: z.string().describe('The text of the lecture to generate a quiz from.'),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;

const QuizQuestionSchema = z.object({
  question: z.string().describe('The quiz question.'),
  options: z.array(z.string()).describe('An array of four possible answers.'),
  correctAnswerIndex: z
    .number()
    .min(0)
    .max(3)
    .describe('The index of the correct answer in the options array.'),
});

const GenerateQuizOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('An array of quiz questions.'),
});
export type GenerateQuizOutput = z.infer<typeof GenerateQuizOutputSchema>;

export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizOutput> {
  return generateQuizFlow(input);
}

const shouldAddDistractionTool = ai.defineTool({
  name: 'shouldAddDistraction',
  description: 'Determine if a given fact from lecture text should be used as a distractor in a quiz question.',
  inputSchema: z.object({
    fact: z.string().describe('A fact extracted from the lecture text.'),
    question: z.string().describe('The question the fact is being considered for.'),
  }),
  outputSchema: z.boolean().describe('True if the fact should be used as a distractor, false otherwise.'),
},
async (input) => {
  // Basic implementation: always return true.
  // A more advanced version could use an LLM to determine if the fact is relevant but incorrect.
  return true;
});

const generateQuizPrompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: {schema: GenerateQuizInputSchema},
  output: {schema: GenerateQuizOutputSchema},
  tools: [shouldAddDistractionTool],
  prompt: `You are an expert quiz generator.  Given the following lecture text, generate a multiple-choice quiz with 10-20 questions.

Each question should have four options, and one correct answer. Indicate the index of the correct answer in the correctAnswerIndex field.

Lecture Text:
{{lectureText}}

Output the quiz in JSON format.

Here's an example of the output format:
{
  "questions": [
    {
      "question": "What is the capital of France?",
      "options": ["Berlin", "Paris", "Madrid", "Rome"],
      "correctAnswerIndex": 1
    },
    {
      "question": "What is the highest mountain in the world?",
      "options": ["K2", "Kangchenjunga", "Mount Everest", "Lhotse"],
      "correctAnswerIndex": 2
    }
  ]
}

When generating options for questions, use the 'shouldAddDistraction' tool to generate reasonable but incorrect options, in order to make the quiz more challenging.
`,
});

const generateQuizFlow = ai.defineFlow(
  {
    name: 'generateQuizFlow',
    inputSchema: GenerateQuizInputSchema,
    outputSchema: GenerateQuizOutputSchema,
  },
  async input => {
    const {output} = await generateQuizPrompt(input);
    return output!;
  }
);
