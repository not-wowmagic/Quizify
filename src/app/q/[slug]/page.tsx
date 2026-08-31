import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSharedQuiz } from '@/app/actions';
import { SharedQuizClient } from '@/components/quiz/shared-quiz-client';

interface SharedQuizPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: SharedQuizPageProps): Promise<Metadata> {
  const { slug } = await params;
  const quiz = await getSharedQuiz(slug);
  return {
    title: quiz ? quiz.title : 'Quiz not found',
    description: 'A shared quiz generated with Quizify. Open the link to practice.',
    alternates: {
      canonical: `/q/${slug}`,
    },
    robots: { index: false, follow: true },
  };
}

export default async function SharedQuizPage({ params }: SharedQuizPageProps) {
  const { slug } = await params;
  const quiz = await getSharedQuiz(slug);
  if (!quiz || quiz.questions.length === 0) notFound();

  return (
    <main className="quizify-shell quizify-shell--meadow quizify-shell--frosted quizify-shared-shell" data-style="meadow">
      <div className="quizify-frame">
        <div className="w-full max-w-4xl mx-auto">
          <SharedQuizClient quiz={quiz} />
        </div>
      </div>
    </main>
  );
}
