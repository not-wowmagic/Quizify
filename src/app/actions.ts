// src/app/actions.ts
'use server';

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { generateQuiz, GenerateQuizInputSchema, QuizPayloadSchema, QuizQuestionSchema, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
import { generateSummary, type GenerateSummaryInput, type GenerateSummaryOutput } from '@/ai/flows/generate-summary';
import { generateTutorGuidance, TutorInputSchema, type TutorInput, type TutorOutput } from '@/ai/flows/tutor';
import { extractTextFromImage, ImageOcrInputSchema, type ImageOcrInput, type ImageOcrOutput } from '@/ai/flows/image-ocr';
import { checkRateLimit, getClientIp, hashPayload, TtlCache, verifyTurnstile } from '@/lib/rate-limit';
import { getSupabase, DEVICE_ID_PATTERN } from '@/lib/supabase-server';
import { sanitizeText } from '@/lib/sanitize';
import { extractArticle, fetchPublicPage } from '@/lib/web-reader';
import type { Quiz } from '@/types/quiz';
import type { AttemptAnswer, QuizAttempt } from '@/types/history';

const HOUR_MS = 60 * 60 * 1000;

// Per-IP hourly budgets for the paid AI endpoints
const QUIZ_LIMIT = 30;
const SUMMARY_LIMIT = 50;

// Per-IP hourly budgets for the ingestion / tutor endpoints
const WEB_LIMIT = 20;
const OCR_LIMIT = 20;
const TUTOR_LIMIT = 60;

// Identical quiz requests within the TTL are served from cache (per instance)
const quizCache = new TtlCache<Pick<Quiz, 'questions'>>(50, HOUR_MS);

// Extracted articles are cached by URL hash for 24h (per instance)
const webCache = new TtlCache<{ title: string; text: string }>(100, 24 * HOUR_MS);

export type CreateQuizInput = GenerateQuizInput & { turnstileToken?: string; bypassCache?: boolean };

export async function createQuiz(input: CreateQuizInput): Promise<Pick<Quiz, 'questions'> | { error: string }> {
  // Bot protection (no-op unless TURNSTILE_SECRET_KEY is configured)
  if (!(await verifyTurnstile(input.turnstileToken))) {
    return { error: 'Bot verification failed. Please refresh the page and try again.' };
  }

  // Rate limit the paid endpoint
  const ip = await getClientIp();
  const limit = await checkRateLimit(`quiz:${ip}`, QUIZ_LIMIT, HOUR_MS);
  if (!limit.allowed) {
    return { error: `Rate limit reached. You can generate ${QUIZ_LIMIT} quizzes per hour. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
  }

  // Canonical, strict validation (unknown/tampered fields are rejected).
  // turnstileToken/bypassCache are action-only fields (not quiz settings) and
  // React serializes undefined-valued keys too, so they MUST be stripped
  // before the strict parse or every request would fail validation.
  const quizInput = { ...input };
  delete quizInput.turnstileToken;
  delete quizInput.bypassCache;
  let validated: GenerateQuizInput;
  try {
    validated = GenerateQuizInputSchema.strict().parse({
      ...quizInput,
      lectureText: sanitizeText(input.lectureText ?? ''),
    });
  } catch {
    return { error: 'Invalid quiz settings. Provide 100–100,000 characters of text, 1–50 questions, and a valid difficulty and question type.' };
  }

  // Serve identical requests from cache (skipped in incognito mode)
  const cacheKey = hashPayload(validated);
  if (!input.bypassCache) {
    const cached = quizCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const quizResult = await generateQuiz(validated);

    if (!quizResult.questions || quizResult.questions.length === 0) {
      return { error: 'The AI could not generate a quiz from the provided text. Please try refining your text.' };
    }

    const output = { questions: quizResult.questions };
    if (!input.bypassCache) {
      quizCache.set(cacheKey, output);
    }
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


export async function createSummary(input: GenerateSummaryInput): Promise<GenerateSummaryOutput | { error: string }> {
    const ip = await getClientIp();
    const limit = await checkRateLimit(`summary:${ip}`, SUMMARY_LIMIT, HOUR_MS);
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

/** Socratic follow-up guidance for a quiz question ("Ask Tutor"). */
export async function askTutorFollowUp(input: TutorInput): Promise<TutorOutput | { error: string }> {
    const ip = await getClientIp();
    const limit = await checkRateLimit(`tutor:${ip}`, TUTOR_LIMIT, HOUR_MS);
    if (!limit.allowed) {
      return { error: 'Too many tutor requests. Please try again later.' };
    }

    const parsed = TutorInputSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'Invalid tutor request.' };
    }

    try {
        return await generateTutorGuidance(parsed.data);
    } catch (e) {
        console.error('AskTutorFollowUp Error:', e);
        return { error: 'An unexpected error occurred while getting guidance. Please try again later.' };
    }
}

/** Extracts clean article text from a public web URL (SSRF-hardened). */
export async function extractFromWebUrl(rawUrl: string): Promise<{ title: string; text: string } | { error: string }> {
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      return { error: 'Enter a full URL starting with http:// or https://.' };
    }

    const ip = await getClientIp();
    const limit = await checkRateLimit(`web:${ip}`, WEB_LIMIT, HOUR_MS);
    if (!limit.allowed) {
      return { error: 'Too many URL fetches. Please try again later.' };
    }

    const cacheKey = hashPayload(url);
    const cached = webCache.get(cacheKey);
    if (cached) return cached;

    try {
      const { html, finalUrl } = await fetchPublicPage(url);
      const article = await extractArticle(html, finalUrl);
      const result = {
        title: article.title,
        text: sanitizeText(article.text),
      };
      webCache.set(cacheKey, result);
      return result;
    } catch (e) {
      console.error('ExtractFromWebUrl Error:', e);
      return { error: e instanceof Error ? e.message : 'Failed to read that page. Please try again.' };
    }
}

/** Extracts clean text from a photographed image via vision OCR. */
export async function extractTextFromImageAction(input: ImageOcrInput): Promise<ImageOcrOutput | { error: string }> {
    if (!/^data:image\/(?:png|jpe?g|webp|heic);base64,/i.test(input.imageDataUrl)) {
      return { error: 'Unsupported image format. Use PNG, JPEG, or WebP.' };
    }

    const ip = await getClientIp();
    const limit = await checkRateLimit(`ocr:${ip}`, OCR_LIMIT, HOUR_MS);
    if (!limit.allowed) {
      return { error: 'Too many image scans. Please try again later.' };
    }

    const parsed = ImageOcrInputSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'Invalid image data.' };
    }

    try {
      const result = await extractTextFromImage(parsed.data);
      if (result.text.trim().length < 20) {
        return { error: 'No readable text found in the image. Try a clearer photo with better lighting.' };
      }
      return { text: sanitizeText(result.text) };
    } catch (e) {
      console.error('ExtractTextFromImage Error:', e);
      return { error: e instanceof Error ? e.message : 'Failed to read the image. Please try again.' };
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
  const limit = await checkRateLimit(`share:${ip}`, SHARE_LIMIT, HOUR_MS);
  if (!limit.allowed) {
    return { error: `Too many shares. You can share ${SHARE_LIMIT} quizzes per hour. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
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
