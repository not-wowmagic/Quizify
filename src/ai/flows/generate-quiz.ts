/**
 * Quiz Generation Module
 * 
 * This module handles the generation of quizzes from text input using AI.
 * It includes input validation, text processing, and question generation logic.
 * Supports standard (multiple-choice, situational, fill-in-the-blank, true/false)
 * and matching type questions.
 */

import { z } from 'zod';
import { callGemini, extractJSON } from '@/ai/gemini';

// =========================================
// Type Definitions and Validation Schemas
// =========================================

/**
 * Input validation schema for quiz generation
 */
const GenerateQuizInputSchema = z.object({
  lectureText: z.string().min(1).max(100000).describe('The text to generate questions from'),
  numQuestions: z.number().min(1).max(50).describe('Number of questions to generate'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('Quiz difficulty level'),
  questionType: z.enum(['multiple_choice', 'situational', 'fill_in_the_blank', 'true_false', 'matching', 'mixed'])
    .describe('Type of questions to generate'),
});

export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;
type QuestionType = GenerateQuizInput['questionType'];

export type GenerateQuizOutput = {
  questions: Array<{
    type: 'standard';
    question: string;
    options: string[];
    correctAnswerIndex: number;
  } | {
    type: 'matching';
    question: string;
    pairs: { premise: string; response: string }[];
  }>;
};

const QUESTION_TYPE_GUIDANCE: Record<QuestionType, string> = {
  multiple_choice: 'Write clear multiple-choice questions with exactly four plausible options (one correct and three distractors). Use direct phrasing that tests conceptual understanding or factual recall from the text.',
  situational: 'Craft scenario-based questions that describe a realistic situation. Ask the learner to apply concepts from the text to that scenario. Ensure the scenario details and the correct option are grounded explicitly in the provided text.',
  fill_in_the_blank: 'Select a key sentence from the text and replace one critical term with a blank ("___"). Provide four answer options that could fit. Only one option may be correct according to the text, and distractors must be plausible but incorrect.',
  true_false: 'Create declarative statements about the text and provide four answer options that contain variations (e.g., True, False, Mostly True, Not Given). Only one option may be fully correct, and each distractor must be clearly incorrect according to the text.',
  matching: 'Create matching exercises where the learner must pair related items. Generate 4-6 pairs of related items from the text (e.g., term↔definition, concept↔example, cause↔effect, event↔date). Each pair must be clearly and unambiguously connected based on the text. Premises should be distinct from each other, and responses should also be distinct.',
  mixed: 'Generate a balanced mix of multiple-choice, situational, fill-in-the-blank, true/false, and matching questions. Alternate formats so the learner experiences variety while keeping every question answerable strictly from the text.',
};

interface StandardQuestionRaw {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  type: 'standard';
}

interface MatchingQuestionRaw {
  question: string;
  pairs: { premise: string; response: string }[];
  type: 'matching';
}

type QuestionRaw = StandardQuestionRaw | MatchingQuestionRaw;

// =========================================
// Helper Functions
// =========================================

/**
 * Splits text into manageable chunks for better processing
 */
function splitTextIntoChunks(text: string, maxLength = 2000): string[] {
  let sentences: string[] = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length === 0) {
    sentences = text.split(/\n+/).filter(Boolean);
    if (sentences.length === 0) {
      sentences = [text];
    }
  }

  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      let remaining = sentence;
      while (remaining.length > maxLength) {
        let splitIdx = remaining.lastIndexOf(' ', maxLength);
        if (splitIdx === -1 || splitIdx === 0) {
          splitIdx = maxLength;
        }
        chunks.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
      }
      currentChunk = remaining;
    } else if ((currentChunk + sentence).length > maxLength) {
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
 * Processes a single chunk of text to generate standard quiz questions
 */
async function processStandardChunk(chunk: string, params: {
  questionsPerChunk: number;
  questionType: string;
  difficulty: string;
}): Promise<StandardQuestionRaw[]> {
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

  const response = await callGemini(prompt, { jsonMode: true });
  
  try {
    const result = extractJSON(response) as { questions?: StandardQuestionRaw[] } | undefined;
    return (result?.questions || []).map((q: StandardQuestionRaw) => ({
      ...q,
      type: 'standard',
    }));
  } catch (err) {
    console.error('Failed to extract/parse JSON from chunk response:', err);
    return [];
  }
}

/**
 * Processes a single chunk of text to generate matching quiz questions
 */
async function processMatchingChunk(chunk: string, params: {
  questionsPerChunk: number;
  difficulty: string;
}): Promise<MatchingQuestionRaw[]> {
  const prompt = `You are an assistant that helps generate matching-type quiz questions from text content.
Follow these strict rules:

1. ONLY use information explicitly stated in the provided text. DO NOT add external knowledge.
2. Generate ${params.questionsPerChunk} matching question(s) at '${params.difficulty}' difficulty level.
3. Each matching question should have 4-6 pairs of related items from the text.
4. Pairs can be: term↔definition, concept↔example, cause↔effect, event↔date, person↔achievement, etc.
5. Every premise and every response MUST be unique within a single question — no duplicates.
6. Each pair must be clearly and unambiguously connected based on the text.
7. Match the difficulty level: ${
    params.difficulty === 'easy' ? 'straightforward, directly stated relationships' :
    params.difficulty === 'medium' ? 'relationships requiring understanding of the concepts' :
    'complex relationships requiring deep analysis of the text'
  }

Text to use for questions:
${chunk}

Return questions in this exact JSON format:
{
  "questions": [
    {
      "question": "Match each term with its correct definition:",
      "pairs": [
        { "premise": "Term A", "response": "Definition of Term A" },
        { "premise": "Term B", "response": "Definition of Term B" },
        { "premise": "Term C", "response": "Definition of Term C" },
        { "premise": "Term D", "response": "Definition of Term D" }
      ]
    }
  ]
}`;

  const response = await callGemini(prompt, { jsonMode: true });
  
  try {
    const result = extractJSON(response) as { questions?: MatchingQuestionRaw[] } | undefined;
    return (result?.questions || []).map((q: MatchingQuestionRaw) => ({
      ...q,
      type: 'matching',
    }));
  } catch (err) {
    console.error('Failed to extract/parse matching JSON from chunk response:', err);
    return [];
  }
}

/**
 * Processes a chunk for mixed mode — generates both standard and matching questions.
 * Distributes standard questions across multiple types to ensure variety.
 */
async function processMixedChunk(chunk: string, params: {
  questionsPerChunk: number;
  difficulty: string;
}): Promise<QuestionRaw[]> {
  // Allocate roughly 1 matching question per 4 total, minimum 1
  const matchingCount = Math.max(1, Math.floor(params.questionsPerChunk / 4));
  const standardCount = params.questionsPerChunk - matchingCount;

  // Distribute standard questions across the four standard types
  const standardTypes: QuestionType[] = ['multiple_choice', 'situational', 'fill_in_the_blank', 'true_false'];
  const standardPromises: Promise<StandardQuestionRaw[]>[] = [];

  if (standardCount > 0) {
    // Evenly distribute, with remainder going to the first types
    const perType = Math.floor(standardCount / standardTypes.length);
    let remainder = standardCount % standardTypes.length;

    for (const qType of standardTypes) {
      const count = perType + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      if (count > 0) {
        standardPromises.push(processStandardChunk(chunk, {
          questionsPerChunk: count,
          questionType: qType,
          difficulty: params.difficulty,
        }));
      }
    }
  }

  const [standardResults, matchingQuestions] = await Promise.all([
    Promise.all(standardPromises).then(results => results.flat()),
    matchingCount > 0 ? processMatchingChunk(chunk, {
      questionsPerChunk: matchingCount,
      difficulty: params.difficulty,
    }) : Promise.resolve([]),
  ]);

  // Shuffle to interleave different question types
  const allQuestions = [...standardResults, ...matchingQuestions];
  for (let i = allQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
  }
  return allQuestions;
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
  
  const isMatching = validatedInput.questionType === 'matching';
  const isMixed = validatedInput.questionType === 'mixed';

  // Generate questions from each chunk in parallel
  const chunkPromises = chunks.map(chunk => {
    if (isMatching) {
      return processMatchingChunk(chunk, {
        questionsPerChunk,
        difficulty: validatedInput.difficulty,
      });
    } else if (isMixed) {
      return processMixedChunk(chunk, {
        questionsPerChunk,
        difficulty: validatedInput.difficulty,
      });
    } else {
      return processStandardChunk(chunk, {
        questionsPerChunk,
        questionType: validatedInput.questionType,
        difficulty: validatedInput.difficulty,
      });
    }
  });
  
  const results = await Promise.all(chunkPromises);
  const allQuestions: QuestionRaw[] = [];
  for (const chunkQuestions of results) {
    allQuestions.push(...chunkQuestions);
  }
  
  // Format output — tag each question with its type
  const result: GenerateQuizOutput = {
    questions: allQuestions
      .slice(0, validatedInput.numQuestions)
      .map(q => {
        if (q.type === 'matching') {
          return {
            type: 'matching' as const,
            question: q.question,
            pairs: q.pairs,
          };
        }
        return {
          type: 'standard' as const,
          question: q.question,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
        };
      })
  };

  return result;
}

