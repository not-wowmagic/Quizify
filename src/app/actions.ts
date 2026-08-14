// src/app/actions.ts
'use server';

import { generateQuiz, GenerateQuizInputSchema, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
import { generateExplanation } from '@/ai/flows/generate-explanation';
import { generateSummary, type GenerateSummaryInput, type GenerateSummaryOutput } from '@/ai/flows/generate-summary';
import { checkRateLimit, getClientIp, hashPayload, TtlCache, verifyTurnstile } from '@/lib/rate-limit';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import type { Quiz } from '@/types/quiz';

const HOUR_MS = 60 * 60 * 1000;

// Per-IP hourly budgets for the paid Gemini endpoints
const QUIZ_LIMIT = 30;
const SUMMARY_LIMIT = 50;
const EXPLANATION_LIMIT = 80;

// Identical quiz requests within the TTL are served from cache (per instance)
const quizCache = new TtlCache<Pick<Quiz, 'questions'>>(50, HOUR_MS);

/** Strips ASCII control characters (keeps tab, LF, CR) from study text. */
function sanitizeText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isControl = (code <= 31 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    if (!isControl) out += ch;
  }
  return out;
}

export type CreateQuizInput = GenerateQuizInput & { turnstileToken?: string };

export async function createQuiz(input: CreateQuizInput): Promise<Pick<Quiz, 'questions'> | { error: string }> {
  // Bot protection (no-op unless TURNSTILE_SECRET_KEY is configured)
  if (!(await verifyTurnstile(input?.turnstileToken))) {
    return { error: 'Bot verification failed. Please refresh the page and try again.' };
  }

  // Rate limit the paid endpoint
  const ip = await getClientIp();
  const limit = checkRateLimit(`quiz:${ip}`, QUIZ_LIMIT, HOUR_MS);
  if (!limit.allowed) {
    return { error: `Rate limit reached. You can generate ${QUIZ_LIMIT} quizzes per hour — try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
  }

  // Canonical, strict validation (unknown/tampered fields are rejected)
  let validated: GenerateQuizInput;
  try {
    validated = GenerateQuizInputSchema.strict().parse({
      ...input,
      lectureText: sanitizeText(String(input?.lectureText ?? '')),
    });
  } catch {
    return { error: 'Invalid quiz settings. Provide 100–100,000 characters of text, 1–50 questions, and a valid difficulty and question type.' };
  }

  // Serve identical requests from cache
  const cacheKey = hashPayload(validated);
  const cached = quizCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const quizResult = await generateQuiz(validated);

    if (!quizResult.questions || quizResult.questions.length === 0) {
      return { error: 'The AI could not generate a quiz from the provided text. Please try refining your text.' };
    }

    const output = { questions: quizResult.questions };
    quizCache.set(cacheKey, output);
    return output;
  } catch (e) {
    // Full detail stays in server logs; the client gets a stable message.
    console.error('CreateQuiz Error:', e);
    const errorMessage = e instanceof Error ? e.message : '';
    if (errorMessage.includes('OPENCODE_API_KEY') || errorMessage.includes('GEMINI_API_KEY')) {
      return { error: 'The AI API key is not configured. Set OPENCODE_API_KEY (or GEMINI_API_KEY) in your environment, e.g. the Netlify dashboard or a local .env.local file.' };
    }
    return { error: 'Failed to generate the quiz. Please try again.' };
  }
}


export async function explainAnswer(input: GenerateExplanationInput): Promise<GenerateExplanationOutput | { error: string }> {
    const ip = await getClientIp();
    const limit = checkRateLimit(`explain:${ip}`, EXPLANATION_LIMIT, HOUR_MS);
    if (!limit.allowed) {
      return { error: 'Too many explanation requests. Please try again later.' };
    }

    try {
        const explanation = await generateExplanation(input);
        return explanation;
    } catch (e) {
        console.error('ExplainAnswer Error:', e);
        return { error: 'An unexpected error occurred while generating the explanation. Please try again later.' };
    }
}

export async function createSummary(input: GenerateSummaryInput): Promise<GenerateSummaryOutput | { error: string }> {
    const ip = await getClientIp();
    const limit = checkRateLimit(`summary:${ip}`, SUMMARY_LIMIT, HOUR_MS);
    if (!limit.allowed) {
      return { error: 'Too many summary requests. Please try again later.' };
    }

    try {
        const summary = await generateSummary(input);
        return summary;
    } catch (e) {
        console.error('CreateSummary Error:', e);
        return { error: 'An unexpected error occurred while generating the summary. Please try again later.' };
    }
}
