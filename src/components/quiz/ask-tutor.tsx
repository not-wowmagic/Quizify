'use client';

// src/components/quiz/ask-tutor.tsx
// Socratic "Ask Tutor" accordion shared by standard and matching question
// cards: quick-prompt chips + a custom question input. Controlled via
// `open` / `onToggle` so the parent can lay out the trigger button (e.g.
// alongside "Explain Answer" on the same row).
import { useState } from 'react';
import { askTutorFollowUp } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Loader2, Send, X, Lightbulb } from 'lucide-react';

interface AskTutorProps {
  question: string;
  /** Context string built by the parent card (correct answer, options, pairs). */
  context: string;
  /** Quick-prompt chips offered above the input. */
  chips?: string[];
  open: boolean;
  onToggle: () => void;
}

export function AskTutor({ question, context, chips = [], open, onToggle }: AskTutorProps) {
  const [input, setInput] = useState('');
  const [guidance, setGuidance] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const ask = async (userQuestion: string) => {
    const trimmed = userQuestion.trim();
    if (!trimmed || isLoading) return;
    setIsLoading(true);
    setGuidance('');
    try {
      const result = await askTutorFollowUp({ question, context, userQuestion: trimmed });
      if ('error' in result) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      } else {
        setGuidance(result.guidance);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to get guidance. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
      >
        {open ? <X className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
        {open ? 'Close Tutor' : 'Ask Tutor'}
      </button>

      {open && (
        <div className="mt-3 space-y-3 animate-in fade-in duration-200">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => { setInput(chip); void ask(chip); }}
                  disabled={isLoading}
                  className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              placeholder="Ask anything about this question…"
              maxLength={500}
              aria-label="Ask the tutor a question"
              className="flex-1 rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button
              size="sm"
              onClick={() => void ask(input)}
              disabled={isLoading || !input.trim()}
              className="h-9 px-3"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="sr-only">Send question</span>
            </Button>
          </div>

          <div aria-live="polite">
            {guidance && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed animate-in fade-in duration-200">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
                  <Lightbulb className="h-4 w-4" /> Tutor
                </div>
                <p className="text-foreground">{guidance}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
