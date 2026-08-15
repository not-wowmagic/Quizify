// src/lib/sanitize.ts
// Shared text sanitizer — no dependencies, safe for both server and client use.

/** Strips ASCII control characters (keeps tab, LF, CR) from study text. */
export function sanitizeText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isControl = (code <= 31 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    if (!isControl) out += ch;
  }
  return out;
}
