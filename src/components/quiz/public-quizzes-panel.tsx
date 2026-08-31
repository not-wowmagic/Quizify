'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPublicQuizzes, type PublicQuizSummary } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Globe2, RotateCcw } from 'lucide-react';

export function PublicQuizzesPanel({ active = false }: { active?: boolean }) {
  const [quizzes, setQuizzes] = useState<PublicQuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setError(null);
    const result = await getPublicQuizzes();
    if ('error' in result) {
      setQuizzes(null);
      setError(result.error);
      return;
    }
    setQuizzes(result);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Loading external public-quiz data when the tab becomes active
    if (active) void load();
  }, [active, load]);

  if (error) {
    return (
      <Card className="surface-card border-border/80 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()} className="mt-4">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again
        </Button>
      </Card>
    );
  }

  if (!quizzes) {
    return (
      <Card className="surface-card border-border/80 bg-card p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading Public Quizzes…</p>
      </Card>
    );
  }

  if (quizzes.length === 0) {
    return (
      <Card className="surface-card border-border/80 bg-card p-10 text-center">
        <Globe2 className="mx-auto h-8 w-8 text-primary" />
        <h3 className="mt-4 text-lg font-bold text-foreground">No public quizzes yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Public quizzes will appear here when someone chooses to list one.</p>
      </Card>
    );
  }

  return (
    <div className="quizify-public-panel grid gap-4 sm:grid-cols-2">
      {quizzes.map(quiz => (
        <Card key={quiz.slug} className="surface-card border-border/80 bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-foreground">{quiz.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {quiz.numQuestions} questions
                {quiz.difficulty ? ` · ${quiz.difficulty}` : ''}
                {quiz.questionType ? ` · ${quiz.questionType.replaceAll('_', ' ')}` : ''}
                {quiz.language ? ` · ${quiz.language}` : ''}
              </p>
            </div>
            <Globe2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Published {new Date(quiz.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </p>
          <Button className="mt-4 w-full" onClick={() => router.push(`/q/${quiz.slug}`)} aria-label={`Take Quiz: ${quiz.title}`}>
            Take Quiz
          </Button>
        </Card>
      ))}
    </div>
  );
}
