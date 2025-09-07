'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Quiz } from '@/types/quiz';
import { createQuiz, explainAnswer, regenerateQuizQuestions, createSummary } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, Upload, Lightbulb, XCircle, FileText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { processFile, processQuiz, quizHelpers } from '@/lib/quiz-processors';

// Motivational quotes for user engagement
const motivationalQuotes = [
    "Believe you can and you're halfway there.",
    "The secret of getting ahead is getting started.",
    "Don't watch the clock; do what it does. Keep going.",
    "The expert in anything was once a beginner.",
    "The only way to do great work is to love what you do.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "The future belongs to those who believe in the beauty of their dreams.",
    "Well done is better than well said.",
    "You are capable of more than you know.",
    "Push yourself, because no one else is going to do it for you."
];

const getRandomQuote = () => motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

export function QuizClient() {
  // Core quiz state
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  
  // Input state with validation
  const [lectureText, setLectureText] = useState('');
  const [numQuestions, setNumQuestions] = useState<number | ''>(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'situational' | 'fill_in_the_blank' | 'true_false' | 'mixed'>('multiple_choice');
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [fileName, setFileName] = useState('');
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousTextRef = useRef('');
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const { toast } = useToast();
  
  // Mount initialization
  useEffect(() => {
    setIsMounted(true);
    setCurrentQuote(getRandomQuote());
  }, []);

  // Input validation
  const isValidInput = useMemo(() => 
    quizHelpers.isValidInput(lectureText, numQuestions),
    [lectureText, numQuestions]
  );

  // Score calculations
  const { score, answeredQuestions, scorePercentage } = useMemo(() => {
    if (!quiz) return { score: 0, answeredQuestions: 0, scorePercentage: 0 };
    
    const answeredIndices = Object.keys(userAnswers);
    const correctAnswers = answeredIndices.reduce((acc, qIndexStr) => {
      const qIndex = parseInt(qIndexStr, 10);
      const question = quiz.questions[qIndex];
      return question.correctAnswerIndex === userAnswers[qIndex] ? acc + 1 : acc;
    }, 0);

    const percentage = quiz.questions.length > 0 
      ? (correctAnswers / quiz.questions.length) * 100 
      : 0;

    return { 
      score: correctAnswers, 
      answeredQuestions: answeredIndices.length, 
      scorePercentage: percentage 
    };
  }, [userAnswers, quiz]);

  // File processing handler
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setLectureText(''); // Clear previous text
    
    try {
      const text = await processFile(file);
      setLectureText(text);
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: 'File Processing Error',
        description: error instanceof Error ? error.message : 'Failed to read the file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Quiz generation handler
  const handleGenerateQuiz = async () => {
    if (!isValidInput) {
      toast({
        title: 'Invalid Input',
        description: 'Please provide enough text (at least 100 characters) and a valid number of questions (1-50).',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setCurrentQuote(getRandomQuote());
      setQuiz(null);
      setUserAnswers({});
      
      // Save current text for comparison
      previousTextRef.current = lectureText;
      
      const result = await createQuiz({ 
        lectureText, 
        numQuestions: Number(numQuestions) || 10, 
        difficulty, 
        questionType 
      });

      if ('error' in result) {
        toast({
          title: 'Error Generating Quiz',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      const processedQuiz = processQuiz(result);
      setQuiz(processedQuiz);
      
      // Automatically generate summary for longer texts
      if (lectureText.length > 1000) {
        handleGenerateSummary();
      }
    } catch (error) {
      toast({
        title: 'Unexpected Error',
        description: error instanceof Error ? error.message : 'Failed to generate quiz. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Quiz regeneration handler
  const handleRegenerateQuiz = async () => {
    if (!isValidInput || !quiz) {
      toast({
        title: 'Cannot Regenerate',
        description: 'Please ensure you have valid input text and an existing quiz.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsRegenerating(true);
      setCurrentQuote(getRandomQuote());
      
      // Compare with saved text
      if (lectureText !== previousTextRef.current) {
        toast({
          title: 'Text Changed',
          description: 'The lecture text has changed. Generating a new quiz instead.',
          variant: 'default',
        });
        await handleGenerateQuiz();
        return;
      }
      
      const result = await regenerateQuizQuestions({ 
        lectureText, 
        numQuestions: Number(numQuestions) || 10, 
        difficulty, 
        questionType 
      });

      if ('error' in result) {
        toast({
          title: 'Error Regenerating Quiz',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setQuiz(prevQuiz => {
        const newQuizData = processQuiz(result);
        if (!prevQuiz) return newQuizData;
        return {
          ...prevQuiz,
          questions: newQuizData.questions,
        };
      });
    } catch (error) {
      toast({
        title: 'Unexpected Error',
        description: error instanceof Error ? error.message : 'Failed to regenerate quiz. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  // Summary generation handler with debouncing
  const handleGenerateSummary = async () => {
    if (!lectureText) return;

    // Clear any pending debounced calls
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce summary generation to avoid excessive API calls
    debounceTimerRef.current = setTimeout(async () => {
      try {
        setIsSummaryLoading(true);
        const result = await createSummary({ lectureText });
        
        if ('error' in result) {
          toast({
            title: 'Error Creating Summary',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }

        setQuiz(prevQuiz => {
          if (!prevQuiz) return null;
          return {
            ...prevQuiz,
            summary: result.summary
          };
        });
      } catch (error) {
        toast({
          title: 'Summary Generation Failed',
          description: error instanceof Error ? error.message : 'Failed to generate summary. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsSummaryLoading(false);
      }
    }, 500); // 500ms debounce delay
  };

  // Answer selection handler
  const handleAnswer = (questionIndex: number, optionIndex: number) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
  };

  // Quiz reset handler
  const handleStartOver = () => {
    setCurrentQuote(getRandomQuote());
    setQuiz(null);
    setUserAnswers({});
    setNumQuestions(10);
    setDifficulty('medium');
    setQuestionType('multiple_choice');
    setLectureText('');
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFeedbackMessage = () => {
    if (scorePercentage >= 80) return "Excellent work! You've mastered this content!";
    if (scorePercentage >= 60) return "Good job! Keep practicing to improve further.";
    return "Keep learning! Practice makes perfect.";
  };

  if (!isMounted) {
    return null;
  }

  return (
    /* Your existing JSX rendering code */
  );
}
