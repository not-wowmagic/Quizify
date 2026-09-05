'use client';

// src/components/quiz/score-card.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  RefreshCw, RotateCcw, Download, Target, Share2, FileText, Link2, Loader2,
} from 'lucide-react';
import type { ExportFormat } from '@/components/quiz/quiz-runner';

interface ScoreCardProps {
  score: number;
  totalQuestions: number;
  scorePercentage: number;
  feedbackMessage: string;
  /** Number of questions answered incorrectly; shows the practice action when > 0. */
  missedCount: number;
  onPracticeMissed?: () => void;
  /** Adaptive mastery score, shown in place of the plain percentage when provided. */
  masteryPercentage?: number;
  onRegenerate: () => void;
  regenerateLabel?: string;
  onStartOver?: () => void;
  startOverHref?: string;
  onExport?: (format: ExportFormat) => void;
  onShare?: () => void;
  isSharing?: boolean;
}

export function ScoreCard({
  score,
  totalQuestions,
  scorePercentage,
  feedbackMessage,
  missedCount,
  onPracticeMissed,
  masteryPercentage,
  onRegenerate,
  regenerateLabel = 'Regenerate Quiz',
  onStartOver,
  startOverHref,
  onExport,
  onShare,
  isSharing,
}: ScoreCardProps) {
  return (
    <Card
      className="quizify-score-card surface-card border-border/80 bg-card p-8 text-center animate-in fade-in duration-500"
      role="status"
      aria-live="polite"
    >
      <div className="quizify-score-content mx-auto max-w-xl space-y-4">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Quiz Completed!</h3>
          <p className="text-sm text-muted-foreground mt-1">{feedbackMessage}</p>
        </div>

        <div className="quizify-score-metrics flex items-center justify-around rounded-xl border border-border/60 bg-background/80 p-4">
          <div>
            <div className="text-3xl font-extrabold text-foreground">{score} / {totalQuestions}</div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">Correct Answers</div>
          </div>
          <div className="h-8 w-px bg-border/60" />
          <div>
            <div className="text-3xl font-extrabold text-primary">
              {masteryPercentage !== undefined ? Math.round(masteryPercentage) : Math.round(scorePercentage)}%
            </div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">
              {masteryPercentage !== undefined ? 'Mastery Score' : 'Final Score'}
            </div>
          </div>
        </div>

        <div className="quizify-score-actions space-y-2.5 pt-1">
          <div className="quizify-score-action-row flex flex-wrap items-center justify-center gap-2.5">
            {missedCount > 0 && onPracticeMissed && (
              <Button
                onClick={onPracticeMissed}
                className="quizify-score-primary-action h-10 px-5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold w-full sm:w-auto"
              >
                <Target className="mr-2 h-4 w-4" /> Practice Missed Questions ({missedCount})
              </Button>
            )}
            {onShare && (
              <Button
                onClick={onShare}
                disabled={isSharing}
                variant="outline"
                className="h-10 px-5 border-border"
              >
                {isSharing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="mr-2 h-4 w-4" />
                )}
                Share
              </Button>
            )}
          </div>

          <div className="quizify-score-action-row flex flex-wrap items-center justify-center gap-2.5">
            {onExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 px-5 border-border">
                    <Download className="mr-2 h-4 w-4" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-44">
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
            <Button onClick={onRegenerate} variant="outline" className="h-10 px-5 border-border">
              <RefreshCw className="mr-2 h-4 w-4" /> {regenerateLabel}
            </Button>
            {startOverHref ? (
              <Button asChild className="h-10 px-5 bg-primary text-primary-foreground font-medium">
                <Link href={startOverHref}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Start Over
                </Link>
              </Button>
            ) : (
              <Button onClick={onStartOver} className="h-10 px-5 bg-primary text-primary-foreground font-medium">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Start Over
              </Button>
            )}
          </div>
        </div>

      </div>
    </Card>
  );
}
