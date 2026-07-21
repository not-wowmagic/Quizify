import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Quizify - AI-Powered Quiz Generator',
  description: 'Turn lecture notes, textbook excerpts, and study documents into interactive quizzes in seconds.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Floating Theme Toggle */}
          <div className="fixed top-4 right-4 z-50">
            <ThemeToggle />
          </div>

          {/* Main Content Body */}
          <div className="relative flex h-screen flex-col overflow-hidden">
            {children}
          </div>

          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
