'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Quiz, QuizQuestion, StandardQuestion, MatchingQuestion } from '@/types/quiz';
import { createQuiz, explainAnswer, createSummary } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, RefreshCw, CheckCircle2, Upload, Lightbulb, XCircle, FileText, 
  Sparkles, RotateCcw, CircleDot, CheckSquare, Edit3, Link as LinkIcon, Shuffle, Link2, 
  HelpCircle, ChevronDown, ChevronUp, FileCode
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { processFile, processQuiz, quizHelpers } from '@/lib/quiz-processors';

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

type StandardAnswer = { type: 'standard'; selectedIndex: number };
type MatchingAnswer = { type: 'matching'; matches: Record<number, number>; checked: boolean };
type QuizAnswer = StandardAnswer | MatchingAnswer;

export function QuizClient() {
  // Core quiz state
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, QuizAnswer>>({});
  
  // Input state with validation
  const [lectureText, setLectureText] = useState('');
  const [numQuestions, setNumQuestions] = useState<number | ''>(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'situational' | 'fill_in_the_blank' | 'true_false' | 'matching' | 'mixed'>('multiple_choice');
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [fileName, setFileName] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousTextRef = useRef('');

  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
    setCurrentQuote(getRandomQuote());
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setLectureText('');
    
    try {
      const text = await processFile(file);
      setLectureText(text);
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: 'File Processing Error',
        description: error instanceof Error ? error.message : 'Failed to read the file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!quizHelpers.isValidInput(lectureText, numQuestions)) {
      toast({
        title: 'Invalid Input',
        description: 'Please provide enough text (at least 100 characters) and a valid question count (1-50).',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setCurrentQuote(getRandomQuote());
      setQuiz(null);
      setUserAnswers({});
      
      previousTextRef.current = lectureText;
      
      const result = await createQuiz({ 
        lectureText, 
        numQuestions: Number(numQuestions) || 10, 
        difficulty, 
        questionType 
      });

      if ('error' in result) {
        toast({
          title: 'Error Generating Quiz',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      const processedQuiz = processQuiz(result);
      setQuiz(processedQuiz);
    } catch (error) {
      toast({
        title: 'Unexpected Error',
        description: error instanceof Error ? error.message : 'Failed to generate quiz. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGenerateSummary = async () => {
    if (!lectureText) return;

    try {
      setIsSummaryLoading(true);
      const result = await createSummary({ lectureText });
      
      if ('error' in result) {
        toast({
          title: 'Error Creating Summary',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setQuiz(prevQuiz => {
        if (!prevQuiz) return null;
        return {
          ...prevQuiz,
          summary: result.summary
        };
      });
      setShowSummary(true);
    } catch (error) {
      toast({
        title: 'Summary Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate summary. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleStandardAnswer = (questionIndex: number, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionIndex]: { type: 'standard', selectedIndex: optionIndex },
    }));
  };

  const handleMatchingUpdate = (questionIndex: number, answer: MatchingAnswer) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionIndex]: answer,
    }));
  };

  const handleStartOver = () => {
    setCurrentQuote(getRandomQuote());
    setQuiz(null);
    setUserAnswers({});
    setNumQuestions(10);
    setDifficulty('medium');
    setQuestionType('multiple_choice');
    setLectureText('');
    setFileName('');
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleRegenerateQuiz = () => {
    setQuiz(null);
    setUserAnswers({});
    setCurrentQuote(getRandomQuote());
  };

  const { score, answeredQuestions, scorePercentage } = useMemo(() => {
    if (!quiz) return { score: 0, answeredQuestions: 0, scorePercentage: 0 };
    
    let totalCorrect = 0;
    let totalAnswered = 0;

    quiz.questions.forEach((q, qIndex) => {
      const answer = userAnswers[qIndex];
      if (!answer) return;

      if (q.type === 'standard' && answer.type === 'standard') {
        totalAnswered++;
        if (q.correctAnswerIndex === answer.selectedIndex) {
          totalCorrect++;
        }
      } else if (q.type === 'matching' && answer.type === 'matching' && answer.checked) {
        totalAnswered++;
        const allCorrect = q.pairs.every((_, pairIdx) => answer.matches[pairIdx] === pairIdx);
        if (allCorrect) {
          totalCorrect++;
        }
      }
    });

    const percentage = quiz.questions.length > 0 ? (totalCorrect / quiz.questions.length) * 100 : 0;
    return { score: totalCorrect, answeredQuestions: totalAnswered, scorePercentage: percentage };
  }, [userAnswers, quiz]);

  const allAnswered = quiz && answeredQuestions === quiz.questions.length;
  
  const getFeedbackMessage = () => {
    if (scorePercentage >= 80) return "Excellent work! You've mastered this material!";
    if (scorePercentage >= 60) return "Good effort! Practice key areas to sharpen your score.";
    return "Keep reinforcing! Active practice will strengthen your recall.";
  };

  useEffect(() => {
    if (allAnswered) {
      setCurrentQuote(getRandomQuote());
    }
  }, [allAnswered]);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="w-full space-y-8">
      {!quiz ? (
        /* Setup Container Card */
        <Card className="surface-card border-border/80 bg-card p-4 md:p-6 shadow-sm">
          <CardHeader className="p-0 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">Configure Quiz</CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-1">
                  Import study material and select your desired question parameters.
                </CardDescription>
              </div>
              <span className="badge border-border/80 bg-muted/50 text-muted-foreground">
                Step 1 of 2
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0 space-y-4">
            {/* Input Selection Tabs */}
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-lg bg-muted p-1 text-muted-foreground">
                <TabsTrigger value="upload" className="rounded-md text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                  Upload Document
                </TabsTrigger>
                <TabsTrigger value="paste" className="rounded-md text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                  Paste Text
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4">
                <div 
                  className="flex justify-center items-center w-full"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      if (fileInputRef.current) {
                        fileInputRef.current.files = e.dataTransfer.files;
                        handleFileChange({ target: fileInputRef.current } as any);
                      }
                    }
                  }}
                >
                  <label
                    htmlFor="dropzone-file"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border/80 rounded-xl cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors text-center px-4"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="p-2 rounded-full bg-primary/10 text-primary mb-2">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Drag & drop file here or <span className="text-primary font-bold">browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Supports PDF or DOCX format</p>
                      {fileName && (
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          <FileText className="h-3.5 w-3.5" />
                          <span>{fileName}</span>
                        </div>
                      )}
                    </div>
                    <input 
                      id="dropzone-file"
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".pdf,.docx"
                      disabled={isLoading}
                    />
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="paste" className="mt-4">
                <Textarea
                  id="lecture-text"
                  placeholder="Paste lecture notes, article excerpts, or textbook chapters here (at least 100 characters)..."
                  rows={8}
                  value={lectureText}
                  onChange={(e) => setLectureText(e.target.value)}
                  disabled={isLoading}
                  className="font-sans text-sm bg-background border-border/80 rounded-xl focus-visible:ring-primary"
                />
              </TabsContent>
            </Tabs>

            {/* Parameters Grid */}
            <div className="space-y-4 pt-3 border-t border-border/60">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Number of Questions */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Number of Questions</label>
                  <div className="grid grid-cols-4 gap-2 bg-muted/40 rounded-lg p-1 border border-border/60">
                    {[5, 10, 15, 20].map((num) => (
                      <button
                        key={num}
                        onClick={() => setNumQuestions(num)}
                        disabled={isLoading}
                        className={cn(
                          "py-1.5 rounded-md text-xs font-semibold transition-all",
                          numQuestions === num 
                            ? "bg-primary text-primary-foreground shadow-sm" 
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Difficulty Level */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Difficulty Level</label>
                  <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-lg p-1 border border-border/60">
                    {(['easy', 'medium', 'hard'] as const).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => setDifficulty(diff)}
                        disabled={isLoading}
                        className={cn(
                          "py-1.5 rounded-md text-xs font-semibold capitalize transition-all",
                          difficulty === diff 
                            ? "bg-primary text-primary-foreground shadow-sm" 
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Question Types Grid Tile */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question Format</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                  {[
                    { id: 'multiple_choice', label: 'Multiple Choice', icon: CircleDot },
                    { id: 'true_false', label: 'True / False', icon: CheckSquare },
                    { id: 'fill_in_the_blank', label: 'Fill in Blank', icon: Edit3 },
                    { id: 'matching', label: 'Matching Pairs', icon: LinkIcon },
                    { id: 'situational', label: 'Situational', icon: Lightbulb },
                    { id: 'mixed', label: 'Mixed Types', icon: Shuffle }
                  ].map((type) => {
                    const Icon = type.icon;
                    const isActive = questionType === type.id;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setQuestionType(type.id as any)}
                        disabled={isLoading}
                        className={cn(
                          "rounded-lg p-2 border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 text-center text-xs font-medium",
                          isActive
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40 font-semibold shadow-sm"
                            : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/40"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="p-0 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 mt-4">
            <p className="text-xs italic text-muted-foreground text-center sm:text-left max-w-sm">
              "{currentQuote}"
            </p>
            <Button
              onClick={handleGenerateQuiz}
              disabled={isLoading || (!lectureText.trim() && !fileName)}
              className="w-full sm:w-auto h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-lg shadow transition-all hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Quiz...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Quiz
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* Quiz Active Layout Section */
        <div className="space-y-8">
          
          {/* Header Info Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/80 bg-card">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Quiz Active
              </div>
              <h2 className="text-lg font-bold text-foreground mt-0.5">
                {quiz.questions.length} {questionType.replace('_', ' ')} Questions ({difficulty})
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
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
                    {quiz.summary ? 'Toggle Summary' : 'Generate Summary'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateQuiz}
                className="h-9 px-3 border-border/80 text-xs font-medium text-foreground hover:bg-muted"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Settings
              </Button>
            </div>
          </div>

          {/* AI Summary Container if generated */}
          {quiz.summary && showSummary && (
            <Card className="surface-card border-primary/30 bg-primary/5 p-6 animate-in fade-in duration-300">
              <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold tracking-wide uppercase text-primary flex items-center gap-2">
                  <FileText className="h-4 w-4" /> AI Study Summary
                </CardTitle>
                <button 
                  onClick={() => setShowSummary(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Hide
                </button>
              </CardHeader>
              <CardContent className="p-0 text-sm leading-relaxed text-foreground whitespace-pre-line">
                {quiz.summary}
              </CardContent>
            </Card>
          )}

          {/* Questions Array */}
          <div className="space-y-6">
            {quiz.questions.map((q, index) => {
              if (q.type === 'matching') {
                return (
                  <MatchingQuestionCard
                    key={index}
                    question={q}
                    questionIndex={index}
                    userAnswer={userAnswers[index] as MatchingAnswer}
                    onUpdate={(answer) => handleMatchingUpdate(index, answer)}
                  />
                );
              }
              return (
                <StandardQuestionCard
                  key={index}
                  question={q}
                  questionIndex={index}
                  userAnswer={userAnswers[index] as StandardAnswer}
                  onAnswer={handleStandardAnswer}
                />
              );
            })}
          </div>

          {/* Scorecard Container (Appears when complete) */}
          {allAnswered && (
            <Card className="surface-card border-emerald-500/30 bg-emerald-500/5 p-8 text-center animate-in fade-in duration-500">
              <div className="max-w-md mx-auto space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                  <CheckCircle2 className="h-6 w-6" />
                </div>

                <div>
                  <h3 className="text-2xl font-bold text-foreground">Quiz Completed!</h3>
                  <p className="text-sm text-muted-foreground mt-1">{getFeedbackMessage()}</p>
                </div>

                <div className="p-4 rounded-xl border border-emerald-500/20 bg-background/80 flex items-center justify-around">
                  <div>
                    <div className="text-3xl font-extrabold text-foreground">{score} / {quiz.questions.length}</div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5">Correct Answers</div>
                  </div>
                  <div className="h-8 w-px bg-border/60" />
                  <div>
                    <div className="text-3xl font-extrabold text-emerald-500">{Math.round(scorePercentage)}%</div>
                    <div className="text-xs text-muted-foreground font-medium mt-0.5">Final Score</div>
                  </div>
                </div>

                <p className="text-xs italic text-muted-foreground pt-2">"{currentQuote}"</p>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button onClick={handleRegenerateQuiz} variant="outline" className="h-10 px-5 border-border">
                    <RefreshCw className="mr-2 h-4 w-4" /> Regenerate Quiz
                  </Button>
                  <Button onClick={handleStartOver} className="h-10 px-5 bg-primary text-primary-foreground font-medium">
                    <RotateCcw className="mr-2 h-4 w-4" /> Start Over
                  </Button>
                </div>
              </div>
            </Card>
          )}

        </div>
      )}
    </div>
  );
}

/* =========================================
 * Standard Question Card Component
 * ========================================= */
interface StandardQuestionCardProps {
  question: StandardQuestion;
  questionIndex: number;
  userAnswer: StandardAnswer | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
}

function StandardQuestionCard({ question, questionIndex, userAnswer, onAnswer }: StandardQuestionCardProps) {
  const [explanation, setExplanation] = useState<string>('');
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const { toast } = useToast();

  const isAnswered = userAnswer !== undefined;

  const handleGetExplanation = async () => {
    if (explanation) {
      setExplanation('');
      return;
    }

    setIsExplanationLoading(true);
    setExplanation('');
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
    setIsExplanationLoading(false);
  };

  useEffect(() => {
    setExplanation('');
  }, [question]);

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
        {explanation && (
          <div className="mt-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm leading-relaxed animate-in fade-in duration-200">
            <div className="font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-2 text-xs uppercase tracking-wide">
              <Lightbulb className="h-4 w-4" /> Explanation
            </div>
            <p className="text-foreground">{explanation}</p>
          </div>
        )}
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

/* =========================================
 * Matching Question Card Component
 * ========================================= */
interface MatchingQuestionCardProps {
  question: MatchingQuestion;
  questionIndex: number;
  userAnswer: MatchingAnswer | undefined;
  onUpdate: (answer: MatchingAnswer) => void;
}

function MatchingQuestionCard({ question, questionIndex, userAnswer, onUpdate }: MatchingQuestionCardProps) {
  const pairs = question.pairs;
  const shuffledResponseIndices = question.shuffledResponseIndices || pairs.map((_, i) => i);
  
  const [matches, setMatches] = useState<Record<number, number>>(userAnswer?.matches || {});
  const [selectedPremise, setSelectedPremise] = useState<number | null>(null);
  const [checked, setChecked] = useState(userAnswer?.checked || false);

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

  const matchColors = [
    'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400', 
    'border-purple-500/50 bg-purple-500/10 text-purple-600 dark:text-purple-400', 
    'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400', 
    'border-cyan-500/50 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', 
    'border-pink-500/50 bg-pink-500/10 text-pink-600 dark:text-pink-400', 
    'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ];

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
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-1">
          Tap a term on the left column, then tap its matching pair on the right. Tap a pair to unmatch.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Terms Column */}
          <div className="space-y-2">
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
          <div className="space-y-2">
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
        <div className="text-xs text-muted-foreground font-medium">
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
    </Card>
  );
}
