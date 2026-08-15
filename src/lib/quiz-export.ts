// src/lib/quiz-export.ts
// Client-side export helpers for generated quizzes: Anki (TXT), CSV, and a
// print-friendly view. Pure functions where possible so they stay unit-testable.
import type { Quiz } from '@/types/quiz';

const letter = (index: number) => String.fromCharCode(65 + index);

/** Builds an Anki-importable TXT file (one note per line: Front<TAB>Back). */
export function buildAnkiTxt(quiz: Quiz): string {
  const notes: string[] = [];

  for (const q of quiz.questions) {
    if (q.type === 'matching') {
      const front = [
        q.question,
        '',
        ...q.pairs.map((p, i) => `${i + 1}. ${p.premise}`),
      ].join('\n');
      const back = q.pairs.map((p, i) => `${i + 1}. ${p.response}`).join('\n');
      notes.push(`${front}\t${back}`);
    } else {
      const front = [q.question, '', ...q.options.map((opt, i) => `${letter(i)}. ${opt}`)].join('\n');
      const back = `${letter(q.correctAnswerIndex)}. ${q.options[q.correctAnswerIndex]}`;
      notes.push(`${front}\t${back}`);
    }
  }

  return notes.join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a CSV file with columns: Question, Options, Correct Answer, Topic. */
export function buildQuizCsv(quiz: Quiz): string {
  const rows: string[][] = [['Question', 'Options', 'Correct Answer', 'Topic']];

  for (const q of quiz.questions) {
    if (q.type === 'matching') {
      const questionText = `${q.question} (Match the following: ${q.pairs.map((_, i) => letter(i)).join(', ')})`;
      const options = q.pairs.map((p, i) => `${letter(i)}. ${p.premise}`).join(' | ');
      const answer = q.pairs.map((p, i) => `${letter(i)} ↔ ${p.response}`).join(' | ');
      rows.push([questionText, options, answer, q.topic ?? '']);
    } else {
      rows.push([
        q.question,
        q.options.map((opt, i) => `${letter(i)}. ${opt}`).join(' | '),
        `${letter(q.correctAnswerIndex)}. ${q.options[q.correctAnswerIndex]}`,
        q.topic ?? '',
      ]);
    }
  }

  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

/** Downloads a text payload as a file using a Blob URL. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Opens a print-friendly study sheet for the quiz. */
export function printQuiz(quiz: Quiz, title: string): void {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return;

  const questions = quiz.questions
    .map((q, index) => {
      if (q.type === 'matching') {
        return `
          <div class="q">
            <p><strong>${index + 1}. ${escapeHtml(q.question)}</strong> ${q.topic ? `<span class="topic">${escapeHtml(q.topic)}</span>` : ''}</p>
            <ul>${q.pairs.map(p => `<li>${escapeHtml(p.premise)} ↔ ${escapeHtml(p.response)}</li>`).join('')}</ul>
          </div>`;
      }
      return `
        <div class="q">
          <p><strong>${index + 1}. ${escapeHtml(q.question)}</strong> ${q.topic ? `<span class="topic">${escapeHtml(q.topic)}</span>` : ''}</p>
          <ol type="A">${q.options.map(opt => `<li>${escapeHtml(opt)}</li>`).join('')}</ol>
        </div>`;
    })
    .join('');

  // All answers on their own last page
  const answerKey = quiz.questions
    .map((q, index) => {
      if (q.type === 'matching') {
        return `<li><strong>${index + 1}.</strong> ${q.pairs.map(p => `${escapeHtml(p.premise)} ↔ ${escapeHtml(p.response)}`).join('; ')}</li>`;
      }
      return `<li><strong>${index + 1}.</strong> ${letter(q.correctAnswerIndex)}. ${escapeHtml(q.options[q.correctAnswerIndex])}</li>`;
    })
    .join('');

  printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
  h1 { font-size: 1.4rem; margin-bottom: 24px; }
  .q { margin-bottom: 20px; page-break-inside: avoid; }
  ol { margin: 8px 0 4px; }
  .answer-key { page-break-before: always; }
  .answer-key ol { list-style: none; padding: 0; }
  .answer-key li { margin-bottom: 8px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .answer-key li strong { color: #15803d; }
  .topic { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 0.75rem; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${questions}
<div class="answer-key">
  <h1>Answer Key</h1>
  <ol>${answerKey}</ol>
</div>
<script>window.onload = () => window.print();</script>
</body></html>`);
  printWindow.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
