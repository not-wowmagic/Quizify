'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Quiz, QuizQuestion, StandardQuestion, MatchingQuestion } from '@/types/quiz';
import { createQuiz, explainAnswer, regenerateQuizQuestions, createSummary } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, Upload, Lightbulb, XCircle, FileText, Sparkles, Link2, Unlink2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

// =========================================
// Answer type: supports both standard and matching answers
// =========================================
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
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [fileName, setFileName] = useState('');
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousTextRef = useRef('');
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  

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
    setLectureText(''); // Clear previous text
    
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
        description: 'Please provide enough text (at least 100 characters) and a valid number of questions (1-50).',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setCurrentQuote(getRandomQuote());
      setQuiz(null);
      setUserAnswers({});
      
      // Save current text for comparison
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
      
      // Automatically generate summary for longer texts
      if (lectureText.length > 1000) {
        handleGenerateSummary();
      }
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
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

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
    } catch (error) {
      toast({
        title: 'Summary Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate summary. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSummaryLoading(false);
    }
  }

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

  const handleRegenerateQuiz = async () => {
    if (!quizHelpers.isValidInput(lectureText, numQuestions) || !quiz) {
      toast({
        title: 'Cannot Regenerate',
        description: 'Please ensure you have valid input text and an existing quiz.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsRegenerating(true);
      setCurrentQuote(getRandomQuote());
      
      // Compare with saved text
      if (lectureText !== previousTextRef.current) {
        toast({
          title: 'Text Changed',
          description: 'The lecture text has changed. Generating a new quiz instead.',
          variant: 'default',
        });
        await handleGenerateQuiz();
        return;
      }
      
      const result = await regenerateQuizQuestions({ 
        lectureText, 
        numQuestions: Number(numQuestions) || 10, 
        difficulty, 
        questionType 
      });

      if ('error' in result) {
        toast({
          title: 'Error Regenerating Quiz',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      setUserAnswers({});
      setQuiz(prevQuiz => {
        const newQuizData = processQuiz(result);
        if (!prevQuiz) return newQuizData;
        return {
          ...prevQuiz,
          questions: newQuizData.questions,
        };
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to regenerate quiz',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(false);
    }
  }


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
        // A matching question is correct if ALL pairs are matched correctly
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
    if (scorePercentage >= 80) return "Excellent work! You've mastered this content!";
    if (scorePercentage >= 60) return "Good job! Keep practicing to improve further.";
    return "Keep learning! Practice makes perfect.";
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
    <Card className="w-full shadow-2xl bg-card/60 backdrop-blur-xl border-white/10 rounded-2xl">
      <CardContent className="p-6 md:p-8">
        {!quiz ? (
          <div className="flex flex-col gap-6">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload File</TabsTrigger>
                <TabsTrigger value="paste">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="upload">
                <div 
                    className="mt-4 flex justify-center items-center w-full"
                    onDragOver={(e) => {
                        e.preventDefault();
                    }}
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
                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-card/50 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
                      <p className="mb-2 text-lg font-semibold text-foreground">
                        Drag & drop or <span className="text-primary font-bold">browse</span>
                      </p>
                      <p className="text-sm text-muted-foreground">Supports: PDF, DOCX</p>
                       {fileName && <p className="mt-4 text-sm text-primary">File Name: {fileName}</p>}
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
              <TabsContent value="paste">
                <Textarea
                  id="lecture-text"
                  placeholder="e.g., The mitochondria is the powerhouse of the cell..."
                  rows={10}
                  value={lectureText}
                  onChange={(e) => setLectureText(e.target.value)}
                  disabled={isLoading}
                  className="text-base bg-secondary/80 mt-2"
                />
              </TabsContent>
            </Tabs>
            
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
                    <SelectItem value="matching">Matching Type</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={() => handleGenerateQuiz()} disabled={isLoading || lectureText.length < 50} size="lg" className="rounded-full font-bold text-base">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Quiz...
                </>
              ) : (
                 <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Quiz
                 </>
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
          
            <SummaryCard 
                summary={quiz.summary} 
                onGenerate={handleGenerateSummary}
                isLoading={isSummaryLoading}
            />

            <div className="space-y-6">
              {quiz.questions.map((q, qIndex) => {
                if (q.type === 'matching') {
                  return (
                    <MatchingQuestionCard
                      key={`matching-${q.question}-${qIndex}`}
                      question={q}
                      questionIndex={qIndex}
                      userAnswer={userAnswers[qIndex] as MatchingAnswer | undefined}
                      onUpdate={(answer) => handleMatchingUpdate(qIndex, answer)}
                    />
                  );
                }
                return (
                  <StandardQuestionCard 
                    key={`standard-${q.question}-${qIndex}`} 
                    question={q} 
                    questionIndex={qIndex} 
                    userAnswer={userAnswers[qIndex] as StandardAnswer | undefined} 
                    onAnswer={handleStandardAnswer}
                    toast={toast}
                  />
                );
              })}
            </div>

             {allAnswered && (
                 <Card className="bg-gradient-to-br from-green-500/20 to-cyan-500/20 border-green-500/30 mt-8">
                    <CardHeader className="text-center">
                        <CardTitle>Quiz Complete!</CardTitle>
                        <div className="text-4xl font-bold mt-2">{score} / {quiz.questions.length}</div>
                        <p className="text-xl">({scorePercentage.toFixed(0)}%)</p>
                        <CardDescription className="mt-2 font-semibold">{getFeedbackMessage()}</CardDescription>
                    </CardHeader>
                    <CardFooter className="flex-col gap-4">
                        <Button onClick={handleRegenerateQuiz} variant="outline" className="w-full" disabled={isRegenerating}>
                             {isRegenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Regenerate Quiz
                        </Button>
                        <Button onClick={handleStartOver} variant="outline" className="w-full" disabled={isRegenerating}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Start Over
                        </Button>
                        {currentQuote && (
                          <p className="text-muted-foreground italic text-sm pt-4">
                            &ldquo;{currentQuote}&rdquo;
                          </p>
                        )}
                    </CardFooter>
                 </Card>
            )}

          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Label({ htmlFor, children }: { htmlFor: string, children: React.ReactNode }) {
    return <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{children}</label>
}

// =========================================
// Standard Question Card (existing behavior)
// =========================================

interface StandardQuestionCardProps {
  question: StandardQuestion;
  questionIndex: number;
  userAnswer: StandardAnswer | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  toast: (options: { title: string; description: string; variant?: "default" | "destructive" }) => void;
}

function StandardQuestionCard({ question, questionIndex, userAnswer, onAnswer, toast }: StandardQuestionCardProps) {
  const isAnswered = userAnswer !== undefined;
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const [explanation, setExplanation] = useState('');

  const handleGetExplanation = async () => {
    if (explanation) { // If explanation is already there, hide it.
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
    // Reset explanation when question changes
    setExplanation('');
  }, [question]);


  return (
    <Card className="bg-card/80 backdrop-blur-sm border-white/10 shadow-lg transition-all duration-300 hover:border-white/20">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {questionIndex + 1}. {question.question}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {question.options.map((option, oIndex) => {
          const isCorrectAnswer = oIndex === question.correctAnswerIndex;
          const isSelected = userAnswer !== undefined && oIndex === userAnswer.selectedIndex;
          const optionLetter = String.fromCharCode(65 + oIndex); // A, B, C, D

          const buttonClass = cn(
            'justify-start text-left h-auto py-3 px-4 whitespace-normal relative rounded-lg border flex items-center gap-4 text-base transition-all duration-300',
            {
              'bg-success/80 text-success-foreground border-success-foreground/20 shadow-lg shadow-success/20': isAnswered && isCorrectAnswer,
              'bg-destructive/80 text-destructive-foreground border-destructive-foreground/20 shadow-lg shadow-destructive/20': isAnswered && isSelected && !isCorrectAnswer,
              'bg-muted/50 text-muted-foreground opacity-60': isAnswered && !isCorrectAnswer && !isSelected,
              'hover:bg-muted/50 hover:border-white/20': !isAnswered,
            }
          );

          return (
            <Button
              key={oIndex}
              variant="outline"
              className={buttonClass}
              onClick={() => onAnswer(questionIndex, oIndex)}
              disabled={isAnswered}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full border mr-4 flex-shrink-0 font-semibold">{optionLetter}</div>
              <div className="flex-grow">{option}</div>
              {isAnswered && isCorrectAnswer && <CheckCircle2 className="flex-shrink-0 w-5 h-5 ml-auto" />}
              {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="flex-shrink-0 w-5 h-5 ml-auto" />}
            </Button>
          );
        })}
         {explanation && (
          <div className="p-4 bg-secondary/80 rounded-md text-secondary-foreground animate-in fade-in duration-300 mt-4">
            <h4 className="font-semibold mb-2 flex items-center"><Lightbulb className="mr-2 h-4 w-4 text-primary"/>Explanation</h4>
            <p>{explanation}</p>
          </div>
        )}
      </CardContent>
        {isAnswered && (
          <CardFooter>
            <Button 
                variant="link" 
                onClick={handleGetExplanation} 
                disabled={isExplanationLoading}
                className="text-primary hover:text-primary/80"
            >
                {isExplanationLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <Lightbulb className="mr-2 h-4 w-4" />
                        {explanation ? 'Hide Explanation' : 'Show Explanation'}
                    </>
                )}
            </Button>
          </CardFooter>
        )}
    </Card>
  );
}

// =========================================
// Matching Question Card — click-to-match, mobile-friendly
// =========================================

interface MatchingQuestionCardProps {
  question: MatchingQuestion;
  questionIndex: number;
  userAnswer: MatchingAnswer | undefined;
  onUpdate: (answer: MatchingAnswer) => void;
}

function MatchingQuestionCard({ question, questionIndex, userAnswer, onUpdate }: MatchingQuestionCardProps) {
  const pairs = question.pairs;
  const shuffledResponseIndices = question.shuffledResponseIndices || pairs.map((_, i) => i);
  
  // Local state for the matching interaction
  const [matches, setMatches] = useState<Record<number, number>>(userAnswer?.matches || {});
  const [selectedPremise, setSelectedPremise] = useState<number | null>(null);
  const [checked, setChecked] = useState(userAnswer?.checked || false);

  // Reverse map: response index → premise index (for highlighting which response is taken)
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
    
    // If already matched, unmatch it
    if (matches[premiseIdx] !== undefined) {
      setMatches(prev => {
        const next = { ...prev };
        delete next[premiseIdx];
        return next;
      });
      setSelectedPremise(null);
      return;
    }

    // Toggle selection
    setSelectedPremise(prev => prev === premiseIdx ? null : premiseIdx);
  }, [checked, matches]);

  const handleResponseClick = useCallback((responseOriginalIdx: number) => {
    if (checked) return;

    // If this response is already matched to something, unmatch it
    if (responseToMatchedPremise[responseOriginalIdx] !== undefined) {
      const matchedPremise = responseToMatchedPremise[responseOriginalIdx];
      setMatches(prev => {
        const next = { ...prev };
        delete next[matchedPremise];
        return next;
      });
      // If we had a selected premise, don't auto-match it to this response
      return;
    }

    // If no premise selected, select this response's premise (reverse flow)
    if (selectedPremise === null) return;

    // Create the match
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

  const handleReset = useCallback(() => {
    if (checked) return;
    setMatches({});
    setSelectedPremise(null);
  }, [checked]);

  // Get match color for a premise (after checking)
  const getMatchResult = useCallback((premiseIdx: number): 'correct' | 'incorrect' | null => {
    if (!checked) return null;
    if (matches[premiseIdx] === undefined) return 'incorrect';
    // Correct if the response's original index matches the premise's original index
    return matches[premiseIdx] === premiseIdx ? 'correct' : 'incorrect';
  }, [checked, matches]);

  // Count correct pairs
  const correctPairCount = useMemo(() => {
    if (!checked) return 0;
    return pairs.filter((_, idx) => matches[idx] === idx).length;
  }, [checked, pairs, matches]);

  // Get the matching label index (1, 2, 3...) for visual connection lines
  const getMatchLabel = useCallback((premiseIdx: number): number | null => {
    if (matches[premiseIdx] === undefined) return null;
    // Return a 1-indexed label based on creation order
    const sortedPremises = Object.keys(matches).map(Number).sort((a, b) => a - b);
    return sortedPremises.indexOf(premiseIdx) + 1;
  }, [matches]);

  const getResponseMatchLabel = useCallback((responseOriginalIdx: number): number | null => {
    const premiseIdx = responseToMatchedPremise[responseOriginalIdx];
    if (premiseIdx === undefined) return null;
    return getMatchLabel(premiseIdx);
  }, [responseToMatchedPremise, getMatchLabel]);

  // Color palette for match lines
  const matchColors = [
    'bg-blue-500/30 border-blue-400', 
    'bg-purple-500/30 border-purple-400', 
    'bg-amber-500/30 border-amber-400', 
    'bg-cyan-500/30 border-cyan-400', 
    'bg-pink-500/30 border-pink-400', 
    'bg-emerald-500/30 border-emerald-400',
    'bg-orange-500/30 border-orange-400',
    'bg-indigo-500/30 border-indigo-400',
  ];

  const matchTextColors = [
    'text-blue-400', 
    'text-purple-400', 
    'text-amber-400', 
    'text-cyan-400', 
    'text-pink-400', 
    'text-emerald-400',
    'text-orange-400',
    'text-indigo-400',
  ];

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-white/10 shadow-lg transition-all duration-300 hover:border-white/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
            <Link2 className="w-4 h-4 text-primary" />
          </div>
          <CardTitle className="text-xl font-semibold">
            {questionIndex + 1}. {question.question}
          </CardTitle>
        </div>
        <CardDescription className="mt-1">
          Tap a term on the left, then tap its match on the right. Tap a matched pair to unmatch it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Two-column matching grid */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          {/* Left column — Premises */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Terms</div>
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
                    'w-full text-left p-3 rounded-lg border-2 transition-all duration-200 text-sm md:text-base relative',
                    'active:scale-[0.98] touch-manipulation',
                    {
                      // Not answered yet states
                      'border-primary bg-primary/10 shadow-md shadow-primary/20 ring-2 ring-primary/30': isSelected && !checked,
                      [matchColors[colorIdx]]: isMatched && !checked,
                      'border-border/50 bg-card/60 hover:border-border hover:bg-card/80': !isSelected && !isMatched && !checked,
                      // After check states
                      'bg-success/20 border-success/50': matchResult === 'correct',
                      'bg-destructive/20 border-destructive/50': matchResult === 'incorrect',
                      'opacity-50 cursor-not-allowed': checked,
                    }
                  )}
                >
                  <div className="flex items-center gap-2">
                    {matchLabel !== null && (
                      <span className={cn(
                        'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                        checked 
                          ? matchResult === 'correct' ? 'bg-success/50 text-success-foreground' : 'bg-destructive/50 text-destructive-foreground'
                          : `${matchColors[colorIdx]} ${matchTextColors[colorIdx]}`
                      )}>
                        {matchLabel}
                      </span>
                    )}
                    <span className="flex-grow">{pair.premise}</span>
                    {matchResult === 'correct' && <CheckCircle2 className="flex-shrink-0 w-4 h-4 text-success ml-1" />}
                    {matchResult === 'incorrect' && <XCircle className="flex-shrink-0 w-4 h-4 text-destructive ml-1" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right column — Responses (shuffled) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Definitions</div>
            {shuffledResponseIndices.map((originalIdx) => {
              const pair = pairs[originalIdx];
              const isMatchedToSomePremise = responseToMatchedPremise[originalIdx] !== undefined;
              const matchLabel = getResponseMatchLabel(originalIdx);
              const colorIdx = matchLabel !== null ? (matchLabel - 1) % matchColors.length : 0;
              
              // After check: determine if the match to this response is correct
              const matchedPremise = responseToMatchedPremise[originalIdx];
              const isCorrectMatch = checked && matchedPremise !== undefined && matchedPremise === originalIdx;
              const isIncorrectMatch = checked && matchedPremise !== undefined && matchedPremise !== originalIdx;
              // This response wasn't matched at all but should have been
              const isUnmatched = checked && matchedPremise === undefined;

              return (
                <button
                  key={`response-${originalIdx}`}
                  onClick={() => handleResponseClick(originalIdx)}
                  disabled={checked}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border-2 transition-all duration-200 text-sm md:text-base',
                    'active:scale-[0.98] touch-manipulation',
                    {
                      // Before check states
                      [matchColors[colorIdx]]: isMatchedToSomePremise && !checked,
                      'border-border/50 bg-card/60 hover:border-border hover:bg-card/80': !isMatchedToSomePremise && !checked,
                      'border-primary/50 bg-primary/5': selectedPremise !== null && !isMatchedToSomePremise && !checked,
                      // After check states
                      'bg-success/20 border-success/50': isCorrectMatch,
                      'bg-destructive/20 border-destructive/50': isIncorrectMatch || isUnmatched,
                      'opacity-50 cursor-not-allowed': checked,
                    }
                  )}
                >
                  <div className="flex items-center gap-2">
                    {matchLabel !== null && (
                      <span className={cn(
                        'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                        checked
                          ? isCorrectMatch ? 'bg-success/50 text-success-foreground' : 'bg-destructive/50 text-destructive-foreground'
                          : `${matchColors[colorIdx]} ${matchTextColors[colorIdx]}`
                      )}>
                        {matchLabel}
                      </span>
                    )}
                    <span className="flex-grow">{pair.response}</span>
                    {isCorrectMatch && <CheckCircle2 className="flex-shrink-0 w-4 h-4 text-success ml-1" />}
                    {isIncorrectMatch && <XCircle className="flex-shrink-0 w-4 h-4 text-destructive ml-1" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Correct answers reveal after checking */}
        {checked && (
          <div className="mt-4 p-4 bg-secondary/60 rounded-lg border border-border/30 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Correct Matches — {correctPairCount} / {pairs.length} pairs correct
            </h4>
            <div className="space-y-1">
              {pairs.map((pair, idx) => (
                <div key={`answer-${idx}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{pair.premise}</span>
                  <span className="text-primary">→</span>
                  <span>{pair.response}</span>
                  {matches[idx] === idx ? (
                    <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      {!checked && (
        <CardFooter className="flex gap-3">
          <Button
            onClick={handleCheck}
            disabled={!allPairsMatched}
            className="flex-1 rounded-lg font-semibold"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Check Matches
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            disabled={Object.keys(matches).length === 0}
            className="rounded-lg"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// =========================================
// Summary Card
// =========================================

interface SummaryCardProps {
    summary?: string;
    onGenerate: () => void;
    isLoading: boolean;
}

function SummaryCard({ summary, onGenerate, isLoading }: SummaryCardProps) {
    if (summary) {
        return (
            <Card className="bg-secondary/50 border-border">
                <CardHeader>
                    <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">{summary}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="flex justify-center">
            <Button variant="outline" onClick={onGenerate} disabled={isLoading}>
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Summary...
                    </>
                ) : (
                    <>
                        <FileText className="mr-2 h-4 w-4" />
                        Show Summary
                    </>
                )}
            </Button>
        </div>
    );
}
