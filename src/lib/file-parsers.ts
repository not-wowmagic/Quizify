// src/lib/file-parsers.ts
// Heavy document parsers (pdf.js, mammoth). This module is dynamically
// imported by the client only when a user uploads a file, keeping ~2.6 MB
// of parsing code out of the main bundle.
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up the worker for pdfjs using Next.js Webpack asset bundling
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

/** Strips ASCII control characters (keeps tab, LF, CR) from extracted text. */
function cleanExtractedText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isControl = (code <= 31 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    if (!isControl) out += ch;
  }
  return out;
}

export const processFile = async (file: File): Promise<string> => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds the 10MB limit. Please upload a smaller file.');
  }

  if (file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const textContent = [];

    const MAX_PAGES = 50;
    const pagesToProcess = Math.min(pdf.numPages, MAX_PAGES);

    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      textContent.push(pageText);
    }

    const fullText = cleanExtractedText(textContent.join('\n\n'));
    if (fullText.trim().length < 10) {
      throw new Error('This PDF appears to be a scanned image or empty. It does not contain any readable text layers. Please use a text-based document or copy and paste the text manually.');
    }
    return fullText;
  }

  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return cleanExtractedText(result.value);
  }

  throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
};
