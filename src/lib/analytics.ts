// src/lib/analytics.ts
// Privacy-first analytics via Umami. Every function is a safe no-op when
// Umami is not loaded (script not configured or blocked).
//
// Contract: this module is only imported from 'use client' components, and
// track() is only ever called from event handlers and effects, never during
// SSR/render, so `window` is always defined at call time.

type TrackData = Record<string, string | number>;

function track(eventName: string, data?: TrackData): void {
  window.umami?.track(eventName, data);
}

export function trackQuizGenerated(data: {
  questionCount: number;
  difficulty: string;
  format: string;
  language: string;
}): void {
  track('quiz_generated', {
    question_count: data.questionCount,
    difficulty: data.difficulty,
    format: data.format,
    language: data.language,
  });
}

export function trackQuizCompleted(data: {
  score: number;
  total: number;
  percentage: number;
  durationSec: number;
}): void {
  track('quiz_completed', {
    score: data.score,
    total: data.total,
    percentage: Math.round(data.percentage),
    duration_sec: data.durationSec,
  });
}

export function trackQuizShared(slug: string): void {
  track('quiz_shared', { slug });
}

export function trackQuizExported(format: 'anki' | 'csv' | 'print' | 'cram'): void {
  track('quiz_exported', { format });
}

export function trackPracticeMissedStarted(missedCount: number): void {
  track('practice_missed_started', { missed_count: missedCount });
}
