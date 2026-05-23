// src/app/actions.ts
'use server';

import { generateQuiz, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
import { generateExplanation } from '@/ai/flows/generate-explanation';
import { generateSummary, type GenerateSummaryInput, type GenerateSummaryOutput } from '@/ai/flows/generate-summary';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import type { Quiz } from '@/types/quiz';

export async function createQuiz(input: Omit<GenerateQuizInput, 'model'>): Promise<Pick<Quiz, 'questions'> | { error: string }> {
  if (!input.lectureText || input.lectureText.trim().length < 100) {
    return { error: 'Please provide a more substantial lecture text (at least 100 characters).' };
  }

  try {
    const quizResult = await generateQuiz(input);

    // Ensure we have questions
    if (!quizResult.questions || quizResult.questions.length === 0) {
        return { error: 'The AI could not generate a quiz from the provided text. Please try refining your text.' };
    }

    return {
        questions: quizResult.questions,
    };
  } catch (e) {
        console.error('CreateQuiz Error:', e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        
        // Only mention API key if the error is actually about the API key
        if (errorMessage.includes('GEMINI_API_KEY') || errorMessage.includes('API key')) {
          return { error: 'GEMINI_API_KEY is not configured. Please set it in your environment (e.g. Netlify dashboard or local .env.local file).' };
        }
        
        return { error: `Failed to generate the quiz: ${errorMessage}` };
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

export async function createSummary(input: GenerateSummaryInput): Promise<GenerateSummaryOutput | { error: string }> {
    try {
        const summary = await generateSummary(input);
        return summary;
    } catch (e) {
        console.error(e);
        return { error: 'An unexpected error occurred while generating the summary. Please try again later.' };
    }
}
