'use client';

import { useState } from 'react';
import type { Quiz } from '@/types/quiz';
import { QuizClient } from '@/components/quiz-client';
import { HistoryPanel } from '@/components/quiz/history-panel';
import { PublicQuizzesPanel } from '@/components/quiz/public-quizzes-panel';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { cn } from '@/lib/utils';
import { Sparkles, WifiOff } from 'lucide-react';

type View = 'setup' | 'history' | 'public';

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
    <main className={cn(
      'quizify-shell',
      'quizify-shell--meadow',
      'quizify-shell--frosted',
      'quizify-layout--meadow',
      hasQuiz && 'quizify-shell--active',
    )} data-style="meadow" data-layout="meadow">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="quizify-offline fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Offline Mode
        </div>
      )}
      <div className="quizify-frame">
        <header className="quizify-topbar">
          <h1 className="quizify-brand-heading">
            <a className="quizify-brand" href="#top" aria-label="Quizify home">
              <span className="quizify-brand-mark" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
              <span>Quizify</span>
            </a>
          </h1>
        </header>

        <div id="top" className="quizify-content">
          <section className="quizify-hero" aria-labelledby="quizify-heading">
            <h2 id="quizify-heading">
              <span className="quizify-hero-line quizify-hero-line--lead">Turn study material into</span>
              <span className="quizify-hero-line quizify-hero-accent">momentum.</span>
            </h2>
          </section>

          <nav className="quizify-view-nav" aria-label="Sections">
            <div className="quizify-view-tabs">
              <button
                onClick={() => setView('setup')}
                aria-pressed={view === 'setup'}
                className={cn('quizify-view-tab', view === 'setup' && 'is-active')}
              >
                New Quiz
              </button>
              <button
                onClick={() => setView('history')}
                aria-pressed={view === 'history'}
                className={cn('quizify-view-tab', view === 'history' && 'is-active')}
              >
                History &amp; Insights
              </button>
              <button
                onClick={() => setView('public')}
                aria-pressed={view === 'public'}
                className={cn('quizify-view-tab', view === 'public' && 'is-active')}
              >
                Public Quizzes
              </button>
            </div>
          </nav>

          {/* Main Quiz Generator, kept mounted so in-progress quizzes survive view switches */}
          <div id="setup" className={cn('quizify-workspace', view !== 'setup' && 'hidden')}>
            <QuizClient
              onQuizStateChange={setHasQuiz}
              retakeQuiz={retakeQuiz}
              onRetakeHandled={() => setRetakeQuiz(null)}
            />
          </div>

          {/* History & Analytics, kept mounted so its in-progress state survives
              view switches; it refreshes from the DB each time it becomes active */}
          <div id="history" className={cn('quizify-workspace', view !== 'history' && 'hidden')}>
            <HistoryPanel onRetake={handleRetake} active={view === 'history'} />
          </div>

          <div id="public-quizzes" className={cn('quizify-workspace', view !== 'public' && 'hidden')}>
            <PublicQuizzesPanel active={view === 'public'} />
          </div>

        </div>
      </div>
    </main>
  );
}
