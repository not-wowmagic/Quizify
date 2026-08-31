'use client';

// src/components/quiz/quiz-setup.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { extractFromWebUrl, extractTextFromImageAction } from '@/app/actions';
import { sanitizeText } from '@/lib/sanitize';
import {
  Loader2, Upload, Lightbulb, FileText,
  Sparkles, CircleDot, CheckSquare, Edit3, Link as LinkIcon, Shuffle, Lock,
  Globe, Camera, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGES } from '@/lib/languages';
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
  language: string;
  onLanguageChange: (value: string) => void;
  isLoading: boolean;
  fileName: string;
  onSourceTitleChange: (value: string) => void;
  currentQuote: string;
  /** Seconds since loading started, used to show "still working" hints. */
  elapsedSec: number;
  onFileSelected: (file: File) => void;
  onGenerate: () => void;
  turnstileSiteKey?: string;
  onTurnstileToken: (token: string | null) => void;
  /** Incognito mode with no history saved and server cache bypassed. */
  incognito?: boolean;
  onIncognitoChange?: (value: boolean) => void;
}

const QUESTION_TYPES: Array<{ id: QuestionTypeId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'multiple_choice', label: 'Multiple Choice', icon: CircleDot },
  { id: 'true_false', label: 'True / False', icon: CheckSquare },
  { id: 'fill_in_the_blank', label: 'Fill in Blank', icon: Edit3 },
  { id: 'matching', label: 'Matching Pairs', icon: LinkIcon },
  { id: 'situational', label: 'Situational', icon: Lightbulb },
  { id: 'mixed', label: 'Mixed Types', icon: Shuffle },
];

const clampCount = (value: number) => Math.min(50, Math.max(1, value));

