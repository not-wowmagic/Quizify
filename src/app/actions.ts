// src/app/actions.ts
'use server';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { generateQuiz, GenerateQuizInputSchema, QuizPayloadSchema, markGenerationCancelled, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
import { generateSummary, type GenerateSummaryInput, type GenerateSummaryOutput } from '@/ai/flows/generate-summary';
import { generateTutorGuidance, TutorInputSchema, type TutorInput, type TutorOutput } from '@/ai/flows/tutor';
import { extractTextFromImage, ImageOcrInputSchema, type ImageOcrInput, type ImageOcrOutput } from '@/ai/flows/image-ocr';
import { checkRateLimit, getClientIp, hashPayload, TtlCache, verifyTurnstile } from '@/lib/rate-limit';
import { getSupabase } from '@/lib/supabase-server';
import { sanitizeText } from '@/lib/sanitize';
import { normalizeQuizTitle, titleFromFilename, titleFromQuestions } from '@/lib/quiz-title';
import { saveAttemptForClient, type SaveAttemptInput } from '@/lib/save-attempt';
import {
  BOT_COOKIE_NAME,
  BOT_TTL_MS,
  DEVICE_COOKIE_NAME,
  botCookieOptions,
  deviceCookieOptions,
  deviceCookieSecret,
  readBotCheck,
  readSignedDeviceId,
  resolveAuthoritativeDeviceId,
  signBotCheck,
  signDeviceId,
} from '@/lib/device-cookie';
import { TURNSTILE_ACTION } from '@/lib/turnstile';
import { fetchPublicPage } from '@/lib/web-reader';
import type { Quiz } from '@/types/quiz';
import type { QuizAttempt } from '@/types/history';

const HOUR_MS = 60 * 60 * 1000;

// Per-IP hourly budgets for the paid AI endpoints
const QUIZ_LIMIT = 30;
const SUMMARY_LIMIT = 50;

// Per-IP hourly budgets for the ingestion / tutor endpoints
const WEB_LIMIT = 20;
const OCR_LIMIT = 20;
const TUTOR_LIMIT = 60;

// Identical quiz requests within the TTL are served from cache (per instance)
const quizCache = new TtlCache<Pick<Quiz, 'questions' | 'title'>>(50, HOUR_MS);

// Fetched pages are cached by URL hash for 24h (per instance)
const webCache = new TtlCache<{ html: string; finalUrl: string }>(100, 24 * HOUR_MS);

/**
 * Single bot-check seam shared by every paid or state-changing action.
 *
 * Turnstile tokens are single-use, so one successful check sets a short-lived
 * signed bot cookie. Later actions in the same study session use that proof
 * instead of replaying a consumed token. The widget always requests the same
 * action, which is the action checked here.
 */
async function enforceBotProtection(token: string | undefined, action: string): Promise<string | null> {
  if (process.env.E2E_MOCK_AI === '1' || !process.env.TURNSTILE_SECRET_KEY) return null;

  const secret = deviceCookieSecret();
  const store = await cookies();

  if (token && await verifyTurnstile(token, TURNSTILE_ACTION)) {
    store.set(BOT_COOKIE_NAME, signBotCheck(Date.now() + BOT_TTL_MS, secret), botCookieOptions());
    return null;
  }

  if (readBotCheck(store.get(BOT_COOKIE_NAME)?.value, Date.now(), secret)) return null;

  console.warn(`[turnstile] Bot verification rejected ${action}.`);
  return 'Bot verification failed. Please refresh the page and try again.';
}

/**
 * The cookie is the only trusted device identity. A client may propose an id
 * once, when the cookie is first set; afterwards its value is ignored.
 */
async function authoritativeDeviceId(clientDeviceId?: string): Promise<string | null> {
  const secret = deviceCookieSecret();
  const store = await cookies();
  const bound = readSignedDeviceId(store.get(DEVICE_COOKIE_NAME)?.value, secret);
  const resolved = resolveAuthoritativeDeviceId(bound, clientDeviceId);
  if (resolved && !bound) {
    store.set(DEVICE_COOKIE_NAME, signDeviceId(resolved, secret), deviceCookieOptions());
  }
  return resolved;
}

export type CreateQuizInput = GenerateQuizInput & {
  turnstileToken?: string;
  bypassCache?: boolean;
  fallbackTitle?: string;
  fallbackWebTitle?: string;
  generationId?: string;
};

/** Marks a generation cancelled; the worker stops between chunk batches. */
export async function cancelGeneration(generationId: string): Promise<{ ok: true }> {
  if (/^[0-9a-f-]{36}$/i.test(generationId)) markGenerationCancelled(generationId);
  return { ok: true };
}

export async function createQuiz(input: CreateQuizInput): Promise<Pick<Quiz, 'questions' | 'title'> | { error: string }> {
  const botError = await enforceBotProtection(input.turnstileToken, 'createQuiz');
  if (botError) return { error: botError };

  // Rate limit the paid endpoint
  const ip = await getClientIp();
  const limit = await checkRateLimit(`quiz:${ip}`, QUIZ_LIMIT, HOUR_MS, true);
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
  delete quizInput.fallbackTitle;
  delete quizInput.fallbackWebTitle;
  delete quizInput.generationId;
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
  const cacheKey = hashPayload({ ...validated, fallbackTitle: input.fallbackTitle, fallbackWebTitle: input.fallbackWebTitle });
  if (!input.bypassCache) {
    const cached = quizCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const quizResult = await generateQuiz(validated, input.generationId);

    if (!quizResult.questions || quizResult.questions.length === 0) {
      return { error: 'The AI could not generate a quiz from the provided text. Please try refining your text.' };
    }

    const fallbackTitle = titleFromFilename(input.fallbackTitle) ??
      (normalizeQuizTitle(input.fallbackWebTitle, '') || titleFromQuestions(quizResult.questions) || 'Study Quiz');
    const output = {
      questions: quizResult.questions,
      title: normalizeQuizTitle(quizResult.title, fallbackTitle),
    };
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


export async function createSummary(input: GenerateSummaryInput & { turnstileToken?: string }): Promise<GenerateSummaryOutput | { error: string }> {
    const botError = await enforceBotProtection(input.turnstileToken, 'createSummary');
    if (botError) return { error: botError };
    const ip = await getClientIp();
    const limit = await checkRateLimit(`summary:${ip}`, SUMMARY_LIMIT, HOUR_MS, true);
    if (!limit.allowed) {
      return { error: 'Too many summary requests. Please try again later.' };
    }

    const summaryInput = { ...input };
    delete summaryInput.turnstileToken;

    try {
        const summary = await generateSummary(summaryInput);
        return summary;
    } catch (e) {
        console.error('CreateSummary Error:', e);
        return { error: 'An unexpected error occurred while generating the summary. Please try again later.' };
    }
}

/** Socratic follow-up guidance for a quiz question ("Ask Tutor"). */
export async function askTutorFollowUp(input: TutorInput & { turnstileToken?: string }): Promise<TutorOutput | { error: string }> {
    const botError = await enforceBotProtection(input.turnstileToken, 'askTutorFollowUp');
    if (botError) return { error: botError };
    const ip = await getClientIp();
    const limit = await checkRateLimit(`tutor:${ip}`, TUTOR_LIMIT, HOUR_MS, true);
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

/** Fetches a public web URL (SSRF-hardened). Article extraction happens client-side. */
export async function extractFromWebUrl(rawUrl: string, turnstileToken?: string): Promise<{ html: string; finalUrl: string } | { error: string }> {
    const botError = await enforceBotProtection(turnstileToken, 'extractFromWebUrl');
    if (botError) return { error: botError };
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      return { error: 'Enter a full URL starting with http:// or https://.' };
    }

    const ip = await getClientIp();
    const limit = await checkRateLimit(`web:${ip}`, WEB_LIMIT, HOUR_MS, true);
    if (!limit.allowed) {
      return { error: 'Too many URL fetches. Please try again later.' };
    }

    const cacheKey = hashPayload(url);
    const cached = webCache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await fetchPublicPage(url);
      webCache.set(cacheKey, result);
      return result;
    } catch (e) {
      console.error('ExtractFromWebUrl Error:', e);
      return { error: 'Could not reach that page. It may be down or blocking automated requests.' };
    }
}

/** Extracts clean text from a photographed image via vision OCR. */
export async function extractTextFromImageAction(input: ImageOcrInput & { turnstileToken?: string }): Promise<ImageOcrOutput | { error: string }> {
    const botError = await enforceBotProtection(input.turnstileToken, 'extractTextFromImage');
    if (botError) return { error: botError };
    if (!/^data:image\/(?:png|jpe?g|webp|heic);base64,/i.test(input.imageDataUrl)) {
      return { error: 'Unsupported image format. Use PNG, JPEG, or WebP.' };
    }

    const ip = await getClientIp();
    const limit = await checkRateLimit(`ocr:${ip}`, OCR_LIMIT, HOUR_MS, true);
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
      return { error: 'Failed to read the image. Please try again.' };
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
  visibility?: 'unlisted' | 'public';
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
  const botError = await enforceBotProtection(input?.turnstileToken, 'publishQuiz');
  if (botError) return { error: botError };

  const ip = await getClientIp();
  const limit = await checkRateLimit(`share:${ip}`, SHARE_LIMIT, HOUR_MS, true);
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

  const title = normalizeQuizTitle(validated.title, 'Study Quiz');

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
        visibility: validated.visibility ?? 'unlisted',
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
  id?: string;
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
    .select('id, title, questions, summary, difficulty, question_type, language')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  // SAFETY: the selected columns are plain text/jsonb in the schema; a non-null
  // row returned by the DB is guaranteed to carry exactly these string types
  const row = data as {
    id?: string;
    title: string;
    questions: Quiz['questions'];
    summary: string | null;
    difficulty: string | null;
    question_type: string | null;
    language: string | null;
  };

  const result: SharedQuizData = {
    id: row.id,
    title: normalizeQuizTitle(row.title),
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

export type { SaveAttemptInput };

/** Records a completed quiz attempt for the cookie-bound anonymous device. */
export async function saveAttempt(input: SaveAttemptInput & { turnstileToken?: string }): Promise<{ id: string } | { error: string }> {
  const botError = await enforceBotProtection(input.turnstileToken, 'saveAttempt');
  if (botError) return { error: botError };
  const deviceId = await authoritativeDeviceId(input.deviceId);
  if (!deviceId) return { error: 'Invalid device id.' };

  // This path is public and writes through the service-role client, so the
  // rate-limit and size guards run inside the service before any insert.
  return saveAttemptForClient({ ...input, deviceId }, await getClientIp());
}

export type PublicQuizSummary = {
  slug: string;
  title: string;
  numQuestions: number;
  difficulty: string | null;
  questionType: string | null;
  language: string | null;
  createdAt: string;
};

/** Lists metadata for explicitly public quizzes; question content never leaves the server here. */
export async function getPublicQuizzes(): Promise<PublicQuizSummary[] | { error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Public Quizzes are unavailable until sharing is configured.' };

  const { data, error } = await supabase
    .from('quizzes')
    .select('slug, title, num_questions, difficulty, question_type, language, created_at')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('GetPublicQuizzes Error:', error);
    return { error: 'Could not load Public Quizzes. Please try again.' };
  }

  return (data ?? []).map(row => {
    // SAFETY: the selected columns are primitive metadata fields from public.quizzes.
    const item = row as {
      slug: string;
      title?: string;
      num_questions: number;
      difficulty: string | null;
      question_type: string | null;
      language: string | null;
      created_at: string;
    };
    return {
      slug: item.slug,
      title: normalizeQuizTitle(item.title),
      numQuestions: item.num_questions,
      difficulty: item.difficulty,
      questionType: item.question_type,
      language: item.language,
      createdAt: item.created_at,
    };
  });
}

/** Lists attempts for the cookie-bound device. Without a cookie there is no history. */
export async function getAttempts(_clientDeviceId?: string): Promise<QuizAttempt[] | { error: string }> {
  void _clientDeviceId; // Client-supplied ids are deliberately ignored; the cookie is authoritative.
  const deviceId = await authoritativeDeviceId();
  if (!deviceId) return [];

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

/** Deletes an attempt scoped to the cookie-bound device id. */
export async function deleteAttempt(id: string, _clientDeviceId?: string): Promise<{ ok: true } | { error: string }> {
  void _clientDeviceId; // Client-supplied ids are deliberately ignored; the cookie is authoritative.
  const deviceId = await authoritativeDeviceId();
  if (!deviceId) return { ok: true };

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
