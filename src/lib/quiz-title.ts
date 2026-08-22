import { sanitizeText } from '@/lib/sanitize';

const LEGACY_TITLES = new Set(['untitled quiz', 'quiz', 'study material quiz', 'study quiz']);

/** Normalizes model/user titles at trust and render boundaries. */
export function normalizeQuizTitle(value: string | null | undefined, fallback = 'Study Quiz'): string {
  if (!value) return fallback;
  let title = sanitizeText(value)
    .replace(/["'“”‘’`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  title = title.replace(/^[\s.,:;!?-]+|[\s.,:;!?-]+$/g, '').trim();
  if (!title || LEGACY_TITLES.has(title.toLowerCase())) return fallback;
  if (title.length > 80) {
    title = title.slice(0, 80).replace(/\s+\S*$/, '').trim();
  }
  return title || fallback;
}

export function titleFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const withoutExtension = filename.replace(/\.[^./\\]+$/, '').trim();
  if (!withoutExtension) return undefined;
  const title = normalizeQuizTitle(withoutExtension, '');
  return title || undefined;
}
