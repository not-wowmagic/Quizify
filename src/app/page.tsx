import { QuizClient } from '@/components/quiz-client';

export default function Home() {
  return (
    <main className="flex-1 flex flex-col h-[calc(100vh-0px)] overflow-hidden">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 flex flex-col flex-1 overflow-hidden py-6">
        
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
          <QuizClient />
        </div>

      </div>
    </main>
  );
}
