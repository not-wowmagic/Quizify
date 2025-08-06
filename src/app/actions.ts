// src/app/actions.ts
'use server';

import { generateQuiz, type GenerateQuizInput, type GenerateQuizOutput } from '@/ai/flows/generate-quiz';
import { generateExplanation } from '@/ai/flows/generate-explanation';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';

export async function createQuiz(input: Omit<GenerateQuizInput, 'model'>): Promise<GenerateQuizOutput | { error: string }> {
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

export async function explainAnswer(input: GenerateExplanationInput): Promise<GenerateExplanationOutput | { error: string }> {
    try {
        const explanation = await generateExplanation(input);
        return explanation;
    } catch (e) {
        console.error(e);
        return { error: 'An unexpected error occurred while generating the explanation. Please try again later.' };
    }
}
