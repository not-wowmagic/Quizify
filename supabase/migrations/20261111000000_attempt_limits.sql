-- Enforce per-device attempt quotas and a per-row payload cap at the database
-- boundary. The application also checks these, but the service-role client
-- bypasses RLS, so a direct server-action call must still be stopped here.
--
-- The advisory lock serializes inserts for the same device, so two concurrent
-- requests cannot both observe a count below the cap and both insert.

create or replace function public.enforce_attempt_limits()
returns trigger
language plpgsql
as $$
declare
  existing_count integer;
  row_bytes integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.device_id, 0));

  select count(*) into existing_count
  from public.quiz_attempts
  where device_id = new.device_id;

  if existing_count >= 200 then
    raise exception 'attempt quota exceeded for device'
      using errcode = 'check_violation';
  end if;

  -- The cap covers the entire stored row, not just the jsonb text output.
  -- jsonb text undercounts binary/TOASTed storage badly (a 400 KB text array
  -- can be 800 KB on disk), so pg_column_size(new) is authoritative.
  row_bytes := pg_column_size(new);

  if row_bytes > 524288 then
    raise exception 'attempt payload too large'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists quiz_attempts_limits on public.quiz_attempts;

create trigger quiz_attempts_limits
before insert on public.quiz_attempts
for each row execute function public.enforce_attempt_limits();
