'use client';
/* oxlint-disable */

// src/components/quiz-client.tsx
// Orchestrator for the quiz flow. Presentation lives in src/components/quiz/*.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Quiz } from '@/types/quiz';
import { createQuiz, createSummary, publishQuiz, saveAttempt } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { processQuiz, quizHelpers } from '@/lib/quiz-processors';
import { normalizeQuizTitle } from '@/lib/quiz-title';
import { getDeviceId } from '@/lib/device-id';
import { buildAnkiTxt, buildQuizCsv, downloadTextFile, printQuiz, printCramSheet } from '@/lib/quiz-export';
import {
  trackQuizGenerated,
  trackQuizCompleted,
  trackQuizShared,
  trackQuizExported,
  trackPracticeMissedStarted,
} from '@/lib/analytics';
import { QuizSetup } from '@/components/quiz/quiz-setup';
import { QuizRunner, type ExportFormat } from '@/components/quiz/quiz-runner';
import { ShareQrCard } from '@/components/quiz/share-qr';
import type { AttemptAnswer } from '@/types/history';
import type { Difficulty, MatchingAnswer, QuestionTypeId, QuizAnswer } from '@/components/quiz/types';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SESSION_STORAGE_KEY = 'quizify_session_v1';
const SESSION_VERSION = 1;

interface PersistedQuizSession {
  version: typeof SESSION_VERSION;
  savedAt: number;
  lectureText: string;
  fileName: string;
  sourceTitle: string;
  numQuestions: number | '';
  difficulty: Difficulty;
  questionType: QuestionTypeId;
  language: string;
  quiz: Quiz | null;
  rawQuiz: Pick<Quiz, 'questions' | 'title'> | null;
  userAnswers: Record<number, QuizAnswer>;
  showSummary: boolean;
  publicVisibility: boolean;
  attemptSaved: boolean;
  quizStartedAt: number | null;
}

