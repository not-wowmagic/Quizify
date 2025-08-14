import { QuizClient } from '@/components/quiz-client';
import { Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12 min-h-screen flex flex-col justify-center items-center">
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 -z-10"></div>
      <header className="text-center mb-8 md:mb-12 flex flex-col items-center">
        <div className="p-3 mb-4 bg-primary/10 border border-primary/20 rounded-full">
            <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-headline text-foreground">Quizify</h1>
        <p className="text-muted-foreground mt-2 md:text-lg max-w-2xl">
          Turn your lecture notes into an interactive quiz instantly. AI-powered, delightful, and ready to help you learn.
        </p>
      </header>
      <div className="max-w-4xl mx-auto w-full">
        <QuizClient />
      </div>
    </main>
  );
}
