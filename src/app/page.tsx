'use client';

import { useState } from 'react';
import type { Quiz } from '@/types/quiz';
import { QuizClient } from '@/components/quiz-client';
import { HistoryPanel } from '@/components/quiz/history-panel';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { cn } from '@/lib/utils';
import { History, Sparkles } from 'lucide-react';

type View = 'setup' | 'history';

export default function Home() {
  const [hasQuiz, setHasQuiz] = useState(false);
  const [view, setView] = useState<View>('setup');
  const [retakeQuiz, setRetakeQuiz] = useState<Quiz | null>(null);
  const isOnline = useOnlineStatus();

  const handleRetake = (quiz: Quiz) => {
    setRetakeQuiz(quiz);
    setView('setup');
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center min-h-screen py-8 px-4 sm:px-6">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-500"
        >
          📡 Offline Mode
        </div>
      )}
      <div className={cn(
        "w-full max-w-4xl flex flex-col items-center justify-center my-auto transition-all duration-300",
        hasQuiz ? "py-4" : "py-2"
      )}>

        {/* Hero Section */}
        <header className="text-center flex flex-col items-center shrink-0 mb-6">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-foreground">
            Quizify
          </h1>

          <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Turn your lecture notes into an interactive quiz instantly. AI-powered, delightful, and ready to help you learn.
          </p>

          {/* View Toggle */}
          <nav className="mt-5 inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card p-1" aria-label="Sections">
            <button
              onClick={() => setView('setup')}
              aria-pressed={view === 'setup'}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all",
                view === 'setup'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> New Quiz
            </button>
            <button
              onClick={() => setView('history')}
              aria-pressed={view === 'history'}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all",
                view === 'history'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <History className="h-3.5 w-3.5" /> History &amp; Insights
            </button>
          </nav>
        </header>

        {/* Main Quiz Generator, kept mounted so in-progress quizzes survive view switches */}
        <div id="setup" className={cn("w-full", view !== 'setup' && "hidden")}>
          <QuizClient
            onQuizStateChange={setHasQuiz}
            retakeQuiz={retakeQuiz}
            onRetakeHandled={() => setRetakeQuiz(null)}
          />
        </div>

        {/* History & Analytics, kept mounted so its in-progress state survives
            view switches; it refreshes from the DB each time it becomes active */}
        <div id="history" className={cn("w-full", view !== 'history' && "hidden")}>
          <HistoryPanel onRetake={handleRetake} active={view === 'history'} />
        </div>

      </div>
    </main>
  );
}
