// src/lib/save-attempt.ts
// Persistence and guards for anonymous quiz attempts. Kept outside the server
// action module so the request-dependent client IP is supplied by the caller.
import 'server-only';

import { z } from 'zod';
import { QuizQuestionSchema } from '@/ai/flows/generate-quiz';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSupabase, DEVICE_ID_PATTERN } from '@/lib/supabase-server';
import type { AttemptAnswer } from '@/types/history';

const HOUR_MS = 60 * 60 * 1000;
const ATTEMPT_LIMIT = 30;
// Keep this in sync with the trigger in 20261111000000_attempt_limits.sql.
const MAX_ATTEMPT_PAYLOAD_BYTES = 512 * 1024;

const SaveAttemptInputSchema = z.object({
  deviceId: z.string().regex(DEVICE_ID_PATTERN, 'Invalid device id'),
  quizId: z.string().trim().min(1).max(128).nullable().optional(),
  title: z.string().trim().min(1).max(200).default('Study Quiz'),
  score: z.int().min(0).max(1000),
  total: z.int().min(1).max(100),
  questions: z.array(QuizQuestionSchema).min(1).max(50),
  answers: z.array(z.object({
    index: z.int().min(0).max(999),
    type: z.enum(['standard', 'matching']),
    // Retained for backwards compatibility with older clients. Correctness is
    // recomputed from the learner's selection before anything is stored.
    correct: z.boolean().optional(),
    selectedIndex: z.int().min(0).max(999).optional(),
    matches: z.array(z.int().min(0).max(999)).max(50).optional(),
    topic: z.string().min(1).max(200).optional(),
  })).min(0).max(100),
  difficulty: z.string().trim().min(1).max(50).optional(),
  questionType: z.string().trim().min(1).max(50).optional(),
  language: z.string().trim().min(1).max(50).default('English'),
  durationSec: z.int().min(0).max(86_400),
});

export type SaveAttemptInput = z.infer<typeof SaveAttemptInputSchema>;
type ParsedAnswer = SaveAttemptInput['answers'][number];

/**
 * Correctness is derived only from the learner's selection and the submitted
 * question set. Client-supplied `correct` and `score` never reach storage.
 * Duplicate answer indices are ignored here; the caller rejects them so a
 * repeated correct answer cannot inflate the score.
 */
export function recomputeAttemptScore(
  questions: SaveAttemptInput['questions'],
  answers: ParsedAnswer[],
) {
  const seen = new Set<number>();
  const uniqueAnswers = answers.filter(answer => {
    if (seen.has(answer.index)) return false;
    seen.add(answer.index);
    return true;
  });

  const recomputed = uniqueAnswers.map(answer => {
    const question = questions[answer.index];
    let correct = false;
    if (question && answer.type === 'standard' && question.type === 'standard') {
      correct = answer.selectedIndex === question.correctAnswerIndex;
    } else if (question && answer.type === 'matching' && question.type === 'matching') {
      correct =
        answer.matches !== undefined &&
        answer.matches.length === question.pairs.length &&
        question.pairs.every((_, pairIndex) => answer.matches?.[pairIndex] === pairIndex);
    }
    const entry: AttemptAnswer = { index: answer.index, type: answer.type, correct };
    if (answer.topic) entry.topic = answer.topic;
    return entry;
  });
  return { score: recomputed.filter(answer => answer.correct).length, answers: recomputed };
}

// Cheap JSON pre-check only. The database trigger is authoritative and measures
// the stored row with pg_column_size(new); this is intentionally conservative
// but cannot prove the binary jsonb/TOAST size.
function attemptPayloadBytes(questions: unknown[], answers: unknown[]): number {
  return (
    Buffer.byteLength(JSON.stringify(questions), 'utf8') +
    Buffer.byteLength(JSON.stringify(answers), 'utf8')
  );
}

/**
 * Records a completed quiz attempt for the anonymous device id. The client IP
 * is explicit because this service is called from a server action, where the
 * request headers are the only trustworthy source.
 */
export async function saveAttemptForClient(
  input: SaveAttemptInput,
  clientIp: string,
): Promise<{ id: string } | { error: string }> {
  // This path is public and writes through the service-role client, so enforce
  // the same IP budget as the paid actions before doing any work.
  const limit = await checkRateLimit(`attempt:${clientIp}`, ATTEMPT_LIMIT, HOUR_MS);
  if (!limit.allowed) {
    return { error: 'Too many saved attempts. Please try again later.' };
  }

  const parsed = SaveAttemptInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid attempt data.' };
  }
  const { deviceId, quizId, title, score, total, questions, answers, difficulty, questionType, language, durationSec } = parsed.data;

  if (score > total) {
    return { error: 'Invalid attempt data.' };
  }

  // The stored attempt must be internally consistent. Without these checks a
  // client could send duplicate answer rows or a smaller total and still make
  // the recomputed score exceed the number of questions.
  if (total !== questions.length) {
    return { error: 'Invalid attempt data.' };
  }
  const answerIndices = new Set(answers.map(answer => answer.index));
  if (answerIndices.size !== answers.length || answers.some(answer => answer.index >= questions.length)) {
    return { error: 'Invalid attempt data.' };
  }

  if (attemptPayloadBytes(questions, answers) > MAX_ATTEMPT_PAYLOAD_BYTES) {
    return { error: 'Attempt data is too large to save.' };
  }

  const { score: recomputedScore, answers: recomputed } = recomputeAttemptScore(questions, answers);
  if (recomputedScore > total) {
    return { error: 'Invalid attempt data.' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'History is not configured yet (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }

  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({
      device_id: deviceId,
      quiz_id: quizId ?? null,
      title,
      score: recomputedScore,
      total,
      questions,
      answers: recomputed,
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
