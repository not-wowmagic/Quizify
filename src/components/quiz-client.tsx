'use client';

// src/components/quiz-client.tsx
// Orchestrator for the quiz flow. Presentation lives in src/components/quiz/*.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Quiz } from '@/types/quiz';
import { createQuiz, createSummary, publishQuiz, saveAttempt } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { processQuiz, quizHelpers } from '@/lib/quiz-processors';
import { getDeviceId } from '@/lib/device-id';
import { buildAnkiTxt, buildQuizCsv, downloadTextFile, printQuiz } from '@/lib/quiz-export';
import { QuizSetup } from '@/components/quiz/quiz-setup';
import { QuizRunner, type ExportFormat } from '@/components/quiz/quiz-runner';
import type { AttemptAnswer } from '@/types/history';
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
  /** Quiz handed in from the History panel for a retake. */
  retakeQuiz?: Quiz | null;
  /** Called once the retake quiz has been consumed. */
  onRetakeHandled?: () => void;
}

export function QuizClient({ onQuizStateChange, retakeQuiz, onRetakeHandled }: QuizClientProps = {}) {
  // Core quiz state
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, QuizAnswer>>({});

  // Input state with validation
  const [lectureText, setLectureText] = useState('');
  const [numQuestions, setNumQuestions] = useState<number | ''>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionType, setQuestionType] = useState<QuestionTypeId>('multiple_choice');
  const [language, setLanguage] = useState('English');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState('');
  const [fileName, setFileName] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Refs
  const quizHeaderRef = useRef<HTMLHeadingElement>(null);
  // Raw (unshuffled) questions from the server — used for sharing and history
  const rawQuizRef = useRef<Pick<Quiz, 'questions'> | null>(null);
  // Guards: record an attempt exactly once per quiz completion
  const attemptSavedRef = useRef(false);
  const quizStartedAtRef = useRef<number | null>(null);
  const [isSharing, setIsSharing] = useState(false);

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
        language,
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

      rawQuizRef.current = result;
      attemptSavedRef.current = false;
      quizStartedAtRef.current = Date.now();
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
    rawQuizRef.current = null;
    attemptSavedRef.current = false;
    quizStartedAtRef.current = null;
  };

  const handleRegenerateQuiz = () => {
    setQuiz(null);
    setUserAnswers({});
    setShowSummary(false);
    setCurrentQuote(getRandomQuote());
    attemptSavedRef.current = false;
    quizStartedAtRef.current = null;
  };

  // =========================================
  // Retake from history panel
  // =========================================

  useEffect(() => {
    if (!retakeQuiz) return;
    rawQuizRef.current = { questions: retakeQuiz.questions };
    attemptSavedRef.current = false;
    quizStartedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Rehydrating the runner from the History panel's retake request
    setQuiz(processQuiz({ questions: retakeQuiz.questions }));
    setUserAnswers({});
    setShowSummary(false);
    setCurrentQuote(getRandomQuote());
    onRetakeHandled?.();
  }, [retakeQuiz, onRetakeHandled]);

  // =========================================
  // Export (Anki / CSV / Print)
  // =========================================

  const handleExport = (format: ExportFormat) => {
    if (!quiz) return;

    if (format === 'print') {
      printQuiz(quiz, fileName || 'Quizify Study Sheet');
      return;
    }

    if (format === 'csv') {
      downloadTextFile('quizify-quiz.csv', buildQuizCsv(quiz), 'text/csv');
      return;
    }

    downloadTextFile('quizify-anki.txt', buildAnkiTxt(quiz));
    toast({ title: 'Exported', description: 'Anki deck downloaded — import it in Anki (File ▸ Import).' });
  };

  // =========================================
  // Share (publish to Supabase, copy link)
  // =========================================

  const handleShare = async () => {
    if (!quiz) return;
    setIsSharing(true);
    try {
      const raw = rawQuizRef.current;
      const result = await publishQuiz({
        questions: raw?.questions ?? quiz.questions,
        summary: quiz.summary,
        title: fileName || undefined,
        difficulty,
        questionType,
        language,
        turnstileToken: turnstileToken ?? undefined,
      });

      if ('error' in result) {
        toast({ title: 'Share Failed', description: result.error, variant: 'destructive' });
        return;
      }

      const url = `${window.location.origin}${result.url}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link Copied', description: `${url}` });
      } catch {
        toast({ title: 'Share Link Ready', description: `Copy this link to share: ${url}` });
      }
    } catch {
      toast({ title: 'Share Failed', description: 'Could not publish the quiz. Please try again.', variant: 'destructive' });
    } finally {
      setIsSharing(false);
    }
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

  // =========================================
  // History: save the attempt once on completion
  // =========================================

  useEffect(() => {
    if (!allAnswered || !quiz || attemptSavedRef.current) return;
    attemptSavedRef.current = true;

    const answers: AttemptAnswer[] = quiz.questions.map((q, qIndex) => {
      const answer = userAnswers[qIndex];
      if (!answer) return null;

      if (q.type === 'standard' && answer.type === 'standard') {
        const entry: AttemptAnswer = {
          index: qIndex,
          type: 'standard',
          correct: q.correctAnswerIndex === answer.selectedIndex,
        };
        if (q.topic) entry.topic = q.topic;
        return entry;
      }
      if (q.type === 'matching' && answer.type === 'matching' && answer.checked) {
        const correct = q.pairs.every((_, pairIdx) => answer.matches[pairIdx] === pairIdx);
        const entry: AttemptAnswer = { index: qIndex, type: 'matching', correct };
        if (q.topic) entry.topic = q.topic;
        return entry;
      }
      return null;
    }).filter((a): a is AttemptAnswer => a !== null);

    const title = fileName || `Quiz • ${new Date().toLocaleDateString()}`;
    const durationSec = quizStartedAtRef.current
      ? Math.round((Date.now() - quizStartedAtRef.current) / 1000)
      : 0;

    void saveAttempt({
      deviceId: getDeviceId(),
      title,
      score,
      total: quiz.questions.length,
      questions: rawQuizRef.current?.questions ?? quiz.questions,
      answers,
      difficulty,
      questionType,
      language,
      durationSec,
    }).then(result => {
      if ('error' in result) {
        console.warn('[quiz-client] Failed to save attempt:', result.error);
      }
    });
  }, [allAnswered, quiz, userAnswers, score, difficulty, questionType, language, fileName]);

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
          language={language}
          onLanguageChange={setLanguage}
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
          language={language}
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
          onExport={handleExport}
          onShare={handleShare}
          isSharing={isSharing}
        />
      )}
    </div>
  );
}
