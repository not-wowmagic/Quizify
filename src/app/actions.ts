// src/app/actions.ts
'use server';

import { generateQuiz, type GenerateQuizInput, type GenerateQuizOutput } from '@/ai/flows/generate-quiz';
import { generateExplanation } from '@/ai/flows/generate-explanation';
import { generateSummary, type GenerateSummaryOutput } from '@/ai/flows/generate-summary';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import type { Quiz } from '@/types/quiz';

export async function createQuiz(input: Omit<GenerateQuizInput, 'model'>): Promise<Quiz | { error: string }> {
  if (!input.lectureText || input.lectureText.trim().length < 50) {
    return { error: 'Please provide a more substantial lecture text (at least 50 characters).' };
  }

  try {
    const [quizResult, summaryResult] = await Promise.all([
        generateQuiz(input),
        generateSummary({ lectureText: input.lectureText })
    ]);

    // Ensure we have questions
    if (!quizResult.questions || quizResult.questions.length === 0) {
        return { error: 'The AI could not generate a quiz from the provided text. Please try refining your text.' };
    }

    return {
        questions: quizResult.questions,
        summary: summaryResult.summary,
    };
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
