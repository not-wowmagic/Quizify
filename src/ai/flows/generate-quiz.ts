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
  numQuestions: z.number().describe('The number of questions to generate.'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('The difficulty of the quiz.'),
  questionType: z.enum(['multiple_choice', 'situational', 'fill_in_the_blank', 'true_false', 'mixed']).describe('The type of questions to generate.'),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;

const QuizQuestionSchema = z.object({
  question: z.string().describe('The quiz question.'),
  options: z.array(z.string()).describe('An array of possible answers. For true/false, this will be ["True", "False"].'),
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
  const quiz = await generateQuizFlow(input);
  // Shuffle the questions
  for (let i = quiz.questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [quiz.questions[i], quiz.questions[j]] = [quiz.questions[j], quiz.questions[i]];
  }

  // Shuffle the options for each question
  quiz.questions.forEach((q) => {
    // Don't shuffle for true/false questions
    if (q.options.length === 2 && q.options[0].toLowerCase() === 'true' && q.options[1].toLowerCase() === 'false') {
        return;
    }
    const correctAnswer = q.options[q.correctAnswerIndex];
    // Fisher-Yates shuffle
    for (let i = q.options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
    }
    q.correctAnswerIndex = q.options.indexOf(correctAnswer);
  });
  return quiz;
}

const generateQuizPrompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: {schema: GenerateQuizInputSchema},
  output: {schema: GenerateQuizOutputSchema},
  prompt: `You are an expert quiz generator. Given the following lecture text, generate a quiz with {{{numQuestions}}} questions with a difficulty of '{{{difficulty}}}'.

The user has requested the following question type: '{{{questionType}}}'.
- If 'multiple_choice', generate standard multiple-choice questions with 4 options.
- If 'situational', generate questions that present a scenario and ask how to apply knowledge.
- If 'fill_in_the_blank', generate questions with a blank space and provide options to fill it. Use "_____" for the blank.
- If 'true_false', generate a statement that is either true or false. The options array should contain only "True" and "False".
- If 'mixed', generate a combination of all the above question types.

For each question, provide options and indicate the index of the correct answer in the correctAnswerIndex field. For all types except true/false, please provide 4 options.

Lecture Text:
{{lectureText}}

Output the quiz in JSON format.

Here's an example of the output format for a multiple choice question:
{
  "questions": [
    {
      "question": "What is the capital of France?",
      "options": ["Berlin", "Paris", "Madrid", "Rome"],
      "correctAnswerIndex": 1
    }
  ]
}

When generating options for questions (where applicable), create reasonable but incorrect options, in order to make the quiz more challenging, especially for higher difficulty levels.
`,
});

const generateQuizFlow = ai.defineFlow(
  {
    name: 'generateQuizFlow',
    inputSchema: GenerateQuizInputSchema,
    outputSchema: GenerateQuizOutputSchema,
  },
  async input => {
    const model = 'googleai/gemini-1.5-flash-latest';
    const {output} = await generateQuizPrompt(input, { model });
    return output!;
  }
);
