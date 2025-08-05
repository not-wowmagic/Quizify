'use client';

import { useState, useMemo } from 'react';
import type { Quiz, QuizQuestion } from '@/types/quiz';
import { createQuiz } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuizClient() {
  const [lectureText, setLectureText] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerateQuiz = async () => {
    setIsLoading(true);
    setQuiz(null);
    setUserAnswers({});
    const result = await createQuiz(lectureText);
    if ('error' in result) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      setQuiz(result);
    }
    setIsLoading(false);
  };

  const handleAnswer = (questionIndex: number, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
  };

  const handleRegenerate = () => {
    setQuiz(null);
    setUserAnswers({});
  };

  const { score, answeredQuestions } = useMemo(() => {
    if (!quiz) return { score: 0, answeredQuestions: 0 };
    const answeredIndices = Object.keys(userAnswers);
    const correctAnswers = answeredIndices.reduce((acc, qIndexStr) => {
      const qIndex = parseInt(qIndexStr, 10);
      const question = quiz.questions[qIndex];
      if (question.correctAnswerIndex === userAnswers[qIndex]) {
        return acc + 1;
      }
      return acc;
    }, 0);
    return { score: correctAnswers, answeredQuestions: answeredIndices.length };
  }, [userAnswers, quiz]);

  const allAnswered = quiz && answeredQuestions === quiz.questions.length;

  return (
    <Card className="w-full shadow-lg">
      <CardContent className="p-6">
        {!quiz ? (
          <div className="flex flex-col gap-4">
            <Label htmlFor="lecture-text">Paste your lecture text below</Label>
            <Textarea
              id="lecture-text"
              placeholder="e.g., The mitochondria is the powerhouse of the cell..."
              rows={10}
              value={lectureText}
              onChange={(e) => setLectureText(e.target.value)}
              disabled={isLoading}
              className="text-base"
            />
            <Button onClick={handleGenerateQuiz} disabled={isLoading || lectureText.length < 50} size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Quiz...
                </>
              ) : (
                'Generate Quiz'
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8 animate-in fade-in duration-500">
            <div className="flex-grow">
              <h2 className="text-xl font-bold font-headline text-primary">Quiz Time!</h2>
              <Progress value={(answeredQuestions / quiz.questions.length) * 100} className="mt-2" />
            </div>

            {allAnswered && (
                <Card className="bg-accent/50 border-accent">
                    <CardHeader>
                        <CardTitle>Quiz Complete!</CardTitle>
                        <CardDescription>You scored {score} out of {quiz.questions.length}. Great job!</CardDescription>
                    </CardHeader>
                </Card>
            )}

            <div className="space-y-6">
              {quiz.questions.map((q, qIndex) => (
                <QuestionCard key={qIndex} question={q} questionIndex={qIndex} userAnswer={userAnswers[qIndex]} onAnswer={handleAnswer} />
              ))}
            </div>

            <div className="flex justify-between items-center gap-4 flex-wrap mt-8">
              <div className="flex-grow">
                <h2 className="text-xl font-bold font-headline text-primary">Your Score: {score} / {quiz.questions.length}</h2>
              </div>
              <Button onClick={handleRegenerate} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                New Quiz
              </Button>
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Label({ htmlFor, children }: { htmlFor: string, children: React.ReactNode }) {
    return <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{children}</label>
}

interface QuestionCardProps {
  question: QuizQuestion;
  questionIndex: number;
  userAnswer: number | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
}

function QuestionCard({ question, questionIndex, userAnswer, onAnswer }: QuestionCardProps) {
  const isAnswered = userAnswer !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Question {questionIndex + 1}</CardTitle>
        <CardDescription className="text-lg text-foreground pt-2">{question.question}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {question.options.map((option, oIndex) => {
            const isCorrectAnswer = oIndex === question.correctAnswerIndex;
            const isSelected = oIndex === userAnswer;

            const buttonClass = cn(
              'justify-start text-left h-auto py-3 whitespace-normal relative',
              isAnswered && isCorrectAnswer && 'bg-success text-success-foreground hover:bg-success/90',
              isAnswered && isSelected && !isCorrectAnswer && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              isAnswered && !isSelected && !isCorrectAnswer && 'bg-muted/50'
            );

            return (
              <Button
                key={oIndex}
                variant="outline"
                className={buttonClass}
                onClick={() => onAnswer(questionIndex, oIndex)}
                disabled={isAnswered}
              >
                {option}
                {isSelected && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" />}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