export function QuizSetup({
  lectureText,
  onLectureTextChange,
  numQuestions,
  onNumQuestionsChange,
  difficulty,
  onDifficultyChange,
  questionType,
  onQuestionTypeChange,
  language,
  onLanguageChange,
  isLoading,
  fileName,
  onSourceTitleChange,
  currentQuote,
  elapsedSec,
  onFileSelected,
  onGenerate,
  turnstileSiteKey,
  onTurnstileToken,
  incognito = false,
  onIncognitoChange,
}: QuizSetupProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCustomCount, setIsCustomCount] = useState(false);
  const [customCount, setCustomCount] = useState('10');

  // Web URL extraction state
  const [webUrl, setWebUrl] = useState('');
  const [isWebFetching, setIsWebFetching] = useState(false);
  const [webStatus, setWebStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Camera OCR state
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [isOcrExtracting, setIsOcrExtracting] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleWebFetch = async () => {
    const url = webUrl.trim();
    if (!url || isWebFetching) return;
    setIsWebFetching(true);
    setWebStatus(null);
    try {
      const result = await extractFromWebUrl(url);
      if ('error' in result) {
        setWebStatus({ ok: false, message: result.error });
        return;
      }
      // Article extraction runs in the browser (DOMParser + readability) so the
      // server never needs jsdom, which is not Netlify-compatible.
      const { Readability } = await import('@mozilla/readability');
      const doc = new DOMParser().parseFromString(result.html, 'text/html');
      const article = new Readability(doc).parse();
      if (!article) {
        setWebStatus({ ok: false, message: 'Could not extract readable content from that page. It may be a paywall, a PDF, or a non-article page. Try pasting the text instead.' });
        return;
      }
      const text = sanitizeText((article.textContent ?? '').replace(/\s+/g, ' ').trim());
      if (text.length < 100) {
        setWebStatus({ ok: false, message: 'That page contains too little readable text. Try pasting the text instead.' });
        return;
      }
      onLectureTextChange(text);
      onSourceTitleChange(article.title?.trim() ?? '');
      setWebStatus({ ok: true, message: `Extracted ${text.length.toLocaleString()} characters${article.title?.trim() ? ` (from "${article.title.trim()}")` : ''}. Ready to generate!` });
    } catch {
      setWebStatus({ ok: false, message: 'Something went wrong. Please try again.' });
    } finally {
      setIsWebFetching(false);
    }
  };

  /** Downsizes the photo client-side (canvas) to keep the OCR payload small. */
  const downscaleImage = async (file: File, maxDim = 1600, quality = 0.85): Promise<string> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      // SAFETY: readAsDataURL always resolves to a string data URL; the
      // FileReader API documents `result` as string for the readAsDataURL path.
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read the image.'));
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to decode the image.'));
      i.src = dataUrl;
    });
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  const handleCameraFile = async (file: File) => {
    if (!file || isOcrExtracting) return;
    setOcrStatus(null);
    // Mirror the server-side check (actions.ts) so non-images fail fast with
    // the same message instead of an image-decode error from downscaleImage.
    if (!file.type.startsWith('image/')) {
      setOcrStatus({ ok: false, message: 'Unsupported image format. Use PNG, JPEG, or WebP.' });
      return;
    }
    try {
      const downscaled = await downscaleImage(file);
      setOcrPreview(downscaled);
      setIsOcrExtracting(true);
      const result = await extractTextFromImageAction({ imageDataUrl: downscaled });
      if ('error' in result) {
        setOcrStatus({ ok: false, message: result.error });
      } else {
        onLectureTextChange(result.text);
        setOcrStatus({ ok: true, message: `Extracted ${result.text.length.toLocaleString()} characters from the photo. Ready to generate!` });
      }
    } catch {
      setOcrStatus({ ok: false, message: 'Could not process that image. Try another photo.' });
    } finally {
      setIsOcrExtracting(false);
    }
  };

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
    <Card className="surface-card quizify-setup-card border-border/80 bg-card p-4 md:p-6 shadow-sm">
      <CardHeader className="quizify-setup-header p-0 pb-4">
        <div>
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">Configure Quiz</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Import study material and select your desired question parameters.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="quizify-setup-content p-0 space-y-4">
        {/* Input Selection Tabs */}
        <Tabs defaultValue="upload" className="quizify-source-workbench w-full">
          <TabsList className="quizify-source-tabs grid w-full grid-cols-2 sm:grid-cols-4" aria-label="Choose study material source">
            <TabsTrigger value="upload" className="quizify-source-tab">
              <Upload className="quizify-source-tab-icon" aria-hidden="true" />
              <span>Upload</span>
            </TabsTrigger>
            <TabsTrigger value="paste" className="quizify-source-tab">
              <FileText className="quizify-source-tab-icon" aria-hidden="true" />
              <span>Paste</span>
            </TabsTrigger>
            <TabsTrigger value="web" className="quizify-source-tab">
              <Globe className="quizify-source-tab-icon" aria-hidden="true" />
              <span>Web</span>
            </TabsTrigger>
            <TabsTrigger value="camera" className="quizify-source-tab">
              <Camera className="quizify-source-tab-icon" aria-hidden="true" />
              <span>Camera</span>
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
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary max-w-full min-w-0">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{fileName}</span>
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

          <TabsContent value="web" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="url"
                    value={webUrl}
                    onChange={e => setWebUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleWebFetch(); }}
                    placeholder="https://en.wikipedia.org/wiki/…"
                    disabled={isLoading || isWebFetching}
                    aria-label="Article URL"
                    className="w-full rounded-lg border border-border/80 bg-background pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <Button
                  onClick={() => void handleWebFetch()}
                  disabled={isLoading || isWebFetching || !webUrl.trim()}
                  className="h-10 px-4 shrink-0"
                >
                  {isWebFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
                  {isWebFetching ? 'Fetching…' : 'Fetch'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Read clean article text from Wikipedia, blogs, docs, and papers. Ads, navbars, and cookie banners are stripped.
              </p>
              {webStatus && (
                <p className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  webStatus.ok ? "text-emerald-500" : "text-destructive"
                )} role="status" aria-live="polite">
                  {webStatus.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {webStatus.message}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="camera" className="mt-4">
            <div className="space-y-3">
              <label
                htmlFor="camera-file"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border/80 rounded-xl cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors text-center px-4"
              >
                <div className="flex flex-col items-center justify-center">
                  <div className="p-2 rounded-full bg-amber-500/10 text-amber-500 mb-2">
                    <Camera className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    <span className="text-primary font-bold">Snap a photo</span> of notes or a textbook page
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Opens your camera on mobile · or choose an image
                  </p>
                </div>
                <input
                  id="camera-file"
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  disabled={isLoading || isOcrExtracting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleCameraFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {ocrPreview && (
                <div className="flex items-center gap-3">
                  {/* SAFETY: preview renders a user-chosen local data URL; the
                      image is never uploaded elsewhere; only the OCR action sees it */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ocrPreview} alt="Captured notes preview" className="h-16 w-16 rounded-lg object-cover border border-border/80" />
                  <p className="text-xs text-muted-foreground">
                    {isOcrExtracting ? 'Reading the photo…' : 'Photo ready to scan.'}
                  </p>
                </div>
              )}
              {ocrStatus && (
                <p className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  ocrStatus.ok ? "text-emerald-500" : "text-destructive"
                )} role="status" aria-live="polite">
                  {ocrStatus.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {ocrStatus.message}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Parameters Grid */}
        <div className="quizify-parameter-panel space-y-4 pt-3 border-t border-border/60">
          <div className="quizify-control-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Number of Questions */}
            <div className="quizify-count-field space-y-2">
              <label htmlFor="quiz-question-count" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Number of Questions</label>
              <select
                id="quiz-question-count"
                value={isCustomCount ? 'custom' : String(numQuestions)}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'custom') {
                    setIsCustomCount(true);
                    onNumQuestionsChange(clampCount(parseInt(customCount, 10) || 10));
                    return;
                  }
                  setIsCustomCount(false);
                  onNumQuestionsChange(Number(value));
                }}
                disabled={isLoading}
                className="w-full h-9 rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-2"
              >
                {[5, 10, 15, 20].map((num) => (
                  <option key={num} value={num}>{num} questions</option>
                ))}
                <option value="custom">Custom amount</option>
              </select>
              {isCustomCount && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={customCount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomCount(value);
                      const parsed = parseInt(value, 10);
                      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 50) {
                        onNumQuestionsChange(parsed);
                      }
                    }}
                    onBlur={() => setCustomCount(String(clampCount(Number.isNaN(parseInt(customCount, 10)) ? 10 : parseInt(customCount, 10))))}
                    disabled={isLoading}
                    aria-label="Custom number of questions"
                    className="w-24 h-9 rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-2"
                  />
                  <span className="text-xs text-muted-foreground">between 1 and 50</span>
                </div>
              )}
            </div>

            {/* Difficulty Level */}
            <div className="quizify-difficulty-field space-y-2">
              <label htmlFor="quiz-difficulty" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Difficulty Level
              </label>
              <select
                id="quiz-difficulty"
                value={difficulty}
                onChange={(e) => {
                  // SAFETY: this controlled select only renders the Difficulty union values above.
                  onDifficultyChange(e.target.value as Difficulty);
                }}
                disabled={isLoading}
                className="w-full h-9 rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-2"
              >
                {(['easy', 'medium', 'hard', 'adaptive'] as const).map((diff) => (
                  <option key={diff} value={diff}>
                    {diff[0].toUpperCase() + diff.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="quizify-language-field space-y-2">
              <label htmlFor="quiz-language" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Language</label>
              <select
                id="quiz-language"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                disabled={isLoading}
                className="w-full h-9 rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-2"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Question Types Grid Tile */}
          <div className="quizify-format-field space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question Format</label>
            <div className="quizify-question-formats grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
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
                      "quizify-question-format rounded-lg p-2 border flex flex-col items-center justify-center gap-1.5 transition-all duration-200 text-center text-xs font-medium",
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

      <CardFooter className="quizify-setup-footer p-0 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 mt-4">
        <p className="text-xs italic text-muted-foreground text-center sm:text-left max-w-sm" aria-live="polite">
          {currentQuote ? `“${currentQuote}”` : ''}
        </p>
        <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
          {turnstileSiteKey && (
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          )}
          {onIncognitoChange && (
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={incognito}
                onClick={() => onIncognitoChange(!incognito)}
                disabled={isLoading}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  incognito ? "bg-[#66c9ed]" : "bg-[#507190]"
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-[#193f66] transition-transform",
                  incognito ? "translate-x-[18px]" : "translate-x-[3px]"
                )} />
              </button>
              <Lock className="h-3.5 w-3.5" />
              Incognito Mode
              <span className="text-[11px] text-muted-foreground/70">no history saved</span>
            </label>
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
                ? 'Taking longer than usual. The AI service may be busy. Hang tight…'
                : 'Still working. Large documents can take a minute or two…'}
            </p>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
