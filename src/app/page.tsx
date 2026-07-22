'use client';

import { useState } from 'react';
import { QuizClient } from '@/components/quiz-client';
import { cn } from '@/lib/utils';

export default function Home() {
  const [hasQuiz, setHasQuiz] = useState(false);

  return (
    <main className={cn(
      "flex-1 flex flex-col transition-all duration-300",
      hasQuiz ? "min-h-screen overflow-y-auto" : "h-screen overflow-hidden"
    )}>
      <div className={cn(
        "container mx-auto max-w-5xl px-4 sm:px-6 flex flex-col flex-1 py-6",
        hasQuiz ? "min-h-screen" : "overflow-hidden"
      )}>
        
        {/* Hero Section */}
        <header className="text-center flex flex-col items-center shrink-0 mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-foreground">
            Quizify
          </h1>

          <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Turn your lecture notes into an interactive quiz instantly. AI-powered, delightful, and ready to help you learn.
          </p>
        </header>

        {/* Main Quiz Generator */}
        <div id="setup" className="mx-auto w-full max-w-4xl flex-1">
          <QuizClient onQuizStateChange={setHasQuiz} />
        </div>

      </div>
    </main>
  );
}

