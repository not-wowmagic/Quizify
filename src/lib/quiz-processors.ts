// src/lib/quiz-processors.ts
import type { Quiz, QuizQuestion, StandardQuestion, MatchingQuestion } from '@/types/quiz';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up the worker for pdfjs using Next.js Webpack asset bundling
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

// Helper function to shuffle arrays
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

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
        .map((item: any) => item.str)
        .join(' ');
      textContent.push(pageText);
    }
    
    const fullText = textContent.join('\n\n');
    if (fullText.trim().length < 10) {
      throw new Error('This PDF appears to be a scanned image or empty. It does not contain any readable text layers. Please use a text-based document or copy and paste the text manually.');
    }
    return fullText;
  } 
  
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  
  throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
};

/**
 * Processes a standard (multiple-choice) question — shuffles options and updates correct index.
 */
function processStandardQuestion(q: StandardQuestion): StandardQuestion {
  const optionObjects = q.options.map((opt, index) => ({
    text: opt,
    isCorrect: index === q.correctAnswerIndex
  }));

  // Don't shuffle for true/false questions
  const isTrueFalse = (q.options.length === 2 || q.options.length === 4) &&
    q.options.some(o => typeof o === 'string' && o.toLowerCase() === 'true') &&
    q.options.some(o => typeof o === 'string' && o.toLowerCase() === 'false');

  let shuffledObjects = optionObjects;
  if (!isTrueFalse) {
    shuffledObjects = shuffleArray(optionObjects);
  }

  const newOptions = shuffledObjects.map(o => o.text);
  const newCorrectAnswerIndex = shuffledObjects.findIndex(o => o.isCorrect);

  return {
    ...q,
    type: 'standard',
    options: newOptions,
    correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0,
  };
}

/**
 * Processes a matching question — shuffles the response column order.
 */
function processMatchingQuestion(q: MatchingQuestion): MatchingQuestion {
  // Create an array of response indices [0, 1, 2, ...] and shuffle them
  const responseIndices = q.pairs.map((_, i) => i);
  const shuffledIndices = shuffleArray(responseIndices);

  return {
    ...q,
    type: 'matching',
    shuffledResponseIndices: shuffledIndices,
  };
}

export const processQuiz = (quizResult: { questions: QuizQuestion[] }): Quiz => {
  // Shuffle question order
  const shuffledQuestions = shuffleArray(quizResult.questions);

  // Process each question based on type
  const processedQuestions = shuffledQuestions.map((q): QuizQuestion => {
    if (q.type === 'matching') {
      return processMatchingQuestion(q);
    }
    return processStandardQuestion(q);
  });

  return { questions: processedQuestions };
};

const isValidInput = (text: string, numQuestions: number | ''): boolean => {
  return text.trim().length >= 100 && 
         numQuestions !== '' && 
         Number(numQuestions) > 0 && 
         Number(numQuestions) <= 50;
};

export const quizHelpers = {
  isValidInput,
  shuffleArray,
};
