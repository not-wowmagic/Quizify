'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'quizify-theme';
type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    setMounted(true);
  }, []);

  const toggle = () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still applies for this visit if storage is unavailable.
    }
  };

  return (
    <button
      type="button"
      className="quizify-theme-toggle"
      onClick={toggle}
      aria-label="Toggle color theme"
      aria-pressed={mounted ? theme === 'dark' : undefined}
    >
      <Sun className="quizify-theme-icon quizify-theme-icon-sun" aria-hidden="true" />
      <Moon className="quizify-theme-icon quizify-theme-icon-moon" aria-hidden="true" />
      <span className="quizify-theme-label" aria-hidden="true">
        <span className="quizify-theme-label-light">Light</span>
        <span className="quizify-theme-label-dark">Dark</span>
      </span>
    </button>
  );
}
