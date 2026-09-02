'use client';

// src/components/quiz-client.tsx
// Orchestrator for the quiz flow. Presentation lives in src/components/quiz/*.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Quiz } from '@/types/quiz';
import { createQuiz, createSummary, publishQuiz, saveAttempt, type CreateQuizInput } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { processQuiz, quizHelpers } from '@/lib/quiz-processors';
import { normalizeQuizTitle } from '@/lib/quiz-title';
import { splitQuestionCount } from '@/lib/quiz-batching';
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

type QuizGenerationResult = Awaited<ReturnType<typeof createQuiz>>;
const HIGH_COUNT_BATCH_CONCURRENCY = 3;

async function createQuizBatch(input: CreateQuizInput): Promise<QuizGenerationResult> {
  try {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    // SAFETY: the same-origin route returns the createQuiz result union.
    const result = await response.json() as QuizGenerationResult;
    return response.ok ? result : ('error' in result ? result : { error: 'Failed to generate the quiz. Please try again.' });
  } catch {
    return { error: 'Failed to generate the quiz. Please try again.' };
  }
}

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
  // Original title when running a "Practice Missed Questions" session
  const practiceTitleRef = useRef<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  // Share URL once a quiz is published, driving the QR share card
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [publicVisibility, setPublicVisibility] = useState(false);

  const { toast } = useToast();

  // Quote is picked after mount so SSR and first client render match
  useEffect(() => {
    // ponytail: hydration guard because a random value can't be computed during render
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
      setIsLoading(false);
    }
  };

  /** Shared generation core that validates nothing and uses current inputs as-is. */
  const runQuizGeneration = async () => {
    try {
      setIsLoading(true);
      setCurrentQuote(getRandomQuote());
      setQuiz(null);
      setUserAnswers({});

      const requestedQuestionCount = Number(numQuestions) || 10;
      const request: CreateQuizInput = {
        lectureText,
        numQuestions: requestedQuestionCount,
        difficulty,
        questionType,
        language,
        turnstileToken: turnstileToken ?? undefined,
        bypassCache: incognito,
        fallbackTitle: fileName || undefined,
        fallbackWebTitle: sourceTitle || undefined,
      };

      // Netlify can time out one large server action even when the provider
      // calls themselves are bounded. Split 21-50 question requests into
      // independent 10-question actions and merge their validated results.
      const batchCounts = requestedQuestionCount > 20
        ? splitQuestionCount(requestedQuestionCount)
        : [requestedQuestionCount];
      const batchResults: QuizGenerationResult[] = [];
      for (let index = 0; index < batchCounts.length; index += HIGH_COUNT_BATCH_CONCURRENCY) {
        const wave = await Promise.all(
          batchCounts.slice(index, index + HIGH_COUNT_BATCH_CONCURRENCY).map(batchCount => requestedQuestionCount > 20
            ? createQuizBatch({ ...request, numQuestions: batchCount })
            : createQuiz({ ...request, numQuestions: batchCount })),
        );
        batchResults.push(...wave);
      }
      const successfulResults = batchResults.filter(
        (batch): batch is Pick<Quiz, 'questions' | 'title'> => !('error' in batch),
      );

      if (successfulResults.length === 0) {
        const failure = batchResults.find((batch): batch is { error: string } => 'error' in batch);
        toast({
          title: 'Error Generating Quiz',
          description: failure?.error ?? 'The AI could not generate a quiz from the provided text. Please try refining your text.',
          variant: 'destructive',
        });
        return;
      }

      const result = {
        title: successfulResults[0].title,
        questions: successfulResults.flatMap(batch => batch.questions).slice(0, requestedQuestionCount),
      };

      rawQuizRef.current = result;
      attemptSavedRef.current = false;
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
      setQuiz(processedQuiz);

      trackQuizGenerated({
        questionCount: requestedQuestionCount,
        difficulty,
        format: questionType,
        language,
      });
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

    await runQuizGeneration();
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
    await runQuizGeneration();
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
    setSourceTitle('');
    setShowSummary(false);
    rawQuizRef.current = null;
    attemptSavedRef.current = false;
    practiceTitleRef.current = null;
    setSharedUrl(null);
    setPublicVisibility(false);
    quizStartedAtRef.current = null;
  };

  /** Returns to the setup screen with the current input/settings preserved. */
  const handleOpenSettings = () => {
    setQuiz(null);
    setUserAnswers({});
    setShowSummary(false);
    setCurrentQuote(getRandomQuote());
    attemptSavedRef.current = false;
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
    practiceTitleRef.current = null;
    quizStartedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Rehydrating the runner from the History panel's retake request
    setQuiz(processQuiz({ questions: retakeQuiz.questions, title: retakeQuiz.title }));
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
    // Incognito mode: zero database footprint, so never persist the attempt.
    if (incognito) return;

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
      }
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
    quizStartedAtRef.current = Date.now();
    setQuiz(processQuiz({ questions: missedQuestions, title: quiz.title }));
    setUserAnswers({});
    setShowSummary(false);
    setCurrentQuote(getRandomQuote());

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
          fileName={fileName}
          onSourceTitleChange={setSourceTitle}
          currentQuote={currentQuote}
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
          currentQuote={currentQuote}
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
        />
      )}
    </div>
  );
}
