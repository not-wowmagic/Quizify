'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Quiz, QuizQuestion } from '@/types/quiz';
import { createQuiz, explainAnswer, regenerateQuizQuestions } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, CheckCircle2, Upload, Lightbulb, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up the worker for pdfjs
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}


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
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [numQuestions, setNumQuestions] = useState<number | ''>(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'situational' | 'fill_in_the_blank' | 'true_false' | 'mixed'>('multiple_choice');
  const [currentQuote, setCurrentQuote] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument(arrayBuffer).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => (item as any).str).join(' ');
        }
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        toast({
          title: 'Unsupported File Type',
          description: 'Please upload a PDF or DOCX file.',
          variant: 'destructive',
        });
      }
      setLectureText(text);
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: 'File Processing Error',
        description: 'There was an error reading the file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


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
    setIsRegenerating(true);
    setCurrentQuote(getRandomQuote());
    
    const result = await regenerateQuizQuestions({ lectureText, numQuestions: Number(numQuestions) || 10, difficulty, questionType });
    if ('error' in result) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      setQuiz((prevQuiz) => {
        if (!prevQuiz) return null;
        return {
          ...prevQuiz,
          questions: result.questions,
        };
      });
      setUserAnswers({});
    }
    setIsRegenerating(false);
  }


  const { score, answeredQuestions, scorePercentage } = useMemo(() => {
    if (!quiz) return { score: 0, answeredQuestions: 0, scorePercentage: 0 };
    const answeredIndices = Object.keys(userAnswers);
    const correctAnswers = answeredIndices.reduce((acc, qIndexStr) => {
      const qIndex = parseInt(qIndexStr, 10);
      const question = quiz.questions[qIndex];
      if (question.correctAnswerIndex === userAnswers[qIndex]) {
        return acc + 1;
      }
      return acc;
    }, 0);
    const percentage = quiz.questions.length > 0 ? (correctAnswers / quiz.questions.length) * 100 : 0;
    return { score: correctAnswers, answeredQuestions: answeredIndices.length, scorePercentage: percentage };
  }, [userAnswers, quiz]);

  const allAnswered = quiz && answeredQuestions === quiz.questions.length;
  
  const getFeedbackMessage = () => {
    if (scorePercentage >= 80) return "Great job!";
    if (scorePercentage >= 50) return "You're doing better!";
    return "Keep trying!";
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
    <Card className="w-full shadow-2xl bg-card/80 backdrop-blur-xl border-white/20">
      <CardContent className="p-8">
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
                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-secondary/80"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
                      <p className="mb-2 text-lg font-semibold text-foreground">
                        Drag & drop or <span className="text-primary">browse</span>
                      </p>
                      <p className="text-sm text-muted-foreground">Supports: PDF, DOCX</p>
                       {fileName && <p className="mt-4 text-sm text-primary">{fileName}</p>}
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
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={() => handleGenerateQuiz()} disabled={isLoading || lectureText.length < 50} size="lg" className="rounded-full">
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
          
            {quiz.summary && (
                <Card className="bg-secondary/50 border-border">
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">{quiz.summary}</p>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-6">
              {quiz.questions.map((q, qIndex) => (
                <QuestionCard 
                  key={q.question} 
                  question={q} 
                  questionIndex={qIndex} 
                  userAnswer={userAnswers[qIndex]} 
                  onAnswer={handleAnswer}
                  toast={toast}
                />
              ))}
            </div>

             {allAnswered && (
                 <Card className="bg-accent/50 border-accent mt-8">
                    <CardHeader className="text-center">
                        <CardTitle>Quiz Complete!</CardTitle>
                        <div className="text-4xl font-bold mt-2">{score} / {quiz.questions.length}</div>
                        <p className="text-xl">({scorePercentage.toFixed(0)}%)</p>
                        <CardDescription className="mt-2">{getFeedbackMessage()}</CardDescription>
                    </CardHeader>
                    <CardFooter className="flex-col gap-4">
                        <Button onClick={handleRegenerateQuiz} variant="outline" className="w-full" disabled={isRegenerating}>
                            {isRegenerating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
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

interface QuestionCardProps {
  question: QuizQuestion;
  questionIndex: number;
  userAnswer: number | undefined;
  onAnswer: (questionIndex: number, optionIndex: number) => void;
  toast: (options: { title: string; description: string; variant?: "default" | "destructive" }) => void;
}

function QuestionCard({ question, questionIndex, userAnswer, onAnswer, toast }: QuestionCardProps) {
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
    <Card className="bg-card/80 backdrop-blur-sm border-white/20 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {questionIndex + 1}. {question.question}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {question.options.map((option, oIndex) => {
          const isCorrectAnswer = oIndex === question.correctAnswerIndex;
          const isSelected = oIndex === userAnswer;
          const optionLetter = String.fromCharCode(65 + oIndex); // A, B, C, D

          const buttonClass = cn(
            'justify-start text-left h-auto py-3 px-4 whitespace-normal relative rounded-lg border flex items-center gap-4 text-base',
            {
              'bg-destructive text-destructive-foreground border-destructive-foreground/20': isAnswered && isSelected && !isCorrectAnswer,
              'bg-success text-success-foreground border-success-foreground/20': isAnswered && isCorrectAnswer,
              'bg-muted/50 text-muted-foreground': isAnswered && !isSelected && !isCorrectAnswer,
              'hover:bg-muted/50': !isAnswered,
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
              {isAnswered && isSelected && isCorrectAnswer && <CheckCircle2 className="flex-shrink-0 w-5 h-5 ml-auto" />}
              {isAnswered && isSelected && !isCorrectAnswer && <XCircle className="flex-shrink-0 w-5 h-5 ml-auto" />}
              {isAnswered && !isSelected && isCorrectAnswer && <CheckCircle2 className="flex-shrink-0 w-5 h-5 ml-auto" />}
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
