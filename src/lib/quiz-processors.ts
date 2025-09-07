// src/lib/quiz-processors.ts
import type { Quiz, QuizQuestion } from '@/types/quiz';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up the worker for pdfjs
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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
    
    return textContent.join('\n\n');
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

  // Shuffle options for each question and update the correct answer index
  const processedQuestions = shuffledQuestions.map((q) => {
    // Don't shuffle for true/false questions
    if (q.options.length === 2 && 
        q.options[0].toLowerCase() === 'true' && 
        q.options[1].toLowerCase() === 'false') {
      return q;
    }
    
    const correctAnswer = q.options[q.correctAnswerIndex];
    const shuffledOptions = shuffleArray(q.options);
    const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswer);

    return {
      ...q,
      options: shuffledOptions,
      correctAnswerIndex: newCorrectAnswerIndex,
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
