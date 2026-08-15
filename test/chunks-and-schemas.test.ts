import { describe, it, expect } from 'vitest';
import { splitTextIntoChunks, computeChunkSize } from '@/ai/flows/generate-quiz';
import { GenerateQuizInputSchema } from '@/ai/flows/generate-quiz';

describe('splitTextIntoChunks', () => {
  it('returns a single chunk for short text', () => {
    const chunks = splitTextIntoChunks('Short text here. Second sentence.');
    expect(chunks).toHaveLength(1);
  });

  it('splits long text into chunks within the max length', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} with some padding words.`).join(' ');
    const chunks = splitTextIntoChunks(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
    // Reconstructed content should be preserved
    const joined = chunks.join(' ');
    expect(joined.replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('hard-splits a single sentence longer than max length', () => {
    const longSentence = 'word '.repeat(1000).trim();
    const chunks = splitTextIntoChunks(longSentence, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
    }
  });

  it('handles text without sentence punctuation', () => {
    const chunks = splitTextIntoChunks('one two three four five');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join(' ')).toBe('one two three four five');
  });
});

describe('computeChunkSize (adaptive chunking)', () => {
  it('keeps the 8000-char floor for large question counts', () => {
    expect(computeChunkSize(100_000, 50)).toBe(8000); // 13 chunks → below floor
  });

  it('uses fewer, larger chunks for small question counts', () => {
    // 25 questions → at most 7 chunks → ~14.3k per chunk
    expect(computeChunkSize(100_000, 25)).toBe(14_286);
    // 10 questions → at most 3 chunks → ~33.3k per chunk
    expect(computeChunkSize(100_000, 10)).toBe(33_334);
    // 2 questions → single chunk covering the whole document
    expect(computeChunkSize(100_000, 2)).toBe(100_000);
  });

  it('never exceeds the document length and keeps the floor for short docs', () => {
    expect(computeChunkSize(5_000, 10)).toBe(8000);
  });

  it('produces at most ceil(numQuestions/4) chunks on typical text', () => {
    const text = Array.from({ length: 2200 }, (_, i) => `Sentence ${i} about study material with enough words.`).join(' ');
    const chunkSize = computeChunkSize(text.length, 10);
    const chunks = splitTextIntoChunks(text, chunkSize);
    expect(chunks.length).toBeLessThanOrEqual(4); // ceil(10/4) = 3 (+1 tolerance)
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(chunkSize);
    }
  });
});

describe('GenerateQuizInputSchema (strict input validation)', () => {
  const validInput = {
    lectureText: 'x'.repeat(150),
    numQuestions: 10,
    difficulty: 'medium',
    questionType: 'mixed',
  };

  it('accepts valid input', () => {
    expect(() => GenerateQuizInputSchema.strict().parse(validInput)).not.toThrow();
  });

  it('trims lectureText and enforces the 100-char minimum', () => {
    const tooShort = GenerateQuizInputSchema.strict().safeParse({ ...validInput, lectureText: '   short   ' });
    expect(tooShort.success).toBe(false);
    const trimmed = GenerateQuizInputSchema.strict().parse({ ...validInput, lectureText: '  ' + 'x'.repeat(150) + '  ' });
    expect(trimmed.lectureText.startsWith(' ')).toBe(false);
    expect(trimmed.lectureText.length).toBe(150);
  });

  it('rejects more than 100000 characters', () => {
    const result = GenerateQuizInputSchema.strict().safeParse({ ...validInput, lectureText: 'x'.repeat(100001) });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range question counts', () => {
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, numQuestions: 0 }).success).toBe(false);
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, numQuestions: 51 }).success).toBe(false);
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, numQuestions: 2.5 }).success).toBe(false);
  });

  it('rejects invalid enum values', () => {
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, difficulty: 'extreme' }).success).toBe(false);
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, questionType: '<script>' }).success).toBe(false);
  });

  it('rejects unknown fields when strict (field tampering)', () => {
    const tampered = { ...validInput, admin: true, model: 'gemini-pro' };
    expect(GenerateQuizInputSchema.strict().safeParse(tampered).success).toBe(false);
  });

  it('defaults language to English when omitted', () => {
    const parsed = GenerateQuizInputSchema.strict().parse(validInput);
    expect(parsed.language).toBe('English');
  });

  it('accepts an explicit language and trims whitespace', () => {
    const parsed = GenerateQuizInputSchema.strict().parse({ ...validInput, language: '  Español  ' });
    expect(parsed.language).toBe('Español');
  });

  it('rejects an empty or overlong language', () => {
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, language: '  ' }).success).toBe(false);
    expect(GenerateQuizInputSchema.strict().safeParse({ ...validInput, language: 'x'.repeat(51) }).success).toBe(false);
  });
});
