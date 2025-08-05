// src/app/actions.ts
'use server';

import { generateQuiz, type GenerateQuizOutput } from '@/ai/flows/generate-quiz';

export async function createQuiz(lectureText: string): Promise<GenerateQuizOutput | { error: string }> {
  if (!lectureText || lectureText.trim().length < 50) {
    return { error: 'Please provide a more substantial lecture text (at least 50 characters).' };
  }

  try {
    const quiz = await generateQuiz({ lectureText });
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
