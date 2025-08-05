'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Quiz, QuizQuestion } from '@/types/quiz';
import { createQuiz } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const motivationalQuotes = [
    "Believe you can and you're halfway there.",
    "The secret of getting ahead is getting started.",
    "Don't watch the clock; do what it does. Keep going.",
    "The expert in anything was once a beginner.",
    "The only way to do great work is to love what you do.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "The future belongs to those who believe in the beauty of their dreams.",
    "Well done is better than well said.",
    "You are capable of more than you know.",
    "Push yourself, because no one else is going to do it for you."
];

const getRandomQuote = () => motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];


export function QuizClient() {
  const [lectureText, setLectureText] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [numQuestions, setNumQuestions] = useState<number | ''>(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'situational' | 'fill_in_the_blank' | 'true_false' | 'mixed'>('multiple_choice');
  const [currentQuote, setCurrentQuote] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    setCurrentQuote(getRandomQuote());
  }, []);

  const handleGenerateQuiz = async () => {
    setIsLoading(true);
    setCurrentQuote(getRandomQuote());
    setQuiz(null);
    setUserAnswers({});
    const result = await createQuiz({ lectureText, numQuestions: Number(numQuestions) || 10, difficulty, questionType });
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
    setCurrentQuote(getRandomQuote());
    setQuiz(null);
    setUserAnswers({});
    setNumQuestions(10);
    setDifficulty('medium');
    setQuestionType('multiple_choice');
    setLectureText('');
  };

  const handleNewQuiz = () => {
    setCurrentQuote(getRandomQuote());
    setQuiz(null);
    setUserAnswers({});
  }

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

  useEffect(() => {
    if (allAnswered) {
      setCurrentQuote(getRandomQuote());
    }
  }, [allAnswered]);

  return (
    <Card className="w-full shadow-lg bg-card/80 backdrop-blur-sm border-white/20">
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
              className="text-base bg-secondary/80"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div>
                <Label htmlFor="num-questions">Number of Questions</Label>
                <Input
                  id="num-questions"
                  type="number"
                  value={numQuestions === '' ? '' : String(numQuestions)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNumQuestions(value === '' ? '' : Math.max(1, parseInt(value, 10) || 1));
                  }}
                  disabled={isLoading}
                  min="1"
                  max="50"
                  className="mt-1 bg-secondary/80"
                />
              </div>
              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={difficulty}
                  onValueChange={(value) => setDifficulty(value as any)}
                  disabled={isLoading}
                >
                  <SelectTrigger id="difficulty" className="mt-1 bg-secondary/80">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="question-type">Question Type</Label>
                <Select
                  value={questionType}
                  onValueChange={(value) => setQuestionType(value as any)}
                  disabled={isLoading}
                >
                  <SelectTrigger id="question-type" className="mt-1 bg-secondary/80">
                    <SelectValue placeholder="Select question type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="situational">Situational</SelectItem>
                    <SelectItem value="fill_in_the_blank">Fill in the Blank</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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
             {currentQuote && !isLoading && (
              <p className="text-center text-muted-foreground italic text-sm mt-2">
                &ldquo;{currentQuote}&rdquo;
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8 animate-in fade-in duration-500">
            <div className="flex-grow">
              <h2 className="text-xl font-bold font-headline text-primary-foreground dark:text-primary">Quiz Time!</h2>
              <Progress value={(answeredQuestions / quiz.questions.length) * 100} className="mt-2" />
            </div>

            {allAnswered && (
                <Card className="bg-accent/50 border-accent">
                    <CardHeader>
                        <CardTitle>Quiz Complete!</CardTitle>
                        <CardDescription>You scored {score} out of {quiz.questions.length}. Great job!</CardDescription>
                         {currentQuote && (
                          <p className="text-center text-muted-foreground italic text-sm pt-4">
                            &ldquo;{currentQuote}&rdquo;
                          </p>
                        )}
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
                <h2 className="text-xl font-bold font-headline text-primary-foreground dark:text-primary">Your Score: {score} / {quiz.questions.length}</h2>
              </div>
              <Button onClick={handleNewQuiz} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate New Quiz
              </Button>
              <Button onClick={handleRegenerate} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Start Over
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
    <Card className="bg-card/80 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle>Question {questionIndex + 1}</CardTitle>
        <CardDescription className="text-lg text-foreground pt-2">{question.question}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "grid grid-cols-1 gap-3",
          question.options.length > 2 && "md:grid-cols-2"
        )}>
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
