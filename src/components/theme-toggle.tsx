'use client';

import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'quizify-theme';

export function ThemeToggle() {
  const toggle = () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
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
