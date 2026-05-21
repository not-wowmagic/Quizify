// src/lib/quiz-processors.ts
import type { Quiz, QuizQuestion } from '@/types/quiz';
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
  if (file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const textContent = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
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

export const processQuiz = (quizResult: { questions: QuizQuestion[] }): Quiz => {
  // Shuffle questions
  const shuffledQuestions = shuffleArray(quizResult.questions);

  // Shuffle options for each question and update the correct answer index safely
  const processedQuestions = shuffledQuestions.map((q) => {
    // Map options to objects tracking their correctness based on the original correct index
    const optionObjects = q.options.map((opt, index) => ({
      text: opt,
      isCorrect: index === q.correctAnswerIndex
    }));

    // Don't shuffle for true/false questions (length 2 or 4, containing 'true' and 'false')
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
      options: newOptions,
      correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0,
    };
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
