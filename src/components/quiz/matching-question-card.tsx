'use client';

// src/components/quiz/matching-question-card.tsx
import { useState, useMemo, useCallback } from 'react';
import type { MatchingQuestion } from '@/types/quiz';
import type { MatchingAnswer } from '@/components/quiz/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { CheckCircle2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AskTutor } from '@/components/quiz/ask-tutor';

interface MatchingQuestionCardProps {
  question: MatchingQuestion;
  questionIndex: number;
  userAnswer: MatchingAnswer | undefined;
  onUpdate: (answer: MatchingAnswer) => void;
}

const matchColors = [
  'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'border-purple-500/50 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'border-cyan-500/50 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  'border-pink-500/50 bg-pink-500/10 text-pink-600 dark:text-pink-400',
  'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
];

export function MatchingQuestionCard({ question, questionIndex, userAnswer, onUpdate }: MatchingQuestionCardProps) {
  const pairs = question.pairs;
  const shuffledResponseIndices = question.shuffledResponseIndices || pairs.map((_, i) => i);

  const [matches, setMatches] = useState<Record<number, number>>(userAnswer?.matches || {});
  const [selectedPremise, setSelectedPremise] = useState<number | null>(null);
  const [checked, setChecked] = useState(userAnswer?.checked || false);
  const [askTutorOpen, setAskTutorOpen] = useState(false);

  const responseToMatchedPremise = useMemo(() => {
    const map: Record<number, number> = {};
    Object.entries(matches).forEach(([pIdx, rIdx]) => {
      map[rIdx] = Number(pIdx);
    });
    return map;
  }, [matches]);

  const allPairsMatched = Object.keys(matches).length === pairs.length;

  const handlePremiseClick = useCallback((premiseIdx: number) => {
    if (checked) return;

    if (matches[premiseIdx] !== undefined) {
      setMatches(prev => {
        const next = { ...prev };
        delete next[premiseIdx];
        return next;
      });
      setSelectedPremise(null);
      return;
    }

    setSelectedPremise(prev => prev === premiseIdx ? null : premiseIdx);
  }, [checked, matches]);

  const handleResponseClick = useCallback((responseOriginalIdx: number) => {
    if (checked) return;

    if (responseToMatchedPremise[responseOriginalIdx] !== undefined) {
      const matchedPremise = responseToMatchedPremise[responseOriginalIdx];
      setMatches(prev => {
        const next = { ...prev };
        delete next[matchedPremise];
        return next;
      });
      return;
    }

    if (selectedPremise === null) return;

    setMatches(prev => ({
      ...prev,
      [selectedPremise]: responseOriginalIdx,
    }));
    setSelectedPremise(null);
  }, [checked, selectedPremise, responseToMatchedPremise]);

  const handleCheck = useCallback(() => {
    setChecked(true);
    onUpdate({ type: 'matching', matches, checked: true });
  }, [matches, onUpdate]);

  const getMatchResult = useCallback((premiseIdx: number): 'correct' | 'incorrect' | null => {
    if (!checked) return null;
    if (matches[premiseIdx] === undefined) return 'incorrect';
    return matches[premiseIdx] === premiseIdx ? 'correct' : 'incorrect';
  }, [checked, matches]);

  const getMatchLabel = useCallback((premiseIdx: number): number | null => {
    if (matches[premiseIdx] === undefined) return null;
    const sortedPremises = Object.keys(matches).map(Number).sort((a, b) => a - b);
    return sortedPremises.indexOf(premiseIdx) + 1;
  }, [matches]);

  const getResponseMatchLabel = useCallback((responseOriginalIdx: number): number | null => {
    const premiseIdx = responseToMatchedPremise[responseOriginalIdx];
    if (premiseIdx === undefined) return null;
    return getMatchLabel(premiseIdx);
  }, [responseToMatchedPremise, getMatchLabel]);

  return (
    <Card className="surface-card p-6 border-border/80 bg-card space-y-4">
      <CardHeader className="p-0 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/10 text-primary">
            <Link2 className="w-4 h-4" />
          </div>
          <CardTitle className="text-base sm:text-lg font-semibold text-foreground">
            <span className="text-primary font-bold mr-2">{questionIndex + 1}.</span>
            {question.question}
          </CardTitle>
          {question.difficultyTier && (
            <span className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              question.difficultyTier === 'easy' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
              question.difficultyTier === 'medium' && "border-amber-500/30 bg-amber-500/10 text-amber-500",
              question.difficultyTier === 'hard' && "border-red-500/30 bg-red-500/10 text-red-500",
            )}>
              {question.difficultyTier === 'easy' ? '🟢 Easy' : question.difficultyTier === 'medium' ? '🟡 Medium' : '🔴 Hard'}
            </span>
          )}
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-1">
          Select a term on the left, then its matching pair on the right. Select a matched pair to unmatch. Keyboard: Tab to focus, Enter to select.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Terms Column */}
          <div className="space-y-2" role="group" aria-label="Terms">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">Terms</div>
            {pairs.map((pair, pIdx) => {
              const isSelected = selectedPremise === pIdx;
              const isMatched = matches[pIdx] !== undefined;
              const matchResult = getMatchResult(pIdx);
              const matchLabel = getMatchLabel(pIdx);
              const colorIdx = matchLabel !== null ? (matchLabel - 1) % matchColors.length : 0;

              return (
                <button
                  key={`premise-${pIdx}`}
                  onClick={() => handlePremiseClick(pIdx)}
                  disabled={checked}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border text-sm transition-all duration-200 flex items-center justify-between gap-2',
                    {
                      'border-primary bg-primary/15 text-primary ring-2 ring-primary/30 font-medium': isSelected && !checked,
                      [matchColors[colorIdx]]: isMatched && !checked,
                      'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/50': !isSelected && !isMatched && !checked,
                      'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400': matchResult === 'correct',
                      'bg-destructive/10 border-destructive/50 text-destructive': matchResult === 'incorrect',
                      'opacity-60 cursor-not-allowed': checked,
                    }
                  )}
                >
                  <span className="font-medium">{pair.premise}</span>
                  {matchLabel !== null && (
                    <span className="h-5 w-5 rounded-full border border-current text-[11px] font-bold flex items-center justify-center shrink-0">
                      {matchLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Definitions Column */}
          <div className="space-y-2" role="group" aria-label="Matches">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">Matches</div>
            {shuffledResponseIndices.map((responseOriginalIdx, rDisplayIdx) => {
              const responseText = pairs[responseOriginalIdx].response;
              const isMatched = responseToMatchedPremise[responseOriginalIdx] !== undefined;
              const matchedPremiseIdx = responseToMatchedPremise[responseOriginalIdx];
              const matchResult = matchedPremiseIdx !== undefined ? getMatchResult(matchedPremiseIdx) : null;
              const matchLabel = getResponseMatchLabel(responseOriginalIdx);
              const colorIdx = matchLabel !== null ? (matchLabel - 1) % matchColors.length : 0;

              return (
                <button
                  key={`response-${rDisplayIdx}`}
                  onClick={() => handleResponseClick(responseOriginalIdx)}
                  disabled={checked}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border text-sm transition-all duration-200 flex items-center justify-between gap-2',
                    {
                      [matchColors[colorIdx]]: isMatched && !checked,
                      'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/50': !isMatched && !checked,
                      'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400': matchResult === 'correct',
                      'bg-destructive/10 border-destructive/50 text-destructive': matchResult === 'incorrect',
                      'opacity-60 cursor-not-allowed': checked,
                    }
                  )}
                >
                  <span>{responseText}</span>
                  {matchLabel !== null && (
                    <span className="h-5 w-5 rounded-full border border-current text-[11px] font-bold flex items-center justify-center shrink-0">
                      {matchLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

        </div>
      </CardContent>

      <CardFooter className="p-0 pt-4 flex items-center justify-between border-t border-border/60 mt-4">
        <div className="text-xs text-muted-foreground font-medium" aria-live="polite">
          {Object.keys(matches).length} of {pairs.length} pairs linked
        </div>

        {!checked && (
          <Button
            size="sm"
            onClick={handleCheck}
            disabled={!allPairsMatched}
            className="h-8 px-4 bg-primary text-primary-foreground text-xs font-semibold shadow"
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Check Matching Pairs
          </Button>
        )}
      </CardFooter>

      <div className="mt-4 pt-4 border-t border-border/60">
        <AskTutor
          question={question.question}
          context={pairs.map(p => `${p.premise} → ${p.response}`).join('\n')}
          chips={[
            'Explain why these pairs match',
            'Give me a memory trick for these pairs',
            'Explain like I\u2019m 10 years old',
          ]}
          open={askTutorOpen}
          onToggle={() => setAskTutorOpen(prev => !prev)}
        />
      </div>
    </Card>
  );
}
