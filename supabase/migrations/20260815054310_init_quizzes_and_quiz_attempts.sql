-- Quizify: initial schema for shareable quizzes and quiz history.
-- All access is server-side via the service role key; anon/authenticated have
-- no policies, so RLS denies everything through the Data API (defense in depth).

-- =========================================
-- Shareable quizzes (/q/<slug>)
-- =========================================

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null default 'Untitled Quiz',
  questions jsonb not null,
  summary text,
  num_questions integer not null,
  difficulty text,
  question_type text,
  language text not null default 'English',
  created_at timestamptz not null default now()
);

-- =========================================
-- Quiz attempts (anonymous device-based history)
-- =========================================

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  quiz_id uuid references public.quizzes (id) on delete set null,
  title text not null default 'Untitled Quiz',
  score integer not null,
  total integer not null,
  questions jsonb not null default '[]',
  answers jsonb not null default '[]',
  difficulty text,
  question_type text,
  language text not null default 'English',
  duration_sec integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_device_created_idx
  on public.quiz_attempts (device_id, created_at desc);

-- =========================================
-- Row level security: enabled, no policies.
-- The app only talks to the DB through the service role (bypasses RLS);
-- leaving anon/authenticated without policies keeps the Data API locked down.
-- =========================================

alter table public.quizzes enable row level security;
alter table public.quiz_attempts enable row level security;
