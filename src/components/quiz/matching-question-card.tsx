'use client';

// src/components/quiz/matching-question-card.tsx
import { useState, useMemo, useCallback } from 'react';
import type { MatchingQuestion } from '@/types/quiz';
import type { MatchingAnswer } from '@/components/quiz/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { CheckCircle2, Link2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AskTutor } from '@/components/quiz/ask-tutor';
import { tierBadge } from '@/components/quiz/standard-question-card';

interface MatchingQuestionCardProps {
  question: MatchingQuestion;
  questionIndex: number;
  userAnswer: MatchingAnswer | undefined;
  onUpdate: (answer: MatchingAnswer) => void;
}

const matchBadgeColors = [
  'border-transparent bg-palette-blue text-on-blue',
  'border-transparent bg-palette-purple text-on-purple',
  'border-transparent bg-palette-orange text-on-orange',
  'border-transparent bg-palette-green text-on-green',
  'border-transparent bg-palette-red text-on-red',
  'border-transparent bg-palette-cyan text-on-cyan',
] as const;

const matchColorIdx = (matchLabel: number | null): number =>
  matchLabel === null ? 0 : (matchLabel - 1) % matchBadgeColors.length;

/** Non-color result cue so the monochrome theme stays readable. */
function MatchResultIcon({ result }: { result: 'correct' | 'incorrect' | null }) {
  if (!result) return null;
  const Icon = result === 'correct' ? CheckCircle2 : XCircle;
  return (
    <span className="flex items-center" title={result === 'correct' ? 'Correct' : 'Incorrect'}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{result === 'correct' ? 'Correct' : 'Incorrect'}</span>
    </span>
  );
}

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
    <Card className="quizify-question-card quizify-matching-question surface-card p-6 border-border/80 bg-card space-y-4">
      <CardHeader className="p-0 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-sm border border-foreground bg-background text-foreground">
            <Link2 className="w-4 h-4" />
          </div>
          <CardTitle className="text-base sm:text-lg font-semibold text-foreground">
            <span className="quizify-question-index">{questionIndex + 1}</span>
            {question.question}
          </CardTitle>
          {question.difficultyTier && (
            <span className={cn(
              "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
              tierBadge(question.difficultyTier).classes,
            )}>
              {tierBadge(question.difficultyTier).label}
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
              const colorIdx = matchColorIdx(matchLabel);

              return (
                <button
                  key={`premise-${pIdx}`}
                  onClick={() => handlePremiseClick(pIdx)}
                  disabled={checked}
                  aria-pressed={isSelected}
                  data-match-state={checked ? matchResult ?? 'checked' : isSelected ? 'selected' : isMatched ? 'matched' : 'idle'}
                  className={cn(
                    'quizify-match-option w-full text-left p-3 rounded-lg border text-sm transition-colors duration-200 flex items-center justify-between gap-2',
                    {
                      'border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 font-medium': isSelected && !checked,
                      'border-input bg-card hover:border-primary hover:bg-secondary': !isSelected && !isMatched && !checked,
                      'border-success bg-success text-success-foreground': matchResult === 'correct',
                      'border-destructive bg-destructive/10 text-destructive': matchResult === 'incorrect',
                      'opacity-90 cursor-not-allowed': checked,
                    }
                  )}
                >
                  <span className="font-medium">{pair.premise}</span>
                  <span className="flex items-center gap-1.5">
                    <MatchResultIcon result={matchResult} />
                    {matchLabel !== null && (
                      <span className={cn("h-5 w-5 rounded-md border text-[11px] font-bold flex items-center justify-center shrink-0", matchBadgeColors[colorIdx])}>
                        {matchLabel}
                      </span>
                    )}
                  </span>
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
              const colorIdx = matchColorIdx(matchLabel);

              return (
                <button
                  key={`response-${rDisplayIdx}`}
                  onClick={() => handleResponseClick(responseOriginalIdx)}
                  disabled={checked}
                  aria-pressed={isMatched}
                  aria-label={`${responseText}${isMatched ? ', matched to a term' : ', not matched'}`}
                  data-match-state={checked ? matchResult ?? 'checked' : isMatched ? 'matched' : 'idle'}
                  className={cn(
                    'quizify-match-option w-full text-left p-3 rounded-lg border text-sm transition-colors duration-200 flex items-center justify-between gap-2',
                    {
                      'border-input bg-card hover:border-primary hover:bg-secondary': !isMatched && !checked,
                      'border-success bg-success text-success-foreground': matchResult === 'correct',
                      'border-destructive bg-destructive/10 text-destructive': matchResult === 'incorrect',
                      'opacity-90 cursor-not-allowed': checked,
                    }
                  )}
                >
                  <span>{responseText}</span>
                  <span className="flex items-center gap-1.5">
                    <MatchResultIcon result={matchResult} />
                    {matchLabel !== null && (
                      <span className={cn("h-5 w-5 rounded-md border text-[11px] font-bold flex items-center justify-center shrink-0", matchBadgeColors[colorIdx])}>
                        {matchLabel}
                      </span>
                    )}
                  </span>
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
