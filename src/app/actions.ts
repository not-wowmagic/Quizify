// src/app/actions.ts
'use server';

import { generateQuiz, type GenerateQuizInput, type GenerateQuizOutput } from '@/ai/flows/generate-quiz';

export async function createQuiz(input: GenerateQuizInput): Promise<GenerateQuizOutput | { error: string }> {
  if (!input.lectureText || input.lectureText.trim().length < 50) {
    return { error: 'Please provide a more substantial lecture text (at least 50 characters).' };
  }

  try {
    const quiz = await generateQuiz(input);
    // Ensure we have questions
    if (!quiz.questions || quiz.questions.length === 0) {
        return { error: 'The AI could not generate a quiz from the provided text. Please try refining your text.' };
    }
    return quiz;
  } catch (e) {
    console.error(e);
    return { error: 'An unexpected error occurred while generating the quiz. Please try again later.' };
  }
}
