import { describe, it, expect } from 'vitest';
import {
  QuizQuestionSchema,
  validateQuestions,
  dedupeQuestionOptions,
  stringSimilarity,
  SIMILARITY_THRESHOLD,
} from '@/ai/flows/generate-quiz';
import type { QuizQuestion } from '@/types/quiz';

// =========================================
// Golden fixtures, "recorded" model outputs across subjects and formats.
// These mimic real AI responses (including degenerate cases) so the
// deterministic validators can be asserted without network calls.
// =========================================

const goldenSubjects = [
  {
    subject: 'Medical',
    raw: [
      { type: 'standard', question: 'Which organelle is the site of ATP production?', options: ['Mitochondrion', 'Ribosome', 'Golgi apparatus', 'Nucleus'], correctAnswerIndex: 0, topic: 'Cell Biology' },
      { type: 'standard', question: 'What does the R in RICE stand for?', options: ['Rest', 'Run', 'Repeat', 'React'], correctAnswerIndex: 0, topic: 'First Aid' },
      { type: 'standard', question: 'Which blood cells fight infection?', options: ['Red blood cells', 'White blood cells', 'Platelets', 'Plasma cells'], correctAnswerIndex: 1, topic: 'Hematology' },
      { type: 'standard', question: 'Which part of the brain controls balance?', options: ['Cerebellum', 'Cerebrum', 'Brainstem', 'Thalamus'], correctAnswerIndex: 0, topic: 'Neuroscience' },
      { type: 'standard', question: 'What vitamin is produced by sunlight?', options: ['Vitamin A', 'Vitamin D', 'Vitamin C', 'Vitamin E'], correctAnswerIndex: 1, topic: 'Nutrition' },
    ],
  },
  {
    subject: 'Law',
    raw: [
      { type: 'standard', question: 'Which principle means "to stand by decided matters"?', options: ['Stare decisis', 'Habeas corpus', 'Actus reus', 'Mens rea'], correctAnswerIndex: 0, topic: 'Legal Doctrine' },
      { type: 'standard', question: 'Which branch of law deals with disputes between individuals?', options: ['Civil law', 'Criminal law', 'Public law', 'Maritime law'], correctAnswerIndex: 0, topic: 'Civil Law' },
      { type: 'standard', question: 'A wrongful act giving rise to damages is called:', options: ['A tort', 'A felony', 'A statute', 'A verdict'], correctAnswerIndex: 0, topic: 'Torts' },
      { type: 'matching', question: 'Match each Latin legal term with its meaning:', pairs: [{ premise: 'Actus reus', response: 'Guilty act' }, { premise: 'Mens rea', response: 'Guilty mind' }, { premise: 'Habeas corpus', response: 'Produce the body' }, { premise: 'Prima facie', response: 'On its face' }], topic: 'Latin Terms' },
      { type: 'standard', question: 'Who presides over a trial?', options: ['Judge', 'Jury', 'Bailiff', 'Clerk'], correctAnswerIndex: 0, topic: 'Courtroom' },
    ],
  },
  {
    subject: 'Computer Science',
    raw: [
      { type: 'standard', question: 'Which data structure is FIFO?', options: ['Queue', 'Stack', 'Tree', 'Graph'], correctAnswerIndex: 0, topic: 'Data Structures' },
      { type: 'standard', question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Graphics Processing Unit', 'Computer Personal Unit', 'Core Processing Utility'], correctAnswerIndex: 0, topic: 'Hardware' },
      { type: 'standard', question: 'Which sorting algorithm has O(n log n) average time?', options: ['Merge sort', 'Bubble sort', 'Selection sort', 'Insertion sort'], correctAnswerIndex: 0, topic: 'Algorithms' },
      { type: 'standard', question: 'What does HTTP stand for?', options: ['HyperText Transfer Protocol', 'File Transfer Protocol', 'High Text Transport Protocol', 'HyperText Transmission Process'], correctAnswerIndex: 0, topic: 'Networking' },
      { type: 'standard', question: 'Which language runs in the browser?', options: ['JavaScript', 'C++', 'Rust', 'Assembly'], correctAnswerIndex: 0, topic: 'Web' },
    ],
  },
  {
    subject: 'History',
    raw: [
      { type: 'standard', question: 'In which year did World War II end?', options: ['1945', '1939', '1950', '1918'], correctAnswerIndex: 0, topic: 'World War II' },
      { type: 'standard', question: 'Who was the first US president?', options: ['George Washington', 'Thomas Jefferson', 'John Adams', 'Benjamin Franklin'], correctAnswerIndex: 0, topic: 'US History' },
      { type: 'standard', question: 'Which wall fell in 1989?', options: ['Berlin Wall', 'Hadrian\'s Wall', 'Great Wall', 'Western Wall'], correctAnswerIndex: 0, topic: 'Cold War' },
      { type: 'standard', question: 'The Renaissance began in which country?', options: ['Italy', 'France', 'England', 'Spain'], correctAnswerIndex: 0, topic: 'Renaissance' },
      { type: 'standard', question: 'Who was the ancient Egyptian queen who allied with Rome?', options: ['Cleopatra', 'Nefertiti', 'Hatshepsut', 'Isis'], correctAnswerIndex: 0, topic: 'Ancient Egypt' },
    ],
  },
  {
    subject: 'Physics',
    raw: [
      { type: 'standard', question: 'What is the unit of force?', options: ['Newton', 'Joule', 'Watt', 'Pascal'], correctAnswerIndex: 0, topic: 'Mechanics' },
      { type: 'standard', question: 'E=mc² was proposed by:', options: ['Albert Einstein', 'Isaac Newton', 'Niels Bohr', 'Max Planck'], correctAnswerIndex: 0, topic: 'Relativity' },
      { type: 'standard', question: 'Light travels fastest in:', options: ['Vacuum', 'Water', 'Glass', 'Diamond'], correctAnswerIndex: 0, topic: 'Optics' },
      { type: 'standard', question: 'Which force holds the nucleus together?', options: ['Strong nuclear force', 'Gravity', 'Electromagnetism', 'Weak force'], correctAnswerIndex: 0, topic: 'Nuclear Physics' },
      { type: 'standard', question: 'Sound cannot travel through:', options: ['Vacuum', 'Air', 'Water', 'Steel'], correctAnswerIndex: 0, topic: 'Waves' },
    ],
  },
  {
    subject: 'Literature',
    raw: [
      { type: 'standard', question: 'Who wrote "Romeo and Juliet"?', options: ['William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain'], correctAnswerIndex: 0, topic: 'Shakespeare' },
      { type: 'standard', question: '"1984" was written by:', options: ['George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'J.R.R. Tolkien'], correctAnswerIndex: 0, topic: 'Dystopian Fiction' },
      { type: 'standard', question: 'Which novel begins "Call me Ishmael"?', options: ['Moby-Dick', 'The Great Gatsby', 'The Odyssey', 'Dracula'], correctAnswerIndex: 0, topic: 'American Literature' },
      { type: 'matching', question: 'Match each author with their famous work:', pairs: [{ premise: 'Mary Shelley', response: 'Frankenstein' }, { premise: 'Herman Melville', response: 'Moby-Dick' }, { premise: 'F. Scott Fitzgerald', response: 'The Great Gatsby' }, { premise: 'Toni Morrison', response: 'Beloved' }], topic: 'Authors' },
      { type: 'standard', question: 'A sonnet has how many lines?', options: ['14', '12', '16', '10'], correctAnswerIndex: 0, topic: 'Poetry' },
    ],
  },
] as const;

type RawFixtureQuestion = {
  type: string;
  question: string;
  options?: readonly string[];
  correctAnswerIndex?: number;
  pairs?: readonly { premise: string; response: string }[];
  topic?: string;
};

function toQuestions(raw: readonly RawFixtureQuestion[]): QuizQuestion[] {
  return raw.flatMap((q): QuizQuestion[] => {
    if (q.type === 'matching') {
      return [{ type: 'matching', question: q.question, pairs: [...(q.pairs ?? [])], topic: q.topic }];
    }
    return [{
      type: 'standard',
      question: q.question,
      options: [...(q.options ?? [])],
      correctAnswerIndex: q.correctAnswerIndex ?? 0,
      topic: q.topic,
    }];
  });
}

describe('golden fixtures, deterministic validators (no network)', () => {
  for (const fixture of goldenSubjects) {
    describe(fixture.subject, () => {
      it('every recorded question conforms to QuizQuestionSchema', () => {
        const questions = toQuestions(fixture.raw);
        for (const q of questions) {
          expect(QuizQuestionSchema.safeParse(q).success).toBe(true);
        }
      });

      it('has zero near-duplicate options (incl. vs the correct answer)', () => {
        const questions = toQuestions(fixture.raw);
        const standard = questions.filter((q): q is Extract<QuizQuestion, { type: 'standard' }> => q.type === 'standard');
        for (const q of standard) {
          for (let i = 0; i < q.options.length; i++) {
            for (let j = i + 1; j < q.options.length; j++) {
              expect(stringSimilarity(q.options[i], q.options[j])).toBeLessThanOrEqual(SIMILARITY_THRESHOLD);
            }
          }
          for (let i = 0; i < q.options.length; i++) {
            if (i === q.correctAnswerIndex) continue;
            expect(stringSimilarity(q.options[i], q.options[q.correctAnswerIndex])).toBeLessThanOrEqual(SIMILARITY_THRESHOLD);
          }
        }
      });

      it('correctAnswerIndex is in bounds and topics are meaningful (1-4 words)', () => {
        for (const q of toQuestions(fixture.raw)) {
          if (q.type === 'standard') {
            expect(q.correctAnswerIndex).toBeGreaterThanOrEqual(0);
            expect(q.correctAnswerIndex).toBeLessThan(q.options.length);
          }
          expect(q.topic?.length ?? 0).toBeGreaterThan(0);
          expect((q.topic ?? '').split(/\s+/).length).toBeLessThanOrEqual(4);
        }
      });
    });
  }
});

describe('similarity + dedup behavior', () => {
  it('flags near-identical phrasing (case / punctuation variants)', () => {
    expect(stringSimilarity('In 1945', 'In 1945.')).toBeGreaterThan(SIMILARITY_THRESHOLD);
    expect(stringSimilarity('Moby-Dick', 'Moby Dick')).toBeGreaterThan(SIMILARITY_THRESHOLD);
    expect(stringSimilarity('world war II', 'World War II')).toBeGreaterThan(SIMILARITY_THRESHOLD);
  });

  it('treats genuinely different options as distinct', () => {
    expect(stringSimilarity('Mitochondrion', 'Ribosome')).toBeLessThan(SIMILARITY_THRESHOLD);
  });

  it('drops questions whose distractor duplicates the correct answer', () => {
    const bad: Parameters<typeof dedupeQuestionOptions>[0] = [
      { type: 'standard', question: 'Q?', options: ['Answer A', 'Answer B', 'Answer A'], correctAnswerIndex: 0, topic: 'T' },
      { type: 'standard', question: 'Q2?', options: ['X', 'Y', 'Z'], correctAnswerIndex: 1, topic: 'T' },
    ];
    const kept = dedupeQuestionOptions(bad);
    expect(kept).toHaveLength(1);
    expect(kept[0].question).toBe('Q2?');
  });

  it('validateQuestions drops malformed and duplicate-heavy questions together', () => {
    const raw: Parameters<typeof validateQuestions>[0] = [
      { type: 'standard', question: 'Q1?', options: ['A', 'B', 'C'], correctAnswerIndex: 9, topic: 'T' },
      { type: 'standard', question: 'Q2?', options: ['Same', 'Same', 'Other'], correctAnswerIndex: 0, topic: 'T' },
      { type: 'standard', question: 'Q3?', options: ['Good', 'Better', 'Best'], correctAnswerIndex: 2, topic: 'T' },
    ];
    const valid = validateQuestions(raw, 'test');
    expect(valid).toHaveLength(1);
    expect(valid[0].question).toBe('Q3?');
  });
});
