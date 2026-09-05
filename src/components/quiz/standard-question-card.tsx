'use client';

// src/components/quiz/standard-question-card.tsx
import { useState } from 'react';
import type { StandardQuestion } from '@/types/quiz';
import type { StandardAnswer } from '@/components/quiz/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AskTutor } from '@/components/quiz/ask-tutor';

interface StandardQuestionCardProps {
  question: StandardQuestion;
  questionIndex: number;
  userAnswer: StandardAnswer | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
}

export function StandardQuestionCard({ question, questionIndex, userAnswer, onAnswer }: StandardQuestionCardProps) {
  const [askTutorOpen, setAskTutorOpen] = useState(false);

  const isAnswered = userAnswer !== undefined;

  return (
    <Card className="quizify-question-card quizify-standard-question surface-card p-6 border-border/80 bg-card">
      <CardHeader className="p-0 pb-4">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-base sm:text-lg font-semibold leading-snug text-foreground">
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
              {question.difficultyTier === 'easy' ? 'Easy' : question.difficultyTier === 'medium' ? 'Medium' : 'Hard'}
            </span>
          )}
        </div>
      </CardHeader>

      {isAnswered && question.supportingText && (
        <p className="p-0 pb-3 -mt-2 text-xs text-muted-foreground border-l-2 border-primary/30 pl-2.5 italic animate-in fade-in duration-300">
          {question.supportingText}
        </p>
      )}

      <CardContent className="p-0 space-y-2.5">
        {question.options.map((option, oIndex) => {
          const isCorrectAnswer = oIndex === question.correctAnswerIndex;
          const isSelected = userAnswer !== undefined && oIndex === userAnswer.selectedIndex;
          const optionLetter = String.fromCharCode(65 + oIndex);

          let optionStyle = "border-border/60 bg-muted/20 text-foreground hover:bg-muted/50 hover:border-border";

          if (isAnswered) {
            if (isCorrectAnswer) {
              optionStyle = "border-primary/60 bg-primary/20 text-primary font-medium";
            } else if (isSelected) {
              optionStyle = "border-accent/50 bg-accent/15 text-accent-foreground font-medium";
            } else {
              optionStyle = "border-border/30 bg-muted/10 text-foreground/80";
            }
          }

          return (
            <button
              key={oIndex}
              onClick={() => onAnswer(questionIndex, oIndex)}
              disabled={isAnswered}
              aria-pressed={isSelected}
              data-answered={isAnswered ? 'true' : 'false'}
              data-answer-state={isAnswered ? (isCorrectAnswer ? 'correct' : isSelected ? 'incorrect' : 'unrevealed') : 'idle'}
              className={cn(
                "quizify-answer-option w-full text-left p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm transition-colors duration-200",
                optionStyle
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "quizify-answer-key flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  isAnswered && isCorrectAnswer ? "border-primary bg-primary text-primary-foreground" :
                  isAnswered && isSelected ? "border-accent bg-accent text-accent-foreground" :
                  "border-border bg-background text-muted-foreground"
                )}>
                  {optionLetter}
                </span>
                <span>{option}</span>
              </div>

              {isAnswered && isCorrectAnswer && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary ml-2" />}
              {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="h-4 w-4 shrink-0 text-accent-foreground ml-2" />}
            </button>
          );
        })}
      </CardContent>

      {/* Ask Tutor (below the question) */}
      <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-4 flex-wrap">
        <AskTutor
          question={question.question}
          context={
            `Correct answer: ${question.options[question.correctAnswerIndex]}` +
            (userAnswer !== undefined && userAnswer.selectedIndex !== question.correctAnswerIndex
              ? `\nLearner picked: ${question.options[userAnswer.selectedIndex]}`
              : '')
          }
          chips={[
            'Why is the correct answer correct?',
            'Why are the other options wrong?',
            'Explain with a real-world analogy',
            'Explain like I\u2019m 10 years old',
          ]}
          open={askTutorOpen}
          onToggle={() => setAskTutorOpen(prev => !prev)}
        />
      </div>
    </Card>
  );
}
