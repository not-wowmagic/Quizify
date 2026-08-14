import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 text-center px-4">
      <p className="text-6xl font-extrabold tracking-tight text-foreground">404</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        This page wandered off. Head back and turn your notes into a quiz instead.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-10 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90"
      >
        Back to Quizify
      </Link>
    </main>
  );
}
