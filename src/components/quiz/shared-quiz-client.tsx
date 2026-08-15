'use client';

// src/components/quiz/shared-quiz-client.tsx
// Renders a shared quiz (/q/<slug>) with a fresh shuffle per visitor.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Quiz } from '@/types/quiz';
import type { SharedQuizData } from '@/app/actions';
import { processQuiz } from '@/lib/quiz-processors';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Home } from 'lucide-react';
import type { MatchingAnswer, QuizAnswer } from '@/components/quiz/types';

const motivationalQuotes = [
  'Believe you can and you\'re halfway there.',
  'The secret of getting ahead is getting started.',
  'Don\'t watch the clock; do what it does. Keep going.',
  'The expert in anything was once a beginner.',
  'The only way to do great work is to love what you do.',
  'Success is not final, failure is not fatal: it is the courage to continue that counts.',
  'The future belongs to those who believe in the beauty of their dreams.',
  'Well done is better than well said.',
  'You are capable of more than you know.',
  'Push yourself, because no one else is going to do it for you.',
];

const getRandomQuote = () => motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

/** Applies the per-visitor shuffle and attaches any published summary. */
function buildQuiz(sharedQuiz: SharedQuizData): Quiz {
  const processed = processQuiz({ questions: sharedQuiz.questions });
  if (sharedQuiz.summary) {
    return { ...processed, summary: sharedQuiz.summary };
  }
  return processed;
}

export function SharedQuizClient({ quiz: sharedQuiz }: { quiz: SharedQuizData }) {
  const router = useRouter();
  const headerRef = useRef<HTMLHeadingElement>(null);

  // The shuffle in processQuiz uses Math.random(), which would produce
  // different DOM on the server vs. the client. So the quiz is only built
  // after mount: server and first client render show the identical skeleton.
  const [isMounted, setIsMounted] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, QuizAnswer>>({});
  const [currentQuote, setCurrentQuote] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mount flag gates the client-only shuffle below
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || quiz) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Building the shuffled quiz after hydration (see comment above)
    setQuiz(buildQuiz(sharedQuiz));
  }, [isMounted, quiz, sharedQuiz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Random quote is picked after mount so SSR and first client render match
    setCurrentQuote(getRandomQuote());
  }, []);

  useEffect(() => {
    headerRef.current?.focus();
  }, [quiz]);

  const handleSummaryClick = () => {
    if (quiz?.summary) {
      setShowSummary(prev => !prev);
    }
  };

  const reshuffle = () => {
    setQuiz(buildQuiz(sharedQuiz));
    setUserAnswers({});
    setShowSummary(false);
    setCurrentQuote(getRandomQuote());
  };

  const { score, answeredQuestions, scorePercentage } = useMemo(() => {
    let totalCorrect = 0;
    let totalAnswered = 0;

    quiz?.questions.forEach((q, qIndex) => {
      const answer = userAnswers[qIndex];
      if (!answer) return;

      if (q.type === 'standard' && answer.type === 'standard') {
        totalAnswered++;
        if (q.correctAnswerIndex === answer.selectedIndex) totalCorrect++;
      } else if (q.type === 'matching' && answer.type === 'matching' && answer.checked) {
        totalAnswered++;
        const allCorrect = q.pairs.every((_, pairIdx) => answer.matches[pairIdx] === pairIdx);
        if (allCorrect) totalCorrect++;
      }
    });

    const percentage = (quiz?.questions.length ?? 0) > 0 ? (totalCorrect / (quiz?.questions.length ?? 1)) * 100 : 0;
    return { score: totalCorrect, answeredQuestions: totalAnswered, scorePercentage: percentage };
  }, [userAnswers, quiz]);

  const allAnswered = !!(quiz && answeredQuestions === quiz.questions.length);

  const getFeedbackMessage = () => {
    if (scorePercentage >= 80) return "Excellent work! You've mastered this material!";
    if (scorePercentage >= 60) return 'Good effort! Practice key areas to sharpen your score.';
    return 'Keep reinforcing! Active practice will strengthen your recall.';
  };

  if (!quiz) {
    return (
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{sharedQuiz.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shared quiz · {sharedQuiz.difficulty ?? 'mixed'} difficulty
            {sharedQuiz.language ? ` · ${sharedQuiz.language}` : ''}
          </p>
        </div>
        <Card className="surface-card border-border/80 bg-card p-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground mt-3">Preparing your quiz…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{sharedQuiz.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shared quiz · {sharedQuiz.difficulty ?? 'mixed'} difficulty
            {sharedQuiz.language ? ` · ${sharedQuiz.language}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/')} className="h-9 px-3 border-border/80 text-xs font-medium">
          <Home className="mr-1.5 h-3.5 w-3.5" /> Back to Quizify
        </Button>
      </div>

      <QuizRunner
        quiz={quiz}
        userAnswers={userAnswers}
        questionTypeLabel={sharedQuiz.questionType?.replaceAll('_', ' ') ?? 'questions'}
        difficulty={sharedQuiz.difficulty ?? 'mixed'}
        isSummaryLoading={false}
        showSummary={showSummary}
        onSummaryClick={handleSummaryClick}
        onOpenSettings={reshuffle}
        onStandardAnswer={(questionIndex, optionIndex) =>
          setUserAnswers(prev => ({ ...prev, [questionIndex]: { type: 'standard', selectedIndex: optionIndex } }))}
        onMatchingUpdate={(questionIndex, answer: MatchingAnswer) =>
          setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }))}
        score={score}
        scorePercentage={scorePercentage}
        allAnswered={allAnswered}
        feedbackMessage={getFeedbackMessage()}
        currentQuote={currentQuote}
        onRegenerate={reshuffle}
        onStartOver={() => router.push('/')}
        headerRef={headerRef}
      />
    </div>
  );
}
