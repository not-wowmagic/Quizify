import { describe, it, expect } from 'vitest';
import { buildAnkiTxt, buildQuizCsv, buildPrintHtml, buildCramSheetHtml } from '@/lib/quiz-export';
import type { Quiz } from '@/types/quiz';

const sampleQuiz: Quiz = {
  questions: [
    {
      type: 'standard',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswerIndex: 1,
      topic: 'Math',
    },
    {
      type: 'matching',
      question: 'Match each term with its definition:',
      pairs: [
        { premise: 'Photosynthesis', response: 'Plants convert light to energy' },
        { premise: 'Respiration', response: 'Cells release energy from glucose' },
      ],
      topic: 'Biology',
    },
  ],
};

describe('buildAnkiTxt', () => {
  it('produces one Tab-separated note per question', () => {
    const output = buildAnkiTxt(sampleQuiz);
    const notes = output.split('\n').filter(line => line.includes('\t'));
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note).toContain('\t');
    }
  });

  it('puts the question and options on the front, correct answer on the back', () => {
    const [front, back] = buildAnkiTxt({ questions: [sampleQuiz.questions[0]] }).split('\t');
    expect(front).toContain('What is 2 + 2?');
    expect(front).toContain('A. 3');
    expect(front).toContain('B. 4');
    expect(back).toBe('B. 4');
  });

  it('renders matching questions as premise lists with mapped responses', () => {
    const [front, back] = buildAnkiTxt({ questions: [sampleQuiz.questions[1]] }).split('\t');
    expect(front).toContain('1. Photosynthesis');
    expect(front).toContain('2. Respiration');
    expect(back).toContain('1. Plants convert light to energy');
    expect(back).toContain('2. Cells release energy from glucose');
  });
});

describe('buildQuizCsv', () => {
  it('emits a header row plus one row per question', () => {
    const rows = buildQuizCsv(sampleQuiz).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe('Question,Options,Correct Answer,Topic');
  });

  it('includes the topic column', () => {
    const rows = buildQuizCsv(sampleQuiz).split('\n');
    expect(rows[1]).toContain('Math');
    expect(rows[2]).toContain('Biology');
  });

  it('quotes fields containing commas or quotes', () => {
    const tricky: Quiz = {
      questions: [{
        type: 'standard',
        question: 'Choose the "best" option, please?',
        options: ['Option A, with comma', 'Option B'],
        correctAnswerIndex: 0,
      }],
    };
    const row = buildQuizCsv(tricky).split('\n')[1];
    expect(row.startsWith('"')).toBe(true);
    expect(row).toContain('""best""');
  });
});

describe('buildPrintHtml', () => {
  it('contains no inline scripts (CSP regression guard)', () => {
    const html = buildPrintHtml(sampleQuiz, 'Quizify Study Sheet');
    expect(html).not.toContain('<script');
    expect(html).toContain('Quizify Study Sheet');
    expect(html).toContain('Answer Key');
  });

  it('formats camelCase topic labels', () => {
    const quiz: Quiz = {
      questions: [{
        type: 'standard',
        question: 'Q?',
        options: ['A', 'B'],
        correctAnswerIndex: 0,
        topic: 'PhotosynthesisOverview',
      }],
    };
    expect(buildPrintHtml(quiz, 't')).toContain('Photosynthesis Overview');
  });

  it('escapes user text so HTML injection is inert', () => {
    const quiz: Quiz = {
      questions: [{
        type: 'standard',
        question: 'What about <script>alert(1)</script>?',
        options: ['<img src=x onerror=alert(1)>', '& safe'],
        correctAnswerIndex: 1,
      }],
    };
    const html = buildPrintHtml(quiz, 't');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders matching questions with their pairs and answer key', () => {
    const html = buildPrintHtml(sampleQuiz, 't');
    expect(html).toContain('Photosynthesis ↔ Plants convert light to energy');
    expect(html).toContain('Respiration ↔ Cells release energy from glucose');
    expect(html).toContain('Answer Key');
  });
});

describe('buildCramSheetHtml', () => {
  it('contains no inline scripts and groups by topic', () => {
    const html = buildCramSheetHtml(sampleQuiz, 't');
    expect(html).not.toContain('<script');
    expect(html).toContain('Cram Sheet');
    expect(html).toContain('Math');
    expect(html).toContain('Biology');
    expect(html).toContain('2 key points · 2 topics');
  });

  it('shows the correct answer and distractors for standard questions', () => {
    const quiz: Quiz = {
      questions: [{
        type: 'standard',
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctAnswerIndex: 1,
        topic: 'Arithmetic',
      }],
    };
    const html = buildCramSheetHtml(quiz, 't');
    expect(html).toContain('→ 4');
    expect(html).toContain('watch out for: 3, 5, 6');
    expect(html).toContain('1 key point · 1 topic');
  });

  it('falls back to a Key Points section for untitled questions', () => {
    const quiz: Quiz = {
      questions: [{
        type: 'standard',
        question: 'Q?',
        options: ['A', 'B'],
        correctAnswerIndex: 0,
      }],
    };
    const html = buildCramSheetHtml(quiz, 't');
    expect(html).toContain('Key Points');
  });

  it('escapes question text in the cram sheet', () => {
    const quiz: Quiz = {
      questions: [{
        type: 'standard',
        question: 'A <b>bold</b> claim?',
        options: ['Yes', 'No'],
        correctAnswerIndex: 0,
      }],
    };
    const html = buildCramSheetHtml(quiz, 't');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});
