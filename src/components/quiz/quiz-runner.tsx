'use client';

// src/components/quiz/quiz-runner.tsx
import React from 'react';
import type { Quiz } from '@/types/quiz';
import type { MatchingAnswer, QuizAnswer, StandardAnswer } from '@/components/quiz/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Sparkles, RotateCcw } from 'lucide-react';
import { StandardQuestionCard } from '@/components/quiz/standard-question-card';
import { MatchingQuestionCard } from '@/components/quiz/matching-question-card';
import { ScoreCard } from '@/components/quiz/score-card';

interface QuizRunnerProps {
  quiz: Quiz;
  userAnswers: Record<number, QuizAnswer>;
  questionTypeLabel: string;
  difficulty: string;
  isSummaryLoading: boolean;
  showSummary: boolean;
  onSummaryClick: () => void;
  onOpenSettings: () => void;
  onStandardAnswer: (questionIndex: number, optionIndex: number) => void;
  onMatchingUpdate: (questionIndex: number, answer: MatchingAnswer) => void;
  score: number;
  scorePercentage: number;
  allAnswered: boolean;
  feedbackMessage: string;
  currentQuote: string;
  onRegenerate: () => void;
  onStartOver: () => void;
  headerRef: React.RefObject<HTMLHeadingElement>;
}

export function QuizRunner({
  quiz,
  userAnswers,
  questionTypeLabel,
  difficulty,
  isSummaryLoading,
  showSummary,
  onSummaryClick,
  onOpenSettings,
  onStandardAnswer,
  onMatchingUpdate,
  score,
  scorePercentage,
  allAnswered,
  feedbackMessage,
  currentQuote,
  onRegenerate,
  onStartOver,
  headerRef,
}: QuizRunnerProps) {
  return (
    <div className="space-y-8">

      {/* Header Info Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/80 bg-card">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Quiz Active
          </div>
          <h2 ref={headerRef} tabIndex={-1} className="text-lg font-bold text-foreground mt-0.5 outline-none">
            {quiz.questions.length} {questionTypeLabel} Questions ({difficulty})
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onSummaryClick}
            disabled={isSummaryLoading}
            className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
          >
            {isSummaryLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Summarizing...
              </>
            ) : (
              <>
                <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" />
                {quiz.summary ? (showSummary ? 'Hide Summary' : 'Show Summary') : 'Generate Summary'}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
        </div>
      </div>

      {/* AI Summary Container if generated */}
      <div aria-live="polite">
        {quiz.summary && showSummary && (
          <Card className="surface-card border-primary/30 bg-primary/5 p-6 animate-in fade-in duration-300">
            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold tracking-wide uppercase text-primary flex items-center gap-2">
                <FileText className="h-4 w-4" /> AI Study Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm leading-relaxed text-foreground whitespace-pre-line">
              {quiz.summary}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Questions Array */}
      <div className="space-y-6">
        {quiz.questions.map((q, index) => {
          if (q.type === 'matching') {
            return (
              <MatchingQuestionCard
                key={index}
                question={q}
                questionIndex={index}
                userAnswer={userAnswers[index] as MatchingAnswer}
                onUpdate={(answer) => onMatchingUpdate(index, answer)}
              />
            );
          }
          return (
            <StandardQuestionCard
              key={index}
              question={q}
              questionIndex={index}
              userAnswer={userAnswers[index] as StandardAnswer}
              onAnswer={onStandardAnswer}
            />
          );
        })}
      </div>

      {/* Scorecard Container (Appears when complete) */}
      {allAnswered && (
        <ScoreCard
          score={score}
          totalQuestions={quiz.questions.length}
          scorePercentage={scorePercentage}
          feedbackMessage={feedbackMessage}
          currentQuote={currentQuote}
          onRegenerate={onRegenerate}
          onStartOver={onStartOver}
        />
      )}

    </div>
  );
}
