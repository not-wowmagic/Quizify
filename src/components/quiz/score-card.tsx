'use client';

// src/components/quiz/score-card.tsx
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  RefreshCw, RotateCcw, CheckCircle2, Download, Target, Share2, FileText, Link2, Loader2,
} from 'lucide-react';
import type { ExportFormat } from '@/components/quiz/quiz-runner';

interface ScoreCardProps {
  score: number;
  totalQuestions: number;
  scorePercentage: number;
  feedbackMessage: string;
  currentQuote: string;
  /** Number of questions answered incorrectly; shows the practice action when > 0. */
  missedCount: number;
  onPracticeMissed?: () => void;
  /** Adaptive mastery score, shown in place of the plain percentage when provided. */
  masteryPercentage?: number;
  onRegenerate: () => void;
  regenerateLabel?: string;
  onStartOver: () => void;
  onExport?: (format: ExportFormat) => void;
  onShare?: () => void;
  isSharing?: boolean;
}

export function ScoreCard({
  score,
  totalQuestions,
  scorePercentage,
  feedbackMessage,
  currentQuote,
  missedCount,
  onPracticeMissed,
  masteryPercentage,
  onRegenerate,
  regenerateLabel = 'Regenerate Quiz',
  onStartOver,
  onExport,
  onShare,
  isSharing,
}: ScoreCardProps) {
  return (
    <Card
      className="surface-card border-emerald-500/30 bg-emerald-500/5 p-8 text-center animate-in fade-in duration-500"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md mx-auto space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
          <CheckCircle2 className="h-6 w-6" />
        </div>

        <div>
          <h3 className="text-2xl font-bold text-foreground">Quiz Completed!</h3>
          <p className="text-sm text-muted-foreground mt-1">{feedbackMessage}</p>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/20 bg-background/80 flex items-center justify-around">
          <div>
            <div className="text-3xl font-extrabold text-foreground">{score} / {totalQuestions}</div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">Correct Answers</div>
          </div>
          <div className="h-8 w-px bg-border/60" />
          <div>
            <div className="text-3xl font-extrabold text-emerald-500">
              {masteryPercentage !== undefined ? Math.round(masteryPercentage) : Math.round(scorePercentage)}%
            </div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">
              {masteryPercentage !== undefined ? 'Mastery Score' : 'Final Score'}
            </div>
          </div>
        </div>

        <p className="text-xs italic text-muted-foreground pt-2">&ldquo;{currentQuote}&rdquo;</p>

        <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
          {missedCount > 0 && onPracticeMissed && (
            <Button
              onClick={onPracticeMissed}
              className="h-10 px-5 bg-amber-500 text-amber-950 hover:bg-amber-600 font-semibold w-full sm:w-auto"
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
          <Button onClick={onStartOver} className="h-10 px-5 bg-primary text-primary-foreground font-medium">
            <RotateCcw className="mr-2 h-4 w-4" /> Start Over
          </Button>
        </div>
      </div>
    </Card>
  );
}