const isQuizData = (value: unknown): value is Quiz => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Quiz>;
  return Array.isArray(candidate.questions);
};

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
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Incognito: no history saved, server cache bypassed, sharing hidden
  const [incognito, setIncognito] = useState(false);

  // Refs
  const quizHeaderRef = useRef<HTMLHeadingElement>(null);
  // Raw (unshuffled) questions from the server, used for sharing and history
  const rawQuizRef = useRef<Pick<Quiz, 'questions' | 'title'> | null>(null);
  // Guards: record an attempt exactly once per quiz completion
  const attemptSavedRef = useRef(false);
  const quizStartedAtRef = useRef<number | null>(null);
  const generationRunRef = useRef(0);
  // Original title when running a "Practice Missed Questions" session
  const practiceTitleRef = useRef<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  // Share URL once a quiz is published, driving the QR share card
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [publicVisibility, setPublicVisibility] = useState(false);
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const [attemptSaved, setAttemptSaved] = useState(false);
  const attemptSaveInFlightRef = useRef(false);

  const isLoading = isParsing || isGenerating;

  const { toast } = useToast();

  // Restore the last local session after hydration. The versioned envelope
  // makes future state-shape changes safe to roll out without breaking start-up.
  useEffect(() => {
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!stored) {
          setIsSessionRestored(true);
          return;
        }
        const session = JSON.parse(stored) as Partial<PersistedQuizSession>;
        if (session.version !== SESSION_VERSION) {
          setIsSessionRestored(true);
          return;
        }

        if (typeof session.lectureText === 'string') setLectureText(session.lectureText);
        if (typeof session.fileName === 'string') setFileName(session.fileName);
        if (typeof session.sourceTitle === 'string') setSourceTitle(session.sourceTitle);
        if (typeof session.numQuestions === 'number' || session.numQuestions === '') setNumQuestions(session.numQuestions);
        if (session.difficulty === 'easy' || session.difficulty === 'medium' || session.difficulty === 'hard' || session.difficulty === 'adaptive') {
          setDifficulty(session.difficulty);
        }
        if (session.questionType === 'multiple_choice' || session.questionType === 'true_false' || session.questionType === 'fill_in_the_blank' || session.questionType === 'matching' || session.questionType === 'situational' || session.questionType === 'mixed') {
          setQuestionType(session.questionType);
        }
        if (typeof session.language === 'string') setLanguage(session.language);

        if (isQuizData(session.quiz)) {
          setQuiz(session.quiz);
          rawQuizRef.current = isQuizData(session.rawQuiz) ? session.rawQuiz : session.quiz;
          setUserAnswers(session.userAnswers ?? {});
          setShowSummary(session.showSummary === true);
          setPublicVisibility(session.publicVisibility === true);
          attemptSavedRef.current = session.attemptSaved === true;
          setAttemptSaved(session.attemptSaved === true);
          quizStartedAtRef.current = typeof session.quizStartedAt === 'number' ? session.quizStartedAt : null;
        }
      } catch (error) {
        console.warn('[quiz-client] Could not restore saved session:', error);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        setIsSessionRestored(true);
      }
    };

    const timeout = window.setTimeout(restore, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  // Keep setup drafts and active answers available across refreshes. Incognito
  // sessions intentionally leave no local trace, just like they leave no history.
  useEffect(() => {
    if (!isSessionRestored) return;
    if (incognito) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    const session: PersistedQuizSession = {
      version: SESSION_VERSION,
      savedAt: Date.now(),
      lectureText,
      fileName,
      sourceTitle,
      numQuestions,
      difficulty,
      questionType,
      language,
      quiz,
      rawQuiz: rawQuizRef.current,
      userAnswers,
      showSummary,
      publicVisibility,
      attemptSaved,
      quizStartedAt: quizStartedAtRef.current,
    };

    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch (error) {
        console.warn('[quiz-client] Could not save session:', error);
      }
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [attemptSaved, difficulty, fileName, incognito, isSessionRestored, language, lectureText, numQuestions, publicVisibility, questionType, quiz, showSummary, sourceTitle, userAnswers]);

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
    setIsParsing(true);
    setGenerationError(null);
    setFileName(file.name);
    setSourceTitle(file.name);
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
      setIsParsing(false);
    }
  };

  /** Shared generation core that validates nothing and uses current inputs as-is. */
  const runQuizGeneration = async (preserveCurrentQuiz = false) => {
    const runId = ++generationRunRef.current;
    setIsGenerating(true);
    setGenerationError(null);

    try {
      if (!preserveCurrentQuiz) {
        setQuiz(null);
        setUserAnswers({});
      }

      const result = await createQuiz({
        lectureText,
        numQuestions: Number(numQuestions) || 10,
        difficulty,
        questionType,
        language,
        turnstileToken: turnstileToken ?? undefined,
        bypassCache: incognito,
        fallbackTitle: fileName || undefined,
        fallbackWebTitle: sourceTitle || undefined,
      });

      if (runId !== generationRunRef.current) return;

      if ('error' in result) {
        setGenerationError(result.error);
        toast({
          title: 'Error Generating Quiz',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      rawQuizRef.current = result;
      attemptSavedRef.current = false;
      setAttemptSaved(false);
      practiceTitleRef.current = null;
      setPublicVisibility(false);
      quizStartedAtRef.current = Date.now();
      const processedQuiz = processQuiz(result);
      if (difficulty === 'adaptive') {
        // Adaptive v1: warm-up ramp (easy questions first, then medium, then hard).
        const tierRank = (q: Quiz['questions'][number]): number =>
          q.difficultyTier === 'easy' ? 0 : q.difficultyTier === 'hard' ? 2 : 1;
        processedQuiz.questions.sort((a, b) => tierRank(a) - tierRank(b));
      }
      setUserAnswers({});
      setQuiz(processedQuiz);

      trackQuizGenerated({
        questionCount: Number(numQuestions) || 10,
        difficulty,
        format: questionType,
        language,
      });
    } catch (error) {
      if (runId !== generationRunRef.current) return;
      const message = error instanceof Error ? error.message : 'Failed to generate quiz. Please try again.';
      setGenerationError(message);
      toast({
        title: 'Unexpected Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (runId === generationRunRef.current) setIsGenerating(false);
    }
  };

  const handleCancelGeneration = () => {
    if (!isGenerating) return;
    generationRunRef.current += 1;
    setIsGenerating(false);
    setGenerationError(quiz ? 'Generation cancelled. Your current quiz is still available.' : 'Generation cancelled.');
  };

  const handleRetryGeneration = () => {
    void runQuizGeneration(!!quiz);
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

    await runQuizGeneration(false);
  };

  /** Regenerates a fresh quiz from the SAME material and settings. */
  const handleRegenerateQuiz = async () => {
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast({
        title: 'Verification Required',
        description: 'Please complete the bot check before generating a quiz.',
        variant: 'destructive',
      });
      return;
    }
    setShowSummary(false);
    await runQuizGeneration(true);
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
    generationRunRef.current += 1;
    setIsGenerating(false);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setQuiz(null);
    setUserAnswers({});
    setNumQuestions(10);
    setDifficulty('medium');
    setQuestionType('multiple_choice');
    setLectureText('');
    setFileName('');
    setSourceTitle('');
    setShowSummary(false);
    rawQuizRef.current = null;
    attemptSavedRef.current = false;
    setAttemptSaved(false);
    setGenerationError(null);
    practiceTitleRef.current = null;
    setSharedUrl(null);
    setPublicVisibility(false);
    quizStartedAtRef.current = null;
  };

  /** Returns to the setup screen with the current input/settings preserved. */
  const handleOpenSettings = () => {
    generationRunRef.current += 1;
    setIsGenerating(false);
    setQuiz(null);
    setUserAnswers({});
    setShowSummary(false);
    attemptSavedRef.current = false;
    setAttemptSaved(false);
    setGenerationError(null);
    practiceTitleRef.current = null;
    setSharedUrl(null);
    quizStartedAtRef.current = null;
  };

  // =========================================
  // Retake from history panel
  // =========================================

  useEffect(() => {
    if (!retakeQuiz) return;
    rawQuizRef.current = { questions: retakeQuiz.questions, title: retakeQuiz.title };
    attemptSavedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Retake starts a new unsaved attempt
    setAttemptSaved(false);
    practiceTitleRef.current = null;
    quizStartedAtRef.current = Date.now();
    setQuiz(processQuiz({ questions: retakeQuiz.questions, title: retakeQuiz.title }));
    setUserAnswers({});
    setShowSummary(false);
    onRetakeHandled?.();
  }, [retakeQuiz, onRetakeHandled]);

  // =========================================
  // Export (Anki / CSV / Print)
  // =========================================

  const handleExport = (format: ExportFormat) => {
    if (!quiz) return;
    trackQuizExported(format);

    if (format === 'print') {
      printQuiz(quiz, normalizeQuizTitle(quiz.title, 'Quizify Study Sheet'));
      return;
    }

    if (format === 'cram') {
      printCramSheet(quiz, normalizeQuizTitle(quiz.title, 'Quizify Study Sheet'));
      return;
    }

    if (format === 'csv') {
      downloadTextFile('quizify-quiz.csv', buildQuizCsv(quiz), 'text/csv');
      return;
    }

    downloadTextFile('quizify-anki.txt', buildAnkiTxt(quiz));
    toast({ title: 'Exported', description: 'Anki deck downloaded. Import it in Anki (File ▸ Import).' });
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
        title: quiz.title,
        difficulty,
        questionType,
        language,
        visibility: publicVisibility ? 'public' : 'unlisted',
        turnstileToken: turnstileToken ?? undefined,
      });

      if ('error' in result) {
        toast({ title: 'Share Failed', description: result.error, variant: 'destructive' });
        return;
      }

      const url = `${window.location.origin}${result.url}`;
      trackQuizShared(result.slug);
      setSharedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // The QR share card remains available with its own copy action.
      }
    } catch {
      toast({ title: 'Share Failed', description: 'Could not publish the quiz. Please try again.', variant: 'destructive' });
    } finally {
      setIsSharing(false);
    }
  };

  const handleTitleChange = (nextTitle: string) => {
    const currentTitle = normalizeQuizTitle(quiz?.title);
    const title = normalizeQuizTitle(nextTitle, currentTitle);
    setQuiz(prev => prev ? { ...prev, title } : prev);
    if (rawQuizRef.current) {
      rawQuizRef.current = { ...rawQuizRef.current, title };
    }
  };

  const { score, answeredQuestions, scorePercentage, missedIndices, masteryPercentage } = useMemo(() => {
    if (!quiz) {
      // SAFETY: the empty array literal is already number[], so no runtime
      // narrowing or assumption is introduced by this cast.
      return { score: 0, answeredQuestions: 0, scorePercentage: 0, missedIndices: [] as number[], masteryPercentage: 0 };
    }

    let totalCorrect = 0;
    let totalAnswered = 0;
    let weightedCorrect = 0;
    let weightedTotal = 0;
    const missed: number[] = [];

    // Adaptive weighting: hard ×3, medium ×2, easy/unknown ×1
    const tierWeight = (tier?: 'easy' | 'medium' | 'hard'): number =>
      tier === 'hard' ? 3 : tier === 'medium' ? 2 : 1;

    quiz.questions.forEach((q, qIndex) => {
      const weight = tierWeight(q.difficultyTier);
      weightedTotal += weight;
      const answer = userAnswers[qIndex];
      if (!answer) {
        missed.push(qIndex);
        return;
      }

      if (q.type === 'standard' && answer.type === 'standard') {
        totalAnswered++;
        if (q.correctAnswerIndex === answer.selectedIndex) {
          totalCorrect++;
          weightedCorrect += weight;
        } else {
          missed.push(qIndex);
        }
      } else if (q.type === 'matching' && answer.type === 'matching' && answer.checked) {
        totalAnswered++;
        const allCorrect = q.pairs.every((_, pairIdx) => answer.matches[pairIdx] === pairIdx);
        if (allCorrect) {
          totalCorrect++;
          weightedCorrect += weight;
        } else {
          missed.push(qIndex);
        }
      }
    });

    const percentage = quiz.questions.length > 0 ? (totalCorrect / quiz.questions.length) * 100 : 0;
    const mastery = weightedTotal > 0 ? (weightedCorrect / weightedTotal) * 100 : 0;
    return { score: totalCorrect, answeredQuestions: totalAnswered, scorePercentage: percentage, missedIndices: missed, masteryPercentage: mastery };
  }, [userAnswers, quiz]);

  const allAnswered = !!(quiz && answeredQuestions === quiz.questions.length);

  const getFeedbackMessage = () => {
    if (scorePercentage >= 80) return "Excellent work! You've mastered this material!";
    if (scorePercentage >= 60) return "Good effort! Practice key areas to sharpen your score.";
    return "Keep reinforcing! Active practice will strengthen your recall.";
  };

  // =========================================
  // History: save the attempt once on completion
  // =========================================

  useEffect(() => {
    if (!allAnswered || !quiz || attemptSavedRef.current || attemptSaveInFlightRef.current) return;
    if (incognito) {
      attemptSavedRef.current = true;
      setAttemptSaved(true);
      return;
    }
    attemptSaveInFlightRef.current = true;

    const durationSec = quizStartedAtRef.current
      ? Math.round((Date.now() - quizStartedAtRef.current) / 1000)
      : 0;

    trackQuizCompleted({
      score,
      total: quiz.questions.length,
      percentage: scorePercentage,
      durationSec,
    });

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

    const title = practiceTitleRef.current
      ? `Practice: ${practiceTitleRef.current} (${quiz.questions.length} missed)`
      : normalizeQuizTitle(quiz.title, 'Study Quiz');

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
      quizId: null,
      durationSec,
    }).then(result => {
      if ('error' in result) {
        console.warn('[quiz-client] Failed to save attempt:', result.error);
        return;
      }
      attemptSavedRef.current = true;
      setAttemptSaved(true);
    }).finally(() => {
      attemptSaveInFlightRef.current = false;
    });
  }, [allAnswered, quiz, userAnswers, score, scorePercentage, difficulty, questionType, language, fileName, incognito]);

  // =========================================
  // Practice missed questions (spaced repetition)
  // =========================================

  const handlePracticeMissed = () => {
    if (!quiz || missedIndices.length === 0) return;

    // missedIndices are positions in the PROCESSED quiz the user just saw
    // (processQuiz shuffles question order), so select from that array rather
    // than the raw one — mapping shuffled indices onto the raw array picked
    // the wrong questions whenever the shuffle reordered them.
    const missedQuestions = missedIndices
      .map(i => quiz.questions[i])
      .filter((q): q is NonNullable<(typeof quiz.questions)[number]> => q !== undefined);
    if (missedQuestions.length === 0) return;

    // Store the BASE title (never a nested "Practice: ..." prefix); the
    // prefix is applied when the attempt is saved (see saveAttempt effect).
    practiceTitleRef.current = practiceTitleRef.current || normalizeQuizTitle(quiz.title);
    rawQuizRef.current = { questions: missedQuestions, title: quiz.title };
    attemptSavedRef.current = false;
    setAttemptSaved(false);
    quizStartedAtRef.current = Date.now();
    setQuiz(processQuiz({ questions: missedQuestions, title: quiz.title }));
    setUserAnswers({});
    setShowSummary(false);

    trackPracticeMissedStarted(missedQuestions.length);
  };

  return (
    <div className="w-full space-y-8">
      {sharedUrl && <ShareQrCard url={sharedUrl} onClose={() => setSharedUrl(null)} />}
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
          isParsing={isParsing}
          isGenerating={isGenerating}
          generationError={generationError}
          onCancelGeneration={handleCancelGeneration}
          onRetryGeneration={handleRetryGeneration}
          fileName={fileName}
          onSourceTitleChange={setSourceTitle}
          elapsedSec={elapsedSec}
          onFileSelected={handleFileSelected}
          onGenerate={handleGenerateQuiz}
          turnstileSiteKey={TURNSTILE_SITE_KEY}
          onTurnstileToken={setTurnstileToken}
          incognito={incognito}
          onIncognitoChange={setIncognito}
        />
      ) : (
        <QuizRunner
          quiz={quiz}
          title={normalizeQuizTitle(quiz.title)}
          onTitleChange={handleTitleChange}
          userAnswers={userAnswers}
          questionTypeLabel={questionType.replaceAll('_', ' ')}
          difficulty={difficulty}
          language={language}
          isSummaryLoading={isSummaryLoading}
          showSummary={showSummary}
          onSummaryClick={handleSummaryClick}
          onOpenSettings={handleOpenSettings}
          onStandardAnswer={handleStandardAnswer}
          onMatchingUpdate={handleMatchingUpdate}
          score={score}
          scorePercentage={scorePercentage}
          allAnswered={allAnswered}
          feedbackMessage={getFeedbackMessage()}
          onRegenerate={handleRegenerateQuiz}
          onStartOver={handleStartOver}
          headerRef={quizHeaderRef}
          missedCount={missedIndices.length}
          onPracticeMissed={handlePracticeMissed}
          masteryPercentage={difficulty === 'adaptive' ? masteryPercentage : undefined}
          onExport={handleExport}
          onShare={incognito ? undefined : handleShare}
          publicVisibility={publicVisibility}
          onPublicVisibilityChange={setPublicVisibility}
          isSharing={isSharing}
          isGenerating={isGenerating}
          generationError={generationError}
          onCancelGeneration={handleCancelGeneration}
          onRetryGeneration={handleRetryGeneration}
        />
      )}
    </div>
  );
}




