'use client';

// src/components/quiz/history-panel.tsx
// Quiz history + study insights (analytics) for the anonymous device id.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAttempts, deleteAttempt } from '@/app/actions';
import { getDeviceId } from '@/lib/device-id';
import { buildAnkiTxt, buildQuizCsv, downloadTextFile } from '@/lib/quiz-export';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  Loader2, Trash2, RotateCcw, Download, TrendingUp, Target, Flame, Trophy, BookOpen, Inbox,
} from 'lucide-react';
import type { QuizAttempt } from '@/types/history';
import type { Quiz } from '@/types/quiz';
import { cn } from '@/lib/utils';

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  color: 'hsl(var(--foreground))',
} as const;

interface HistoryPanelProps {
  onRetake: (quiz: Quiz) => void;
}

export function HistoryPanel({ onRetake }: HistoryPanelProps) {
  const [attempts, setAttempts] = useState<QuizAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    const result = await getAttempts(getDeviceId());
    if ('error' in result) {
      setError(result.error);
      setAttempts(null);
      return;
    }
    setAttempts(result);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetching attempts on mount is an external-data subscription
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const result = await deleteAttempt(id, getDeviceId());
    setDeletingId(null);
    if ('error' in result) {
      toast({ title: 'Delete Failed', description: result.error, variant: 'destructive' });
      return;
    }
    setAttempts(prev => prev?.filter(a => a.id !== id) ?? null);
  };

  const handleExport = (attempt: QuizAttempt, format: 'anki' | 'csv') => {
    const quiz: Quiz = { questions: attempt.questions ?? [] };
    const base = attempt.title.replace(/[^\w\- ]/g, '').trim() || 'quiz';
    if (format === 'csv') {
      downloadTextFile(`${base}.csv`, buildQuizCsv(quiz), 'text/csv');
    } else {
      downloadTextFile(`${base}-anki.txt`, buildAnkiTxt(quiz));
    }
  };

  const stats = useMemo(() => {
    if (!attempts || attempts.length === 0) return null;

    const percentages = attempts.map(a => (a.score / a.total) * 100);
    const avg = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    const best = Math.max(...percentages);

    // Study streak: consecutive days (ending today or yesterday) with attempts
    const dayKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = new Set(attempts.map(a => dayKey(new Date(a.created_at))));
    let streak = 0;
    const today = dayKey(new Date());
    let cursor = days.has(today) ? today : today - 86_400_000;
    while (days.has(cursor)) {
      streak++;
      cursor -= 86_400_000;
    }

    // Score trend (chronological)
    const trend = [...attempts].reverse().map(a => ({
      name: new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      pct: Math.round((a.score / a.total) * 100),
    }));

    // Topic accuracy (weakest first)
    const topicMap = new Map<string, { correct: number; total: number }>();
    for (const a of attempts) {
      for (const ans of a.answers) {
        if (!ans.topic) continue;
        const entry = topicMap.get(ans.topic) ?? { correct: 0, total: 0 };
        entry.total++;
        if (ans.correct) entry.correct++;
        topicMap.set(ans.topic, entry);
      }
    }
    const topicData = [...topicMap.entries()]
      .map(([topic, v]) => ({ topic, accuracy: Math.round((v.correct / v.total) * 100) }))
      .sort((a, b) => a.accuracy - b.accuracy);

    return { avg, best, streak, trend, topicData };
  }, [attempts]);

  const totalQuizzes = attempts?.length ?? 0;
  const totalQuestionsAnswered = useMemo(
    () => attempts?.reduce((sum, a) => sum + a.total, 0) ?? 0,
    [attempts],
  );

  if (error) {
    return (
      <Card className="surface-card border-border/80 bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </Card>
    );
  }

  if (!attempts) {
    return (
      <Card className="surface-card border-border/80 bg-card p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-3">Loading history…</p>
      </Card>
    );
  }

  if (attempts.length === 0) {
    return (
      <Card className="surface-card border-border/80 bg-card p-10 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
          <Inbox className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground mt-4">No quizzes yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          Complete a quiz and it will be saved here so you can retake it, export it, or track your progress.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Insights */}
      {stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<BookOpen className="h-4 w-4" />} label="Quizzes" value={String(totalQuizzes)} />
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Avg Score" value={`${Math.round(stats.avg)}%`} />
            <StatCard icon={<Trophy className="h-4 w-4" />} label="Best Score" value={`${Math.round(stats.best)}%`} />
            <StatCard icon={<Flame className="h-4 w-4" />} label="Day Streak" value={String(stats.streak)} />
          </div>

          {stats.trend.length >= 2 && (
            <Card className="surface-card border-border/80 bg-card p-5">
              <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Score Trend
              </h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: 'hsl(var(--foreground))' }} formatter={(value) => [`${value}%`, 'Score']} />
                    <Line type="monotone" dataKey="pct" stroke="#6699CC" strokeWidth={2} dot={{ r: 3, fill: '#6699CC' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {stats.topicData.length > 0 && (
            <Card className="surface-card border-border/80 bg-card p-5">
              <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Topic Accuracy <span className="text-xs font-normal text-muted-foreground">(weakest first)</span>
              </h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topicData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="topic" width={130} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: 'hsl(var(--foreground))' }} formatter={(value) => [`${value}%`, 'Accuracy']} />
                    <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} barSize={16}>
                      {stats.topicData.map((entry) => (
                        <Cell key={entry.topic} fill={entry.accuracy < 60 ? '#f87171' : entry.accuracy < 80 ? '#fbbf24' : '#34d399'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">{totalQuestionsAnswered} questions answered in total.</p>
        </div>
      )}

      {/* Attempt list */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-foreground">Past Quizzes</h4>
        {attempts.map((attempt) => {
          const pct = Math.round((attempt.score / attempt.total) * 100);
          const meta = [
            attempt.difficulty,
            attempt.question_type?.replaceAll('_', ' '),
            attempt.language,
            attempt.duration_sec > 0 ? `${Math.round(attempt.duration_sec / 60)} min` : null,
          ].filter(Boolean).join(' · ');

          return (
            <Card key={attempt.id} className="surface-card border-border/80 bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h5 className="text-sm font-semibold text-foreground truncate">{attempt.title}</h5>
                  <span className={cn(
                    "badge text-xs font-semibold",
                    pct >= 80 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                      : pct >= 60 ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                        : "border-red-500/30 bg-red-500/10 text-red-500",
                  )}>
                    {pct}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(attempt.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  <span className="mx-1.5">·</span>
                  {attempt.score}/{attempt.total} correct
                  {meta ? <><span className="mx-1.5">·</span>{meta}</> : null}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 border-border/80 text-xs font-medium"
                  onClick={() => onRetake({ questions: attempt.questions ?? [] })}
                  title="Retake this quiz with a fresh shuffle"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retake
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 border-border/80 text-xs font-medium"
                  onClick={() => handleExport(attempt, 'anki')}
                  title="Export as Anki deck"
                >
                  <Download className="mr-1 h-3.5 w-3.5" /> Anki
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  onClick={() => handleDelete(attempt.id)}
                  disabled={deletingId === attempt.id}
                  title="Delete this attempt"
                >
                  {deletingId === attempt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="surface-card border-border/80 bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-foreground mt-1.5">{value}</p>
    </Card>
  );
}
