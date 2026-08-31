import { sanitizeText } from '@/lib/sanitize';

const LEGACY_TITLES = new Set(['untitled quiz', 'quiz', 'study material quiz', 'study quiz']);
const GENERIC_DATE_TITLE = /^(?:untitled quiz|study quiz|study material quiz|quiz)\s*[•·—-]\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/i;
const TITLE_CASE_EXCEPTIONS = new Set(['ai', 'api', 'css', 'csv', 'docx', 'html', 'http', 'it', 'json', 'pdf', 'sql', 'tcp', 'udp', 'url', 'ux', 'xml']);
const LOWERCASE_TITLE_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'via']);

function isGenericTitle(title: string): boolean {
  const normalized = title.toLowerCase();
  return LEGACY_TITLES.has(normalized) || GENERIC_DATE_TITLE.test(title);
}

function titleCase(value: string): string {
  const words = value.split(' ').filter(Boolean);
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    if (index > 0 && LOWERCASE_TITLE_WORDS.has(lower)) return lower;
    if (TITLE_CASE_EXCEPTIONS.has(lower)) return lower.toUpperCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

/** Normalizes model/user titles at trust and render boundaries. */
export function normalizeQuizTitle(value: string | null | undefined, fallback = 'Study Quiz'): string {
  if (!value) return fallback;
  let title = sanitizeText(value)
    .replace(/["'“”‘’`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  title = title.replace(/^[\s.,:;!?-]+|[\s.,:;!?-]+$/g, '').trim();
  if (!title || isGenericTitle(title)) return fallback;
  if (title.length > 80) {
    title = title.slice(0, 80).replace(/\s+\S*$/, '').trim();
  }
  return title || fallback;
}

export function titleFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const withoutExtension = filename.replace(/\.[^./\\]+$/, '').trim();
  if (!withoutExtension) return undefined;
  const readableName = withoutExtension.replace(/[\s_-]+/g, ' ').trim();
  const title = normalizeQuizTitle(titleCase(readableName), '');
  return title || undefined;
}

export function titleFromQuestions(questions: Array<{ topic?: string; question?: string }>): string | undefined {
  for (const question of questions) {
    const topic = normalizeQuizTitle(question.topic, '');
    if (topic) return topic;
  }

  const question = questions.find(item => item.question)?.question;
  if (!question) return undefined;
  const subject = question
    .replace(/^according to (?:the|this) (?:document|text|material),?\s*/i, '')
    .replace(/^(?:what|which|how|why|when|where)\s+(?:is|are|does|do|did)\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/[?!.:]+$/, '')
    .trim();
  const words = subject.split(/\s+/).slice(0, 6).join(' ');
  const title = normalizeQuizTitle(titleCase(words), '');
  return title || undefined;
}
