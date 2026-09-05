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
import { Loader2, FileText, Sparkles, RotateCcw, Share2, Download, Link2, Pencil, Check, X, Globe2, MoreHorizontal } from 'lucide-react';
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
  onRegenerate: () => void;
  onStartOver?: () => void;
  startOverHref?: string;
  headerRef: React.RefObject<HTMLHeadingElement | null>;
  onExport?: (format: ExportFormat) => void;
  onShare?: () => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  publicVisibility?: boolean;
  onPublicVisibilityChange?: (value: boolean) => void;
  isSharing?: boolean;
  isGenerating?: boolean;
  generationError?: string | null;
  onCancelGeneration?: () => void;
  onRetryGeneration?: () => void;
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
  onRegenerate,
  onStartOver,
  startOverHref,
  headerRef,
  onExport,
  onShare,
  title,
  onTitleChange,
  publicVisibility = false,
  onPublicVisibilityChange,
  isSharing,
  isGenerating = false,
  generationError = null,
  onCancelGeneration,
  onRetryGeneration,
  missedCount = 0,
  onPracticeMissed,
  masteryPercentage,
}: QuizRunnerProps) {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(title ?? '');

  const startEditingTitle = () => {
    setDraftTitle(title ?? '');
    setIsEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setDraftTitle(title ?? '');
    setIsEditingTitle(false);
  };

  const saveTitle = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = draftTitle.trim();
    if (nextTitle) onTitleChange?.(nextTitle);
    setIsEditingTitle(false);
  };

  return (
    <div className="quizify-runner space-y-8">

      {/* Header Info Banner */}
      <div className="quizify-runner-header flex flex-col sm:flex-row items-start justify-between gap-5 p-4 rounded-xl border border-border/80 bg-card">
        <div className="quizify-runner-title-block min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Quiz Active
          </div>
          {title && (isEditingTitle && onTitleChange ? (
            <form onSubmit={saveTitle} className="mt-1 flex max-w-full items-center gap-1.5">
              <label htmlFor="quiz-title-input" className="sr-only">Quiz title</label>
              <input
                id="quiz-title-input"
                value={draftTitle}
                onChange={event => setDraftTitle(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') cancelEditingTitle(); }}
                maxLength={80}
                autoFocus
                className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-base font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button type="submit" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Save quiz title" title="Save quiz title">
                <Check className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={cancelEditingTitle} aria-label="Cancel title edit" title="Cancel title edit">
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="quizify-runner-title-row mt-0.5 flex max-w-full items-start gap-1.5">
              <h1 className="min-w-0 break-words text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
              {onTitleChange && (
                <Button type="button" variant="ghost" size="icon" className="quizify-title-edit mt-0.5 h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground" onClick={startEditingTitle} aria-label="Edit quiz title" title="Edit quiz title">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          <h2 ref={headerRef} tabIndex={-1} className="text-lg font-bold text-foreground mt-0.5 outline-none">
            {quiz.questions.length} {questionTypeLabel} Questions ({difficulty})
            {language ? ` · ${language}` : ''}
          </h2>
        </div>

        <div className="quizify-runner-actions flex w-full flex-col gap-3 sm:w-auto sm:max-w-[40rem] sm:items-end">
          {(isGenerating || generationError) && (
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs" role={isGenerating ? 'status' : 'alert'} aria-live="polite">
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Regenerating this quiz…</span>
                  {onCancelGeneration && (
                    <Button type="button" variant="outline" size="sm" onClick={onCancelGeneration} className="h-8 px-2.5 text-xs">
                      Cancel
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-destructive">{generationError}</span>
                  {onRetryGeneration && (
                    <Button type="button" variant="outline" size="sm" onClick={onRetryGeneration} className="h-8 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10">
                      Retry
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="quizify-runner-action-row hidden w-full flex-wrap items-center justify-start gap-2 sm:flex sm:justify-end">
          <div className="quizify-export-stack">
            {onExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full justify-center px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
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

            {onShare && onPublicVisibilityChange && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={publicVisibility}
                aria-label={publicVisibility ? 'Visible in Public Quizzes. Click to make this quiz link-only.' : 'Link-only quiz. Click to show it in Public Quizzes.'}
                title={publicVisibility ? 'Visible in Public Quizzes · click to make link-only' : 'Link-only quiz · click to show in Public Quizzes'}
                onClick={() => onPublicVisibilityChange(!publicVisibility)}
                data-listed={publicVisibility ? 'true' : 'false'}
                className="quizify-public-visibility-button h-9 w-full justify-center px-3 border-border/80 text-xs font-semibold"
              >
                {publicVisibility ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Globe2 className="mr-1.5 h-3.5 w-3.5" />}
                {publicVisibility ? 'Public Quizzes' : 'Link only'}
              </Button>
            )}
          </div>

          {onShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              disabled={isSharing}
              className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
            >
              {isSharing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1.5 h-3.5 w-3.5" />}
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

          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-10 w-full justify-between border-border/80 px-3 text-xs font-semibold">
                  <span>More</span>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {onExport && (
                  <>
                    <DropdownMenuItem onClick={() => onExport('anki')}>
                      <Link2 className="mr-2 h-4 w-4" aria-hidden="true" /> Anki (.txt)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExport('csv')}>
                      <FileText className="mr-2 h-4 w-4" aria-hidden="true" /> CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExport('print')}>
                      <FileText className="mr-2 h-4 w-4" aria-hidden="true" /> Print / PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExport('cram')}>
                      <FileText className="mr-2 h-4 w-4" aria-hidden="true" /> Study Cram Sheet
                    </DropdownMenuItem>
                  </>
                )}
                {onShare && (
                  <DropdownMenuItem onClick={onShare} disabled={isSharing}>
                    <Share2 className="mr-2 h-4 w-4" aria-hidden="true" /> Share
                  </DropdownMenuItem>
                )}
                {onShare && onPublicVisibilityChange && (
                  <DropdownMenuItem onClick={() => onPublicVisibilityChange(!publicVisibility)}>
                    {publicVisibility ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Globe2 className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {publicVisibility ? 'Public Quizzes' : 'Link only'}
                  </DropdownMenuItem>
                )}
                {onSummaryClick && (
                  <DropdownMenuItem onClick={onSummaryClick} disabled={isSummaryLoading}>
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    {quiz.summary ? (showSummary ? 'Hide Summary' : 'Show Summary') : 'Generate Summary'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onOpenSettings}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> {settingsLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </div>
      </div>

      {/* AI Summary Container if generated */}
      <div aria-live="polite">
        {quiz.summary && showSummary && (
          <Card className="quizify-summary-card surface-card border-primary/30 bg-primary/5 p-6 animate-in fade-in duration-300">
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
      <div className="quizify-question-list space-y-6" aria-busy={isGenerating}>
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
          missedCount={missedCount}
          onPracticeMissed={onPracticeMissed}
          masteryPercentage={masteryPercentage}
          onRegenerate={onRegenerate}
          regenerateLabel={regenerateLabel}
          onStartOver={onStartOver}
          startOverHref={startOverHref}
          onExport={onExport}
          onShare={onShare}
          isSharing={isSharing}
        />
      )}

    </div>
  );
}
