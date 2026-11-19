-- Addresses the advisor INFO on the quiz_attempts_quiz_id_fkey foreign key:
-- the referencing column had no supporting index. A covering index keyed on
-- quiz_id serves the foreign-key lookup path (including ON DELETE SET NULL),
-- and carries device_id and created_at so common per-quiz reads can be
-- answered from the index without a heap fetch.

create index if not exists quiz_attempts_quiz_id_covering_idx
  on public.quiz_attempts (quiz_id)
  include (device_id, created_at);
