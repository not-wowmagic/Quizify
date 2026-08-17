// src/lib/quiz-export.ts
// Client-side export helpers for generated quizzes: Anki (TXT), CSV, and a
// print-friendly view. Pure functions where possible so they stay unit-testable.
import type { Quiz } from '@/types/quiz';
import { formatTopicLabel } from '@/lib/utils';

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
 *
 * The print() call is triggered from the host page (not an inline <script> in
 * the payload) because the site CSP forbids inline scripts: a payload that
 * embeds `window.print()` is silently blocked and the dialog never opens.
 */
function printHtml(title: string, html: string): void {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    triggerPrint(printWindow);
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
  // Wait for the payload to finish rendering, then print; remove the iframe
  // after printing so it never lingers in the DOM.
  const printAndCleanup = () => {
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  if (iframe.contentDocument?.readyState === 'complete') {
    printAndCleanup();
  } else {
    iframe.onload = printAndCleanup;
  }
}

/** Triggers window.print() once the target document has rendered its payload. */
function triggerPrint(target: Window): void {
  const doPrint = () => {
    target.focus();
    target.print();
  };
  if (target.document?.readyState === 'complete') {
    doPrint();
  } else {
    target.addEventListener('load', doPrint, { once: true });
  }
}

/** Builds the print-friendly HTML document for a quiz (pure, unit-testable). */
export function buildPrintHtml(quiz: Quiz, title: string): string {
  const questions = quiz.questions
    .map((q, index) => {
      const topicTag = q.topic ? `<span class="topic">${escapeHtml(formatTopicLabel(q.topic))}</span>` : '';
      if (q.type === 'matching') {
        const pairs = q.pairs
          .map((p, i) => `<li class="match-item"><span class="match-premise"><strong>${i + 1}.</strong> ${escapeHtml(p.premise)}</span> <span class="match-arrow">↔</span> <span class="match-response">${escapeHtml(p.response)}</span></li>`)
          .join('');
        return `
          <div class="q">
            <div class="q-title-row">
              <span class="q-num">${index + 1}</span>
              <div class="q-content">
                <p class="q-text"><strong>${escapeHtml(q.question)}</strong> ${topicTag}</p>
              </div>
            </div>
            <ul class="matching-list">${pairs}</ul>
          </div>`;
      }
      const options = q.options
        .map(opt => `<li class="opt-item"><span class="opt-text">${escapeHtml(opt)}</span></li>`)
        .join('');
      return `
        <div class="q">
          <div class="q-title-row">
            <span class="q-num">${index + 1}</span>
            <div class="q-content">
              <p class="q-text"><strong>${escapeHtml(q.question)}</strong> ${topicTag}</p>
            </div>
          </div>
          <ol type="A" class="options-list">${options}</ol>
        </div>`;
    })
    .join('');

  // All answers on their own last page
  const answerKey = quiz.questions
    .map((q, index) => {
      if (q.type === 'matching') {
        return `<li class="key-item"><span class="key-num"><strong>${index + 1}.</strong></span> <span class="key-val">${q.pairs.map(p => `${escapeHtml(p.premise)} ↔ ${escapeHtml(p.response)}`).join('; ')}</span></li>`;
      }
      return `<li class="key-item"><span class="key-num"><strong>${index + 1}.</strong></span> <span class="key-badge">${letter(q.correctAnswerIndex)}</span> <span class="key-text">${escapeHtml(q.options[q.correctAnswerIndex])}</span></li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page {
    size: auto;
    margin: 0.65in 0.75in;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 20px;
    color: #0f172a;
    background: #ffffff;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header {
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 18px;
    margin-bottom: 28px;
  }
  .brand-badge {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #4338ca;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    padding: 3px 10px;
    border-radius: 9999px;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 1.55rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 10px 0;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .header-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
    color: #64748b;
    flex-wrap: wrap;
    gap: 12px;
  }
  .student-fields {
    display: flex;
    gap: 20px;
  }
  .field-blank {
    border-bottom: 1px solid #cbd5e1;
    display: inline-block;
    width: 120px;
    height: 14px;
    vertical-align: bottom;
  }
  .field-blank.short {
    width: 50px;
  }
  .q {
    margin-bottom: 20px;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }
  .q-title-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }
  .q-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #4f46e5;
    color: #ffffff;
    font-size: 0.8rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .q-content {
    flex: 1;
  }
  .q-text {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 600;
    color: #1e293b;
    line-height: 1.45;
  }
  .topic {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 9999px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    color: #475569;
    font-size: 0.72rem;
    font-weight: 600;
    vertical-align: middle;
  }
  ol.options-list {
    margin: 0 0 0 38px;
    padding: 0 0 0 18px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .opt-item {
    margin: 0;
    padding: 7px 12px;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 8px;
    font-size: 0.9rem;
    color: #334155;
  }
  ul.matching-list {
    list-style: none;
    margin: 0 0 0 38px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .match-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .match-premise {
    font-weight: 600;
    color: #1e293b;
    flex: 1;
  }
  .match-arrow {
    color: #94a3b8;
    font-weight: 700;
  }
  .match-response {
    color: #475569;
    flex: 1;
  }
  .answer-key {
    page-break-before: always;
    break-before: page;
    padding-top: 20px;
  }
  .answer-key h1 {
    font-size: 1.45rem;
    color: #15803d;
    border-bottom: 2px solid #bbf7d0;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .answer-key ol {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 10px;
  }
  .answer-key li.key-item {
    margin-bottom: 0;
    padding: 10px 14px;
    background: #f0fdf4;
    border: 1px solid #dcfce7;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .key-num {
    color: #166534;
    font-size: 0.82rem;
    min-width: 24px;
  }
  .key-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: #22c55e;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 800;
    flex-shrink: 0;
  }
  .key-text {
    color: #14532d;
    font-weight: 600;
    flex: 1;
  }
  .key-val {
    color: #15803d;
    font-size: 0.84rem;
    line-height: 1.4;
  }
  footer.sheet-footer {
    margin-top: 32px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: center;
  }
</style>
</head>
<body>
<header>
  <div class="brand-badge">Quizify Study Sheet</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="header-meta">
    <span>${quiz.questions.length} ${quiz.questions.length === 1 ? 'Question' : 'Questions'} · Self-Study & Review</span>
    <div class="student-fields">
      <span>Name: <span class="field-blank"></span></span>
      <span>Date: <span class="field-blank"></span></span>
      <span>Score: <span class="field-blank short"></span> / ${quiz.questions.length}</span>
    </div>
  </div>
</header>
<main>
  ${questions}
</main>
<div class="answer-key">
  <div class="brand-badge" style="color: #15803d; background: #dcfce7; border-color: #bbf7d0;">Solutions</div>
  <h1>Answer Key</h1>
  <ol>${answerKey}</ol>
</div>
<footer class="sheet-footer">Quizify · Turn notes into active knowledge</footer>
</body>
</html>`;
}

/** Opens a print-friendly study sheet for the quiz. */
export function printQuiz(quiz: Quiz, title: string): void {
  printHtml(title, buildPrintHtml(quiz, title));
}

/** Builds the US Letter "Cram Sheet" HTML document (pure, unit-testable). */
export function buildCramSheetHtml(quiz: Quiz, title: string): string {
  // Group by topic so the cram sheet reads like a summary, not a quiz.
  const grouped = new Map<string, typeof quiz.questions>();
  for (const q of quiz.questions) {
    const key = formatTopicLabel(q.topic) || 'Key Points';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(q);
    else grouped.set(key, [q]);
  }

  const sections = [...grouped.entries()]
    .map(([topic, questions]) => {
      const bullets = questions
        .map(q => {
          if (q.type === 'matching') {
            return `
              <li class="cram-item">
                ${q.pairs.map(p => `<div class="matching-point"><strong>${escapeHtml(p.premise)}</strong> is <span class="answer">${escapeHtml(p.response)}</span></div>`).join('')}
              </li>`;
          }
          const wrong = q.options
            .filter((_, i) => i !== q.correctAnswerIndex)
            .map(escapeHtml)
            .join(', ');
          return `
            <li class="cram-item">
              <div class="point-q"><strong>${escapeHtml(q.question)}</strong></div>
              <div class="point-answers">
                <span class="answer">→ ${escapeHtml(q.options[q.correctAnswerIndex])}</span>
                ${wrong ? `<span class="distractors"> · watch out for: ${wrong}</span>` : ''}
              </div>
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cram Sheet for ${escapeHtml(title)}</title>
<style>
  /* US Letter page (the print dialog's "Save as PDF" will use 8.5 x 11 in.) */
  @page {
    size: 8.5in 11in;
    margin: 0.5in 0.6in;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    max-width: 7.5in;
    margin: 0 auto;
    padding: 16px 12px;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header {
    border-bottom: 3px solid #f59e0b;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .cram-pill {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fde68a;
    padding: 3px 10px;
    border-radius: 9999px;
    margin-bottom: 6px;
  }
  h1 {
    font-size: 1.55rem;
    font-weight: 800;
    margin: 0;
    color: #0f172a;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .sub {
    font-size: 0.82rem;
    color: #64748b;
    margin: 4px 0 10px 0;
  }
  .study-tip-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fffbeb;
    border: 1px solid #fef3c7;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 0.78rem;
    color: #92400e;
  }
  .section {
    margin-bottom: 18px;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #ffffff;
    border: 1px solid #fed7aa;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 1px 2px rgba(245, 158, 11, 0.04);
  }
  h2 {
    font-size: 0.92rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #c2410c;
    margin: 0 0 10px 0;
    border-bottom: 1.5px solid #ffedd5;
    padding-bottom: 6px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li.cram-item {
    margin-bottom: 0;
    padding: 8px 12px;
    font-size: 0.86rem;
    line-height: 1.45;
    background: #fafaf9;
    border-radius: 8px;
    border-left: 3.5px solid #f97316;
    border-top: 1px solid #f5f5f4;
    border-right: 1px solid #f5f5f4;
    border-bottom: 1px solid #f5f5f4;
  }
  .point-q {
    font-size: 0.88rem;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .point-answers {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .answer {
    color: #15803d;
    font-weight: 700;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    padding: 1px 6px;
    border-radius: 5px;
    font-size: 0.82rem;
  }
  .distractors {
    color: #64748b;
    font-size: 0.78rem;
  }
  .matching-point {
    margin-bottom: 4px;
    font-size: 0.86rem;
  }
  .matching-point:last-child {
    margin-bottom: 0;
  }
  footer {
    margin-top: 24px;
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 10px;
  }
</style>
</head>
<body>
<header>
  <div class="cram-pill">⚡ Quick-Revision Study Guide</div>
  <h1>Cram Sheet for ${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(statLine)} · generated by Quizify</p>
  <div class="study-tip-box">
    <span>💡 <strong>Study Strategy:</strong> Review the highlighted key points (<span style="color: #15803d; font-weight: bold;">answers in green</span>), then test yourself against the distractors.</span>
  </div>
</header>
${sections}
<footer>Quizify · quick-revision sheet · answers in green</footer>
</body>
</html>`;
}

/** Opens a print-optimized, US Letter (8.5×11 in) "Cram Sheet" study guide (no answer key). */
export function printCramSheet(quiz: Quiz, title: string): void {
  printHtml(`Cram Sheet for ${escapeHtml(title)}`, buildCramSheetHtml(quiz, title));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
