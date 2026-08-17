'use client';

// src/components/quiz/quiz-runner.tsx
import React from 'react';
import type { Quiz } from '@/types/quiz';
import type { MatchingAnswer, QuizAnswer } from '@/components/quiz/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, FileText, Sparkles, RotateCcw, Share2, Download, Link2 } from 'lucide-react';
import { StandardQuestionCard } from '@/components/quiz/standard-question-card';
import { MatchingQuestionCard } from '@/components/quiz/matching-question-card';
import { ScoreCard } from '@/components/quiz/score-card';

export type ExportFormat = 'anki' | 'csv' | 'print' | 'cram';

interface QuizRunnerProps {
  quiz: Quiz;
  userAnswers: Record<number, QuizAnswer>;
  questionTypeLabel: string;
  difficulty: string;
  language?: string;
  isSummaryLoading: boolean;
  showSummary: boolean;
  onSummaryClick?: () => void;
  onOpenSettings: () => void;
  settingsLabel?: string;
  regenerateLabel?: string;
  onStandardAnswer: (questionIndex: number, optionIndex: number) => void;
  onMatchingUpdate: (questionIndex: number, answer: MatchingAnswer) => void;
  score: number;
  scorePercentage: number;
  allAnswered: boolean;
  feedbackMessage: string;
  currentQuote: string;
  onRegenerate: () => void;
  onStartOver: () => void;
  headerRef: React.RefObject<HTMLHeadingElement | null>;
  onExport?: (format: ExportFormat) => void;
  onShare?: () => void;
  isSharing?: boolean;
  /** Incorrect answers count; enables the "Practice Missed" action on the score card. */
  missedCount?: number;
  onPracticeMissed?: () => void;
  /** Adaptive mastery score (weighted by difficulty tier), shown when adaptive. */
  masteryPercentage?: number;
}

export function QuizRunner({
  quiz,
  userAnswers,
  questionTypeLabel,
  difficulty,
  language,
  isSummaryLoading,
  showSummary,
  onSummaryClick,
  onOpenSettings,
  settingsLabel = 'Settings',
  regenerateLabel,
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
  onExport,
  onShare,
  isSharing,
  missedCount = 0,
  onPracticeMissed,
  masteryPercentage,
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
            {language ? ` · ${language}` : ''}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onExport('anki')}>
                  <Link2 className="mr-2 h-4 w-4" /> Anki (.txt)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('csv')}>
                  <FileText className="mr-2 h-4 w-4" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('print')}>
                  <FileText className="mr-2 h-4 w-4" /> Print / PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('cram')}>
                  <FileText className="mr-2 h-4 w-4" /> Study Cram Sheet
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {onShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              disabled={isSharing}
              className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
            >
              {isSharing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Share2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Share
            </Button>
          )}

          {onSummaryClick && (
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
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {settingsLabel}
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
          const answer = userAnswers[index];
          if (q.type === 'matching') {
            return (
              <MatchingQuestionCard
                key={index}
                question={q}
                questionIndex={index}
                userAnswer={answer?.type === 'matching' ? answer : undefined}
                onUpdate={(next) => onMatchingUpdate(index, next)}
              />
            );
          }
          return (
            <StandardQuestionCard
              key={index}
              question={q}
              questionIndex={index}
              userAnswer={answer?.type === 'standard' ? answer : undefined}
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
          missedCount={missedCount}
          onPracticeMissed={onPracticeMissed}
          masteryPercentage={masteryPercentage}
          onRegenerate={onRegenerate}
          regenerateLabel={regenerateLabel}
          onStartOver={onStartOver}
          onExport={onExport}
          onShare={onShare}
          isSharing={isSharing}
        />
      )}

    </div>
  );
}
