import { QuizClient } from '@/components/quiz-client';

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <header className="text-center mb-8 md:mb-12">
        <h1 className="text-4xl md:text-5xl font-bold font-headline text-primary">Quizify</h1>
        <p className="text-muted-foreground mt-2 md:text-lg">
          Turn your lecture notes into an interactive quiz instantly.
        </p>
      </header>
      <div className="max-w-4xl mx-auto">
        <QuizClient />
      </div>
    </main>
  );
}
