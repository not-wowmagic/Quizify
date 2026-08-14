'use client';

// src/components/quiz/quiz-setup.tsx
import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TurnstileWidget } from '@/components/turnstile-widget';
import {
  Loader2, Upload, Lightbulb, FileText,
  Sparkles, CircleDot, CheckSquare, Edit3, Link as LinkIcon, Shuffle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Difficulty, QuestionTypeId } from '@/components/quiz/types';

interface QuizSetupProps {
  lectureText: string;
  onLectureTextChange: (value: string) => void;
  numQuestions: number | '';
  onNumQuestionsChange: (value: number) => void;
  difficulty: Difficulty;
  onDifficultyChange: (value: Difficulty) => void;
  questionType: QuestionTypeId;
  onQuestionTypeChange: (value: QuestionTypeId) => void;
  isLoading: boolean;
  fileName: string;
  currentQuote: string;
  /** Seconds since loading started — used to show "still working" hints. */
  elapsedSec: number;
  onFileSelected: (file: File) => void;
  onGenerate: () => void;
  turnstileSiteKey?: string;
  onTurnstileToken: (token: string | null) => void;
}

const QUESTION_TYPES: Array<{ id: QuestionTypeId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'multiple_choice', label: 'Multiple Choice', icon: CircleDot },
  { id: 'true_false', label: 'True / False', icon: CheckSquare },
  { id: 'fill_in_the_blank', label: 'Fill in Blank', icon: Edit3 },
  { id: 'matching', label: 'Matching Pairs', icon: LinkIcon },
  { id: 'situational', label: 'Situational', icon: Lightbulb },
  { id: 'mixed', label: 'Mixed Types', icon: Shuffle },
];

export function QuizSetup({
  lectureText,
  onLectureTextChange,
  numQuestions,
  onNumQuestionsChange,
  difficulty,
  onDifficultyChange,
  questionType,
  onQuestionTypeChange,
  isLoading,
  fileName,
  currentQuote,
  elapsedSec,
  onFileSelected,
  onGenerate,
  turnstileSiteKey,
  onTurnstileToken,
}: QuizSetupProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear the native input when the parent resets the file name (Start Over)
  useEffect(() => {
    if (!fileName && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [fileName]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
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
              onDrop={handleDrop}
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
                    Drag &amp; drop file here or <span className="text-primary font-bold">browse</span>
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
                  onChange={handleInputChange}
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
              onChange={(e) => onLectureTextChange(e.target.value)}
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
                    onClick={() => onNumQuestionsChange(num)}
                    disabled={isLoading}
                    aria-pressed={numQuestions === num}
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
                    onClick={() => onDifficultyChange(diff)}
                    disabled={isLoading}
                    aria-pressed={difficulty === diff}
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
              {QUESTION_TYPES.map((type) => {
                const Icon = type.icon;
                const isActive = questionType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => onQuestionTypeChange(type.id)}
                    disabled={isLoading}
                    aria-pressed={isActive}
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
        <p className="text-xs italic text-muted-foreground text-center sm:text-left max-w-sm" aria-live="polite">
          {currentQuote ? `“${currentQuote}”` : ''}
        </p>
        <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
          {turnstileSiteKey && (
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          )}
          <Button
            onClick={onGenerate}
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
          {isLoading && elapsedSec >= 10 && (
            <p className="text-xs text-muted-foreground text-center max-w-[240px]" role="status" aria-live="polite">
              {elapsedSec >= 45
                ? 'Taking longer than usual — the AI service may be busy. Hang tight…'
                : 'Still working — large documents can take a minute or two…'}
            </p>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
