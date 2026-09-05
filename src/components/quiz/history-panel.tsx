'use client';

// src/components/quiz/history-panel.tsx
// Quiz history + study insights (analytics) for the anonymous device id.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAttempts, deleteAttempt, publishQuiz } from '@/app/actions';
import { getDeviceId } from '@/lib/device-id';
import { buildAnkiTxt, buildQuizCsv, downloadTextFile, printQuiz, printCramSheet } from '@/lib/quiz-export';
import { trackQuizShared, trackQuizExported } from '@/lib/analytics';
import { ShareQrCard } from '@/components/quiz/share-qr';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LabelList,
} from 'recharts';
import {
  Loader2, Trash2, RotateCcw, Download, TrendingUp, Target, Flame, Trophy, BookOpen, Inbox, Search, Share2, FileText, Link2,
} from 'lucide-react';
import type { QuizAttempt } from '@/types/history';
import type { Quiz } from '@/types/quiz';
import { cn, formatTopicLabel } from '@/lib/utils';
import { normalizeQuizTitle } from '@/lib/quiz-title';

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  color: 'hsl(var(--foreground))',
} as const;

interface HistoryPanelProps {
  onRetake: (quiz: Quiz) => void;
  /** Whether the history view is currently visible; triggers a DB refresh. */
  active?: boolean;
}

