// src/app/actions.ts
'use server';

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { generateQuiz, GenerateQuizInputSchema, QuizPayloadSchema, QuizQuestionSchema, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
import { generateExplanation } from '@/ai/flows/generate-explanation';
import { generateSummary, type GenerateSummaryInput, type GenerateSummaryOutput } from '@/ai/flows/generate-summary';
import { checkRateLimit, getClientIp, hashPayload, TtlCache, verifyTurnstile } from '@/lib/rate-limit';
import { getSupabase, DEVICE_ID_PATTERN } from '@/lib/supabase-server';
import { sanitizeText } from '@/lib/sanitize';
import type { GenerateExplanationInput, GenerateExplanationOutput } from '@/types/explanation';
import type { Quiz } from '@/types/quiz';
import type { AttemptAnswer, QuizAttempt } from '@/types/history';

const HOUR_MS = 60 * 60 * 1000;

// Per-IP hourly budgets for the paid Gemini endpoints
const QUIZ_LIMIT = 30;
const SUMMARY_LIMIT = 50;
const EXPLANATION_LIMIT = 80;

// Identical quiz requests within the TTL are served from cache (per instance)
const quizCache = new TtlCache<Pick<Quiz, 'questions'>>(50, HOUR_MS);

export type CreateQuizInput = GenerateQuizInput & { turnstileToken?: string };

export async function createQuiz(input: CreateQuizInput): Promise<Pick<Quiz, 'questions'> | { error: string }> {
  // Bot protection (no-op unless TURNSTILE_SECRET_KEY is configured)
  if (!(await verifyTurnstile(input.turnstileToken))) {
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
      lectureText: sanitizeText(input.lectureText ?? ''),
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

// =========================================
// Shareable quizzes
// =========================================

const SHARE_LIMIT = 30;

export type PublishQuizInput = {
  questions: unknown[];
  summary?: string;
  title?: string;
  difficulty?: string;
  questionType?: string;
  language?: string;
  turnstileToken?: string;
};

export type PublishedQuiz = {
  slug: string;
  url: string;
};

function generateSlug(): string {
  return randomBytes(5).toString('base64url');
}

/** Persists a quiz and returns a short share link (/q/<slug>). */
export async function publishQuiz(input: PublishQuizInput): Promise<PublishedQuiz | { error: string }> {
  if (!(await verifyTurnstile(input?.turnstileToken))) {
    return { error: 'Bot verification failed. Please refresh the page and try again.' };
  }

  const ip = await getClientIp();
  const limit = checkRateLimit(`share:${ip}`, SHARE_LIMIT, HOUR_MS);
  if (!limit.allowed) {
    return { error: `Too many shares. You can share ${SHARE_LIMIT} quizzes per hour — try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
  }

  let validated;
  try {
    validated = QuizPayloadSchema.parse(input);
  } catch {
    return { error: 'Invalid quiz payload. Please regenerate the quiz and try again.' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'Sharing is not configured yet (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const title = validated.title?.trim() || 'Untitled Quiz';

  // Retry a few times on the (unlikely) slug collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateSlug();
    const { data, error } = await supabase
      .from('quizzes')
      .insert({
        slug,
        title,
        questions: validated.questions,
        summary: validated.summary ?? null,
        num_questions: validated.questions.length,
        difficulty: validated.difficulty ?? null,
        question_type: validated.questionType ?? null,
        language: validated.language ?? 'English',
      })
      .select('slug')
      .single();

    if (!error && data) {
      // SAFETY: `.select('slug').single()` guarantees a row with a string slug
      const slug = data.slug as string;
      return { slug, url: `/q/${slug}` };
    }
    if (error && (error.code !== '23505')) {
      console.error('PublishQuiz Error:', error);
      return { error: 'Failed to publish the quiz. Please try again.' };
    }
  }

  return { error: 'Failed to publish the quiz. Please try again.' };
}

export type SharedQuizData = {
  title: string;
  questions: Quiz['questions'];
  summary?: string;
  difficulty?: string;
  questionType?: string;
  language?: string;
};

/** Loads a published quiz by its short slug (public read). */
export async function getSharedQuiz(slug: string): Promise<SharedQuizData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('quizzes')
    .select('title, questions, summary, difficulty, question_type, language')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  // SAFETY: the selected columns are plain text/jsonb in the schema; a non-null
  // row returned by the DB is guaranteed to carry exactly these string types
  const row = data as {
    title: string;
    questions: Quiz['questions'];
    summary: string | null;
    difficulty: string | null;
    question_type: string | null;
    language: string | null;
  };

  const result: SharedQuizData = {
    title: row.title ?? 'Untitled Quiz',
    questions: row.questions ?? [],
  };
  if (row.summary) result.summary = row.summary;
  if (row.difficulty) result.difficulty = row.difficulty;
  if (row.question_type) result.questionType = row.question_type;
  if (row.language) result.language = row.language;
  return result;
}

// =========================================
// Quiz history (anonymous device based)
// =========================================

const ATTEMPTS_PER_DEVICE = 200;

const SaveAttemptInputSchema = z.object({
  deviceId: z.string().regex(DEVICE_ID_PATTERN, 'Invalid device id'),
  title: z.string().trim().min(1).max(200).default('Untitled Quiz'),
  score: z.number().int().min(0).max(1000),
  total: z.number().int().min(1).max(100),
  questions: z.array(QuizQuestionSchema).min(1).max(50),
  answers: z.array(z.object({
    index: z.number().int().min(0).max(999),
    type: z.enum(['standard', 'matching']),
    correct: z.boolean(),
    topic: z.string().min(1).max(200).optional(),
  })).min(0).max(100),
  difficulty: z.string().trim().min(1).max(50).optional(),
  questionType: z.string().trim().min(1).max(50).optional(),
  language: z.string().trim().min(1).max(50).default('English'),
  durationSec: z.number().int().min(0).max(86_400),
});

export type SaveAttemptInput = z.infer<typeof SaveAttemptInputSchema>;

/** Records a completed quiz attempt for the anonymous device id. */
export async function saveAttempt(input: SaveAttemptInput): Promise<{ id: string } | { error: string }> {
  const parsed = SaveAttemptInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid attempt data.' };
  }
  const { deviceId, title, score, total, questions, answers, difficulty, questionType, language, durationSec } = parsed.data;

  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'History is not configured yet (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({
      device_id: deviceId,
      title,
      score,
      total,
      questions,
      // SAFETY: answers was validated above as AttemptAnswer[] by SaveAttemptInputSchema
      answers: answers as AttemptAnswer[],
      difficulty: difficulty ?? null,
      question_type: questionType ?? null,
      language,
      duration_sec: durationSec,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('SaveAttempt Error:', error);
    return { error: 'Failed to save the attempt.' };
  }
  // SAFETY: `.select('id').single()` guarantees a row with a string id
  return { id: data.id as string };
}

/** Lists the most recent attempts for an anonymous device id. */
export async function getAttempts(deviceId: string): Promise<QuizAttempt[] | { error: string }> {
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return { error: 'Invalid device id.' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'History is not configured yet (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(ATTEMPTS_PER_DEVICE);

  if (error) {
    console.error('GetAttempts Error:', error);
    return { error: 'Failed to load history.' };
  }
  // SAFETY: quiz_attempts rows are created by saveAttempt with exactly this shape
  return (data ?? []) as QuizAttempt[];
}

/** Deletes an attempt, scoped to the owning device id. */
export async function deleteAttempt(id: string, deviceId: string): Promise<{ ok: true } | { error: string }> {
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return { error: 'Invalid device id.' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'History is not configured yet (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const { error } = await supabase
    .from('quiz_attempts')
    .delete()
    .eq('id', id)
    .eq('device_id', deviceId);

  if (error) {
    console.error('DeleteAttempt Error:', error);
    return { error: 'Failed to delete the attempt.' };
  }
  return { ok: true };
}
