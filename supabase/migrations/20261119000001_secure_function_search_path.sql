-- Addresses the Supabase advisor WARN "function_search_path_mutable" for
-- public.enforce_attempt_limits. With a mutable search_path, an unqualified
-- object name in a function body could resolve to an attacker-controlled
-- object at call time. Pinning search_path to the empty string removes that
-- ambiguity. The function is safe under an empty search_path: its table
-- reference is schema-qualified (public.quiz_attempts), and its builtins
-- (pg_advisory_xact_lock, hashtextextended, pg_column_size) live in pg_catalog,
-- which PostgreSQL always searches regardless of search_path.

alter function public.enforce_attempt_limits() set search_path = '';
