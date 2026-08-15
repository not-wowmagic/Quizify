'use client';

// src/components/quiz/standard-question-card.tsx
import { useState } from 'react';
import type { StandardQuestion } from '@/types/quiz';
import type { StandardAnswer } from '@/components/quiz/types';
import { explainAnswer } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Lightbulb, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StandardQuestionCardProps {
  question: StandardQuestion;
  questionIndex: number;
  userAnswer: StandardAnswer | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
}

export function StandardQuestionCard({ question, questionIndex, userAnswer, onAnswer }: StandardQuestionCardProps) {
  const [explanation, setExplanation] = useState<string>('');
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const { toast } = useToast();

  const isAnswered = userAnswer !== undefined;

  // Reset the explanation when the question changes (regenerated quiz)
  const [prevQuestion, setPrevQuestion] = useState(question);
  if (prevQuestion !== question) {
    setPrevQuestion(question);
    setExplanation('');
  }

  const handleGetExplanation = async () => {
    if (explanation) {
      setExplanation('');
      return;
    }

    setIsExplanationLoading(true);
    setExplanation('');
    try {
      const result = await explainAnswer({
        question: question.question,
        correctAnswer: question.options[question.correctAnswerIndex],
      });

      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        setExplanation(result.explanation);
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to generate the explanation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExplanationLoading(false);
    }
  };

  return (
    <Card className="surface-card p-6 border-border/80 bg-card">
      <CardHeader className="p-0 pb-4">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-base sm:text-lg font-semibold leading-snug text-foreground">
            <span className="text-primary font-bold mr-2">{questionIndex + 1}.</span>
            {question.question}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-2.5">
        {question.options.map((option, oIndex) => {
          const isCorrectAnswer = oIndex === question.correctAnswerIndex;
          const isSelected = userAnswer !== undefined && oIndex === userAnswer.selectedIndex;
          const optionLetter = String.fromCharCode(65 + oIndex);

          let optionStyle = "border-border/60 bg-muted/20 text-foreground hover:bg-muted/50 hover:border-border";

          if (isAnswered) {
            if (isCorrectAnswer) {
              optionStyle = "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium";
            } else if (isSelected) {
              optionStyle = "border-destructive/50 bg-destructive/10 text-destructive font-medium";
            } else {
              optionStyle = "border-border/30 bg-muted/10 text-muted-foreground opacity-50";
            }
          }

          return (
            <button
              key={oIndex}
              onClick={() => onAnswer(questionIndex, oIndex)}
              disabled={isAnswered}
              aria-pressed={isSelected}
              className={cn(
                "w-full text-left p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm transition-all duration-200",
                optionStyle
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  isAnswered && isCorrectAnswer ? "border-emerald-500 bg-emerald-500 text-white" :
                  isAnswered && isSelected ? "border-destructive bg-destructive text-white" :
                  "border-border bg-background text-muted-foreground"
                )}>
                  {optionLetter}
                </span>
                <span>{option}</span>
              </div>

              {isAnswered && isCorrectAnswer && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 ml-2" />}
              {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="h-4 w-4 shrink-0 text-destructive ml-2" />}
            </button>
          );
        })}

        {/* Explanation Callout Box */}
        <div aria-live="polite">
          {explanation && (
            <div className="mt-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm leading-relaxed animate-in fade-in duration-200">
              <div className="font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-2 text-xs uppercase tracking-wide">
                <Lightbulb className="h-4 w-4" /> Explanation
              </div>
              <p className="text-foreground">{explanation}</p>
            </div>
          )}
        </div>
      </CardContent>

      {isAnswered && (
        <CardFooter className="p-0 pt-4 mt-4 border-t border-border/60 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGetExplanation}
            disabled={isExplanationLoading}
            className="text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
          >
            {isExplanationLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Generating Explanation...
              </>
            ) : (
              <>
                <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                {explanation ? 'Hide Explanation' : 'Explain Answer'}
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