export function HistoryPanel({ onRetake, active = false }: HistoryPanelProps) {
  const [attempts, setAttempts] = useState<QuizAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [publicVisibility, setPublicVisibility] = useState(false);
  const { toast } = useToast();

  // Search / filter / sort state for the attempt list
  const [query, setQuery] = useState('');
  const [scoreBand, setScoreBand] = useState<'all' | 'mastered' | 'review' | 'needs-work'>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');

  const filteredAttempts = useMemo(() => {
    if (!attempts) return null;

    const q = query.trim().toLowerCase();
    let list = attempts.filter(a => {
      if (q) {
        const titleMatch = a.title.toLowerCase().includes(q);
        const topicMatch = a.answers.some(ans => formatTopicLabel(ans.topic).toLowerCase().includes(q));
        if (!titleMatch && !topicMatch) return false;
      }
      const pct = (a.score / a.total) * 100;
      if (scoreBand === 'mastered' && pct < 80) return false;
      if (scoreBand === 'review' && (pct < 50 || pct >= 80)) return false;
      if (scoreBand === 'needs-work' && pct >= 50) return false;
      if (formatFilter !== 'all' && a.question_type !== formatFilter) return false;
      return true;
    });

    list = [...list].sort((x, y) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(x.created_at).getTime() - new Date(y.created_at).getTime();
        case 'highest':
          return (y.score / y.total) - (x.score / x.total);
        case 'lowest':
          return (x.score / x.total) - (y.score / y.total);
        default:
          return new Date(y.created_at).getTime() - new Date(x.created_at).getTime();
      }
    });
    return list;
  }, [attempts, query, scoreBand, formatFilter, sortBy]);

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
    // The panel stays mounted while hidden; refetch every time it becomes
    // visible so newly completed quizzes show up without a full page reload.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetching on activation is an external-data subscription
    if (active) void load();
  }, [active, load]);

  const requestDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const handleDeleteConfirmed = async (id: string) => {
    setPendingDeleteId(null);
    setDeletingId(id);
    const result = await deleteAttempt(id, getDeviceId());
    setDeletingId(null);
    if ('error' in result) {
      toast({ title: 'Delete Failed', description: result.error, variant: 'destructive' });
      return;
    }
    setAttempts(prev => prev?.filter(a => a.id !== id) ?? null);
  };

  const handleExport = (attempt: QuizAttempt, format: 'anki' | 'csv' | 'print' | 'cram') => {
    const quiz: Quiz = { questions: attempt.questions ?? [] };
      const displayTitle = normalizeQuizTitle(attempt.title);
      const base = displayTitle.replace(/[^\w\- ]/g, '').trim() || 'quiz';
    trackQuizExported(format);

    if (format === 'csv') {
      downloadTextFile(`${base}.csv`, buildQuizCsv(quiz), 'text/csv');
      return;
    }
    if (format === 'print') {
      printQuiz(quiz, displayTitle);
      return;
    }
    if (format === 'cram') {
      printCramSheet(quiz, displayTitle);
      return;
    }
    downloadTextFile(`${base}-anki.txt`, buildAnkiTxt(quiz));
    toast({ title: 'Exported', description: 'Anki deck downloaded. Import it in Anki (File ▸ Import).' });
  };

  const handleShare = async (attempt: QuizAttempt) => {
    setSharingId(attempt.id);
    try {
      const result = await publishQuiz({
        questions: attempt.questions ?? [],
        title: normalizeQuizTitle(attempt.title),
        difficulty: attempt.difficulty ?? undefined,
        questionType: attempt.question_type ?? undefined,
        language: attempt.language ?? undefined,
        visibility: publicVisibility ? 'public' : 'unlisted',
      });

      if ('error' in result) {
        toast({ title: 'Share Failed', description: result.error, variant: 'destructive' });
        return;
      }

      const url = `${window.location.origin}${result.url}`;
      trackQuizShared(result.slug);
      setSharedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // The QR share card remains available with its own copy action.
      }
    } catch {
      toast({ title: 'Share Failed', description: 'Could not publish the quiz. Please try again.', variant: 'destructive' });
    } finally {
      setSharingId(null);
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
        const label = formatTopicLabel(ans.topic);
        const entry = topicMap.get(label) ?? { correct: 0, total: 0 };
        entry.total++;
        if (ans.correct) entry.correct++;
        topicMap.set(label, entry);
      }
    }
    const topicData = [...topicMap.entries()]
      .map(([topic, v]) => {
        const accuracy = Math.round((v.correct / v.total) * 100);
        const mastery = accuracy >= 80 ? 'Mastered' : accuracy >= 60 ? 'Improving' : 'Needs Review';
        return { topic, accuracy, mastery };
      })
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
    <div className="quizify-history-panel space-y-6">
      {sharedUrl && <ShareQrCard url={sharedUrl} onClose={() => setSharedUrl(null)} />}
      {/* Insights */}
      {stats && (
        <div className="space-y-6">
          <DailyGoalCard attempts={attempts} />
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
              <MeasuredChart className="h-48">
                <LineChart data={stats.trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--foreground) / 0.14)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: '#194873', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#194873', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: 'hsl(var(--foreground))' }} formatter={(value) => [`${value}%`, 'Score']} />
                  <Line type="monotone" dataKey="pct" stroke="#194873" strokeWidth={2} dot={{ r: 3, fill: '#194873' }} />
                </LineChart>
              </MeasuredChart>
            </Card>
          )}

          {stats.topicData.length > 0 && (
            <Card className="surface-card border-border/80 bg-card p-5">
              <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Topic Accuracy <span className="text-xs font-normal text-muted-foreground">(weakest first)</span>
              </h4>
              <MeasuredChart className="h-48">
                <BarChart data={stats.topicData} layout="vertical" margin={{ top: 0, right: 104, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--foreground) / 0.14)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#194873', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="topic" width={130} tick={{ fill: '#194873', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: 'hsl(var(--foreground))' }} formatter={(value) => [`${value}%`, 'Accuracy']} />
                  <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} barSize={16}>
                    {stats.topicData.map((entry) => (
                      <Cell key={entry.topic} fill={entry.accuracy < 60 ? '#f87171' : entry.accuracy < 80 ? '#fbbf24' : '#34d399'} />
                    ))}
                    <LabelList
                      dataKey="mastery"
                      position="right"
                      offset={10}
                      style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </MeasuredChart>
              <p className="text-xs text-muted-foreground mt-3">
                You&rsquo;re weakest in: <span className="font-semibold text-foreground">{stats.topicData[0].topic}</span>. Consider practicing quizzes on this topic.
              </p>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">{totalQuestionsAnswered} questions answered in total.</p>
        </div>
      )}

      {/* Attempt list */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-foreground">Past Quizzes</h4>
          <span className="text-xs text-muted-foreground">
            {filteredAttempts ? `${filteredAttempts.length} of ${attempts.length}` : ''}
          </span>
        </div>
        <label className="inline-flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={publicVisibility}
            onChange={event => setPublicVisibility(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary"
          />
          <span>
            <span className="font-medium text-foreground">List shared quizzes in Public Quizzes</span>
            <span className="block">Unchecked shares remain available only to people with the link.</span>
          </span>
        </label>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by title or topic…"
              aria-label="Search history"
              className="w-full rounded-lg border border-border/80 bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={scoreBand}
            onChange={e => {
              const v = e.target.value;
              // SAFETY: <option> values are hardcoded to exactly these four
              // literals, so the membership check keeps the union sound.
              if (v === 'all' || v === 'mastered' || v === 'review' || v === 'needs-work') {
                setScoreBand(v);
              }
            }}
            aria-label="Filter by score"
            className="rounded-lg border border-border/80 bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">Any score</option>
            <option value="mastered">Mastered (80–100%)</option>
            <option value="review">Review (50–79%)</option>
            <option value="needs-work">Needs work (&lt;50%)</option>
          </select>
          <select
            value={formatFilter}
            onChange={e => setFormatFilter(e.target.value)}
            aria-label="Filter by format"
            className="rounded-lg border border-border/80 bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">Any format</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="matching">Matching</option>
            <option value="mixed">Mixed</option>
            <option value="situational">Situational</option>
            <option value="fill_in_the_blank">Fill in the blank</option>
            <option value="true_false">True / False</option>
          </select>
          <select
            value={sortBy}
            onChange={e => {
              const v = e.target.value;
              // SAFETY: <option> values are hardcoded to exactly these four
              // literals, so the membership check keeps the union sound.
              if (v === 'newest' || v === 'oldest' || v === 'highest' || v === 'lowest') {
                setSortBy(v);
              }
            }}
            aria-label="Sort attempts"
            className="rounded-lg border border-border/80 bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest score</option>
            <option value="lowest">Lowest score</option>
          </select>
        </div>

        {filteredAttempts?.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No attempts match your filters.</p>
        )}

        {filteredAttempts?.map((attempt) => {
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
                  <h5 className="text-sm font-semibold text-foreground truncate">{normalizeQuizTitle(attempt.title)}</h5>
                  {attempt.quiz_id && <span className="badge border-primary/30 bg-primary/10 text-primary text-[10px]">Shared Quiz</span>}
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

              {pendingDeleteId === attempt.id ? (
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs" role="alert">
                  <span className="text-muted-foreground">Delete this attempt?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => void handleDeleteConfirmed(attempt.id)}
                    disabled={deletingId === attempt.id}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 border-border/80 text-xs"
                    onClick={() => setPendingDeleteId(null)}
                    disabled={deletingId === attempt.id}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 border-border/80 text-xs font-medium"
                  onClick={() => onRetake({ questions: attempt.questions ?? [], title: attempt.title })}
                  title="Retake this quiz with a fresh shuffle"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retake
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 border-border/80 text-xs font-medium"
                  onClick={() => void handleShare(attempt)}
                  disabled={sharingId === attempt.id}
                  title="Share this quiz"
                >
                  {sharingId === attempt.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Share2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  Share
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 border-border/80 text-xs font-medium"
                      title="Export quiz"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => handleExport(attempt, 'anki')}>
                      <Link2 className="mr-2 h-4 w-4" /> Anki (.txt)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(attempt, 'csv')}>
                      <FileText className="mr-2 h-4 w-4" /> CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(attempt, 'print')}>
                      <FileText className="mr-2 h-4 w-4" /> Print / PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(attempt, 'cram')}>
                      <FileText className="mr-2 h-4 w-4" /> Study Cram Sheet
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  onClick={() => requestDelete(attempt.id)}
                  disabled={deletingId === attempt.id}
                  title="Delete this attempt"
                  aria-label={`Delete ${normalizeQuizTitle(attempt.title)}`}
                >
                  {deletingId === attempt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
              )}
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

const GOAL_KEY = 'quizify_daily_goal';

/**
 * Renders recharts charts only once their container has a real size.
 * The history panel stays mounted while hidden (display: none), which makes
 * ResponsiveContainer measure 0×0 and spam warnings / render broken charts.
 * A ResizeObserver re-renders the chart as soon as the panel becomes visible.
 */
function MeasuredChart({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasSize, setHasSize] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only mount the chart while the container actually has size. The history
    // panel stays mounted while hidden (display: none), which would otherwise
    // make ResponsiveContainer measure 0x0 and spam warnings / render broken
    // charts; track size in both directions so hiding unmounts the chart.
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setHasSize(rect.width > 0 && rect.height > 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('min-w-0', className)}>
      {hasSize && <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}
    </div>
  );
}

/** Daily question goal: setter, progress ring, and a 7-day activity heatmap. */
function DailyGoalCard({ attempts }: { attempts: QuizAttempt[] }) {
  const [goal, setGoal] = useState<number>(0);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(GOAL_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrating the goal from localStorage is an external-data subscription
    setGoal(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  }, []);

  const dayProgress = useMemo(() => {
    const today = new Date();
    const dayKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const perDay = new Map<number, number>();
    for (const a of attempts) {
      const key = dayKey(new Date(a.created_at));
      perDay.set(key, (perDay.get(key) ?? 0) + a.total);
    }
    const days: { key: number; date: Date; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      days.push({ key: dayKey(d), date: d, count: perDay.get(dayKey(d)) ?? 0 });
    }
    const todayCount = days[days.length - 1].count;
    const percent = goal > 0 ? Math.min(100, Math.round((todayCount / goal) * 100)) : 0;
    return { days, todayCount, percent };
  }, [attempts, goal]);

  const saveGoal = () => {
    const parsed = parseInt(input, 10);
    const next = Number.isFinite(parsed) && parsed > 0 ? Math.min(500, parsed) : 0;
    setGoal(next);
    if (next > 0) localStorage.setItem(GOAL_KEY, String(next));
    else localStorage.removeItem(GOAL_KEY);
    setEditing(false);
  };

  // GitHub-style intensity buckets (relative to the goal)
  const intensity = (count: number): string => {
    if (count === 0) return 'bg-muted/20 border-border/50';
    if (goal === 0 || count >= goal) return 'bg-emerald-500 border-emerald-600';
    const ratio = count / goal;
    if (ratio >= 0.75) return 'bg-emerald-500/80 border-emerald-600/80';
    if (ratio >= 0.5) return 'bg-emerald-500/60 border-emerald-600/60';
    if (ratio >= 0.25) return 'bg-emerald-500/40 border-emerald-600/40';
    return 'bg-emerald-500/25 border-emerald-600/30';
  };

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (dayProgress.percent / 100) * ringCircumference;

  return (
    <Card className="surface-card border-border/80 bg-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-500" /> Daily Goal
        </h4>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveGoal(); }}
              autoFocus
              aria-label="Daily question goal"
              className="w-24 h-8 rounded-lg border border-border/60 bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button size="sm" className="h-8 px-2.5 text-xs" onClick={saveGoal}>Save</Button>
            <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs border-border/80 font-medium" onClick={() => { setInput(String(goal || 10)); setEditing(true); }}>
            <Target className="mr-1 h-3.5 w-3.5" /> {goal > 0 ? `Goal: ${goal}/day` : 'Set daily goal'}
          </Button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-5 flex-wrap">
        {/* Progress ring */}
        <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`${dayProgress.percent}% of daily goal`}>
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r={ringRadius} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
            <circle
              cx="32" cy="32" r={ringRadius} fill="none"
              stroke="var(--emerald, #34d399)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-extrabold text-foreground">{dayProgress.percent}%</span>
          </div>
        </div>

        {/* Heatmap */}
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-end gap-1.5">
            {dayProgress.days.map(d => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                <span
                  title={`${d.count} questions`}
                  className={cn('h-7 w-full rounded-md border', intensity(d.count))}
                />
                <span className="text-[10px] text-muted-foreground">
                  {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {goal > 0
              ? `${dayProgress.todayCount} of ${goal} questions today${goal > 0 && dayProgress.percent >= 100 ? ' (goal met)' : ''}`
              : `${dayProgress.todayCount} questions answered today`}
          </p>
        </div>
      </div>
    </Card>
  );
}
