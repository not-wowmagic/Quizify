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

/**
 * Opens the print dialog for the given HTML document (used by both the quiz
 * print view and the cram sheet). Opens a dedicated print popup first; when
 * popups are blocked it falls back to printing from a hidden same-origin
 * iframe so the "Save as PDF" dialog always appears.
 */
function printHtml(title: string, html: string): void {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    return;
  }

  // Popup blocked, so print via a hidden iframe instead.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.title = title;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  if (!iframeDoc) {
    iframe.remove();
    return;
  }
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();
  // The embedded script triggers window.print() on load; remove the iframe
  // after printing so it never lingers in the DOM.
  setTimeout(() => iframe.remove(), 60_000);
}

/** Opens a print-friendly study sheet for the quiz. */
export function printQuiz(quiz: Quiz, title: string): void {
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

  printHtml(title, `<!DOCTYPE html>
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
}

/** Opens a print-optimized, US Letter (8.5×11 in) "Cram Sheet" study guide (no answer key). */
export function printCramSheet(quiz: Quiz, title: string): void {
  // Group by topic so the cram sheet reads like a summary, not a quiz.
  const grouped = new Map<string, typeof quiz.questions>();
  for (const q of quiz.questions) {
    const key = q.topic?.trim() || 'Key Points';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(q);
    else grouped.set(key, [q]);
  }

  const sections = [...grouped.entries()]
    .map(([topic, questions]) => {
      const bullets = questions
        .map(q => {
          if (q.type === 'matching') {
            return q.pairs
              .map(p => `<li><strong>${escapeHtml(p.premise)}</strong> is ${escapeHtml(p.response)}</li>`)
              .join('');
          }
          const wrong = q.options
            .filter((_, i) => i !== q.correctAnswerIndex)
            .map(escapeHtml)
            .join(', ');
          return `
            <li><strong>${escapeHtml(q.question)}</strong><br>
              <span class="answer">→ ${escapeHtml(q.options[q.correctAnswerIndex])}</span>
              ${wrong ? `<span class="distractors"> · watch out for: ${wrong}</span>` : ''}
            </li>`;
        })
        .join('');
      return `
        <div class="section">
          <h2>${escapeHtml(topic)}</h2>
          <ul>${bullets}</ul>
        </div>`;
    })
    .join('');

  const statLine = `${quiz.questions.length} key ${quiz.questions.length === 1 ? 'point' : 'points'} · ${grouped.size} ${grouped.size === 1 ? 'topic' : 'topics'}`;

  printHtml(`Cram Sheet for ${escapeHtml(title)}`, `<!DOCTYPE html>
<html><head><title>Cram Sheet for ${escapeHtml(title)}</title>
<style>
  /* US Letter page (the print dialog's "Save as PDF" will use 8.5 x 11 in.) */
  @page { size: 8.5in 11in; margin: 0.55in 0.6in; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 7.3in; margin: 0 auto; color: #1e293b; }
  header { border-bottom: 3px solid #d97706; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 1.5rem; margin: 0; color: #111827; }
  .sub { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
  .section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.06em; color: #b45309; margin: 0 0 8px; }
  ul { margin: 0; padding-left: 18px; }
  li { margin-bottom: 8px; font-size: 0.86rem; line-height: 1.5; }
  .answer { color: #15803d; font-weight: 600; }
  .distractors { color: #64748b; font-size: 0.78rem; }
  footer { margin-top: 20px; font-size: 0.75rem; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style></head><body>
<header>
  <h1>Cram Sheet for ${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(statLine)} · generated by Quizify</p>
</header>
${sections}
<footer>Quizify · quick-revision sheet · answers in green</footer>
<script>window.onload = () => window.print();</script>
</body></html>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
