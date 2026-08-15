'use client';

// src/components/quiz-client.tsx
// Orchestrator for the quiz flow. Presentation lives in src/components/quiz/*.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Quiz } from '@/types/quiz';
import { createQuiz, createSummary } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { processQuiz, quizHelpers } from '@/lib/quiz-processors';
import { QuizSetup } from '@/components/quiz/quiz-setup';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import type { Difficulty, MatchingAnswer, QuestionTypeId, QuizAnswer } from '@/components/quiz/types';

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

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface QuizClientProps {
  onQuizStateChange?: (hasQuiz: boolean) => void;
}

export function QuizClient({ onQuizStateChange }: QuizClientProps = {}) {
  // Core quiz state
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, QuizAnswer>>({});

  // Input state with validation
  const [lectureText, setLectureText] = useState('');
  const [numQuestions, setNumQuestions] = useState<number | ''>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionType, setQuestionType] = useState<QuestionTypeId>('multiple_choice');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState('');
  const [fileName, setFileName] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Refs
  const quizHeaderRef = useRef<HTMLHeadingElement>(null);

  const { toast } = useToast();

  // Quote is picked after mount so SSR and first client render match
  useEffect(() => {
    // ponytail: hydration guard — a random value can't be computed during render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentQuote(getRandomQuote());
  }, []);

  // Seconds since the current loading phase started (for "still working" hints)
  const [elapsedSec, setElapsedSec] = useState(0);
  const [prevLoading, setPrevLoading] = useState(isLoading);
  if (prevLoading !== isLoading) {
    setPrevLoading(isLoading);
    if (!isLoading) setElapsedSec(0);
  }

  useEffect(() => {
    if (!isLoading) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    onQuizStateChange?.(!!quiz);
  }, [quiz, onQuizStateChange]);

  // Move keyboard focus to the quiz header when a quiz appears
  useEffect(() => {
    if (quiz) {
      quizHeaderRef.current?.focus();
    }
  }, [quiz]);


  const handleFileSelected = async (file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    setLectureText('');

    try {
      // Heavy parsers (pdf.js, mammoth) are code-split and loaded on demand
      const { processFile } = await import('@/lib/file-parsers');
      const text = await processFile(file);
      setLectureText(text);
    } catch (error) {
      toast({
        title: 'File Processing Error',
        description: error instanceof Error ? error.message : 'Failed to read the file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!quizHelpers.isValidInput(lectureText, numQuestions)) {
      toast({
        title: 'Invalid Input',
        description: 'Please provide enough text (at least 100 characters) and a valid question count (1-50).',
        variant: 'destructive',
      });
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast({
        title: 'Verification Required',
        description: 'Please complete the bot check before generating a quiz.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setCurrentQuote(getRandomQuote());
      setQuiz(null);
      setUserAnswers({});

      const result = await createQuiz({
        lectureText,
        numQuestions: Number(numQuestions) || 10,
        difficulty,
        questionType,
        turnstileToken: turnstileToken ?? undefined,
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

  const handleSummaryClick = async () => {
    // Toggle visibility when a summary already exists instead of regenerating
    if (quiz?.summary) {
      setShowSummary(prev => !prev);
      return;
    }
    if (!lectureText) return;

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
      setShowSummary(true);
    } catch (error) {
      toast({
        title: 'Summary Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate summary. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleStandardAnswer = (questionIndex: number, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionIndex]: { type: 'standard', selectedIndex: optionIndex },
    }));
  };

  const handleMatchingUpdate = (questionIndex: number, answer: MatchingAnswer) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionIndex]: answer,
    }));
  };

  const handleStartOver = () => {
    setCurrentQuote(getRandomQuote());
    setQuiz(null);
    setUserAnswers({});
    setNumQuestions(10);
    setDifficulty('medium');
    setQuestionType('multiple_choice');
    setLectureText('');
    setFileName('');
    setShowSummary(false);
  };

  const handleRegenerateQuiz = () => {
    setQuiz(null);
    setUserAnswers({});
    setShowSummary(false);
    setCurrentQuote(getRandomQuote());
  };

  const { score, answeredQuestions, scorePercentage } = useMemo(() => {
    if (!quiz) return { score: 0, answeredQuestions: 0, scorePercentage: 0 };

    let totalCorrect = 0;
    let totalAnswered = 0;

    quiz.questions.forEach((q, qIndex) => {
      const answer = userAnswers[qIndex];
      if (!answer) return;

      if (q.type === 'standard' && answer.type === 'standard') {
        totalAnswered++;
        if (q.correctAnswerIndex === answer.selectedIndex) {
          totalCorrect++;
        }
      } else if (q.type === 'matching' && answer.type === 'matching' && answer.checked) {
        totalAnswered++;
        const allCorrect = q.pairs.every((_, pairIdx) => answer.matches[pairIdx] === pairIdx);
        if (allCorrect) {
          totalCorrect++;
        }
      }
    });

    const percentage = quiz.questions.length > 0 ? (totalCorrect / quiz.questions.length) * 100 : 0;
    return { score: totalCorrect, answeredQuestions: totalAnswered, scorePercentage: percentage };
  }, [userAnswers, quiz]);

  const allAnswered = !!(quiz && answeredQuestions === quiz.questions.length);

  const getFeedbackMessage = () => {
    if (scorePercentage >= 80) return "Excellent work! You've mastered this material!";
    if (scorePercentage >= 60) return "Good effort! Practice key areas to sharpen your score.";
    return "Keep reinforcing! Active practice will strengthen your recall.";
  };

  const [prevAllAnswered, setPrevAllAnswered] = useState(allAnswered);
  if (prevAllAnswered !== allAnswered) {
    setPrevAllAnswered(allAnswered);
    if (allAnswered) setCurrentQuote(getRandomQuote());
  }

  return (
    <div className="w-full space-y-8">
      {!quiz ? (
        <QuizSetup
          lectureText={lectureText}
          onLectureTextChange={setLectureText}
          numQuestions={numQuestions}
          onNumQuestionsChange={setNumQuestions}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          questionType={questionType}
          onQuestionTypeChange={setQuestionType}
          isLoading={isLoading}
          fileName={fileName}
          currentQuote={currentQuote}
          elapsedSec={elapsedSec}
          onFileSelected={handleFileSelected}
          onGenerate={handleGenerateQuiz}
          turnstileSiteKey={TURNSTILE_SITE_KEY}
          onTurnstileToken={setTurnstileToken}
        />
      ) : (
        <QuizRunner
          quiz={quiz}
          userAnswers={userAnswers}
          questionTypeLabel={questionType.replaceAll('_', ' ')}
          difficulty={difficulty}
          isSummaryLoading={isSummaryLoading}
          showSummary={showSummary}
          onSummaryClick={handleSummaryClick}
          onOpenSettings={handleRegenerateQuiz}
          onStandardAnswer={handleStandardAnswer}
          onMatchingUpdate={handleMatchingUpdate}
          score={score}
          scorePercentage={scorePercentage}
          allAnswered={allAnswered}
          feedbackMessage={getFeedbackMessage()}
          currentQuote={currentQuote}
          onRegenerate={handleRegenerateQuiz}
          onStartOver={handleStartOver}
          headerRef={quizHeaderRef}
        />
      )}
    </div>
  );
}
