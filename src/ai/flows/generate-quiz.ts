'use server';

/**
 * Quiz Generation Module
 * 
 * This module handles the generation of quizzes from text input using AI.
 * It includes input validation, text processing, and question generation logic.
 */

import { z } from 'zod';
import { callOpenRouter } from '@/ai/openrouter';

// =========================================
// Type Definitions and Validation Schemas
// =========================================

/**
 * Input validation schema for quiz generation
 */
const GenerateQuizInputSchema = z.object({
  lectureText: z.string().min(1).describe('The text to generate questions from'),
  numQuestions: z.number().min(1).max(50).describe('Number of questions to generate'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('Quiz difficulty level'),
  questionType: z.enum(['multiple_choice', 'situational', 'fill_in_the_blank', 'true_false', 'mixed'])
    .describe('Type of questions to generate'),
});

export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;
type QuestionType = GenerateQuizInput['questionType'];

/**
 * Question format validation schema
 */
const QuizQuestionSchema = z.object({
  question: z.string().describe('The question text'),
  options: z.array(z.string()).length(4).describe('Four answer options'),
  correctAnswerIndex: z.number().min(0).max(3).describe('Index of the correct answer (0-3)'),
});

/**
 * Output validation schema for quiz generation
 */
const GenerateQuizOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema).describe('Array of generated questions'),
});

export type GenerateQuizOutput = z.infer<typeof GenerateQuizOutputSchema>;

const QUESTION_TYPE_GUIDANCE: Record<QuestionType, string> = {
  multiple_choice: 'Write clear multiple-choice questions with exactly four plausible options (one correct and three distractors). Use direct phrasing that tests conceptual understanding or factual recall from the text.',
  situational: 'Craft scenario-based questions that describe a realistic situation. Ask the learner to apply concepts from the text to that scenario. Ensure the scenario details and the correct option are grounded explicitly in the provided text.',
  fill_in_the_blank: 'Select a key sentence from the text and replace one critical term with a blank ("___"). Provide four answer options that could fit. Only one option may be correct according to the text, and distractors must be plausible but incorrect.',
  true_false: 'Create declarative statements about the text and provide four answer options that contain variations (e.g., True, False, Mostly True, Not Given). Only one option may be fully correct, and each distractor must be clearly incorrect according to the text.',
  mixed: 'Generate a balanced mix of multiple-choice, situational, fill-in-the-blank, and true/false questions. Alternate formats so the learner experiences variety while keeping every question answerable strictly from the text.',
};

// =========================================
// Helper Functions
// =========================================

/**
 * Splits text into manageable chunks for better processing
 */
function splitTextIntoChunks(text: string, maxLength = 2000): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

/**
 * Processes a single chunk of text to generate quiz questions
 */
async function processTextChunk(chunk: string, params: {
  questionsPerChunk: number;
  questionType: string;
  difficulty: string;
}): Promise<any[]> {
  const questionType = params.questionType as QuestionType;
  const typeGuidance = QUESTION_TYPE_GUIDANCE[questionType] ?? QUESTION_TYPE_GUIDANCE.multiple_choice;

  const prompt = `You are an assistant that helps generate quiz questions from text content.
Follow these strict rules:

1. ONLY use information explicitly stated in the provided text. DO NOT add external knowledge.
2. If information for an answer is not explicitly in the text, do not create that question.
3. Generate ${params.questionsPerChunk} ${params.questionType} questions at '${params.difficulty}' difficulty level.
4. For each question:
   - The question must be answerable from the text
   - All options must be relevant to the question
   - The correct answer must be supported by a specific phrase from the text
   - Incorrect options should be plausible but clearly wrong based on the text
   - Match the difficulty level: ${
     params.difficulty === 'easy' ? 'basic recall and understanding' :
     params.difficulty === 'medium' ? 'application of concepts and relationships' :
     'complex analysis and evaluation'
   }
5. Question type guidance: ${typeGuidance}

Text to use for questions:
${chunk}

Return questions in this exact JSON format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "supportingText": "Exact quote from the text that supports the correct answer"
    }
  ]
}`;

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const response = await callOpenRouter(model, prompt);
  
  try {
    const result = JSON.parse(response);
    return result?.questions || [];
  } catch (err) {
    // Try to extract JSON if it's wrapped in text
    const match = response.match(/\{[\s\S]*\}/m);
    if (match) {
      try {
        const result = JSON.parse(match[0]);
        return result?.questions || [];
      } catch {
        console.error('Failed to parse JSON from chunk response');
      }
    }
    return [];
  }
}

// =========================================
// Main Export
// =========================================

/**
 * Generates quiz questions from text based on given parameters
 */
export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateQuizOutput> {
  // Validate input
  const validatedInput = GenerateQuizInputSchema.parse({
    ...input,
    lectureText: input.lectureText.trim()
  });

  // Ensure minimum text length
  const minLength = 100;
  if (validatedInput.lectureText.length < minLength) {
    throw new Error(`Please provide more text (at least ${minLength} characters) for better quiz generation.`);
  }

  // Process text in chunks
  const chunks = splitTextIntoChunks(validatedInput.lectureText);
  const questionsPerChunk = Math.ceil(validatedInput.numQuestions / chunks.length);
  
  // Generate questions from each chunk
  const allQuestions: any[] = [];
  for (const chunk of chunks) {
    const chunkQuestions = await processTextChunk(chunk, {
      questionsPerChunk,
      questionType: validatedInput.questionType,
      difficulty: validatedInput.difficulty
    });
    allQuestions.push(...chunkQuestions);
  }
  
  // Format and validate output
  const result: GenerateQuizOutput = {
    questions: allQuestions
      .slice(0, validatedInput.numQuestions)
      .map(q => ({
        question: q.question,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex
      }))
  };

  return GenerateQuizOutputSchema.parse(result);
}
