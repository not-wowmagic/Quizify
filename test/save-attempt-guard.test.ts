import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { saveAttemptForClient, type SaveAttemptInput } from '@/lib/save-attempt';
import { SHARED_IP_BUCKET } from '@/lib/rate-limit';

beforeAll(() => {
  vi.stubEnv('E2E_MOCK_AI', '1');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function attempt(
  deviceId: string,
  questions: SaveAttemptInput['questions'],
  answers: SaveAttemptInput['answers'],
): SaveAttemptInput {
  return {
    deviceId,
    title: 'Attempt',
    score: 1,
    total: questions.length,
    questions,
    answers,
    language: 'English',
    durationSec: 1,
  };
}

describe('saveAttempt payload guard', () => {
  it('rejects a schema-valid payload above the 512 KiB cap before insert', async () => {
    const question = {
      type: 'matching' as const,
      question: 'Q'.repeat(2000),
      pairs: Array.from({ length: 8 }, () => ({
        premise: 'P'.repeat(500),
        response: 'R'.repeat(500),
      })),
      topic: 'T'.repeat(200),
    };
    const questions = Array.from({ length: 50 }, () => question);
    const answers = Array.from({ length: 50 }, (_, index) => ({
      index,
      type: 'standard' as const,
      correct: true,
      topic: 'T'.repeat(200),
    }));

    const result = await saveAttemptForClient(
      attempt('11111111-1111-4111-8111-111111111111', questions, answers),
      SHARED_IP_BUCKET,
    );

    expect(result).toEqual({ error: 'Attempt data is too large to save.' });
  });

  it('still accepts a small valid attempt', async () => {
    const result = await saveAttemptForClient(
      attempt(
        '22222222-2222-4222-8222-222222222222',
        [{ type: 'standard' as const, question: 'Q', options: ['A', 'B'], correctAnswerIndex: 0 }],
        [{ index: 0, type: 'standard' as const, correct: true }],
      ),
      SHARED_IP_BUCKET,
    );

    expect('id' in result).toBe(true);
  });
});
