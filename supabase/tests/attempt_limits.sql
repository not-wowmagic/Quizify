-- Local-only verification for 20261111000000_attempt_limits.sql.
-- Do NOT run against a linked or production project.
--
-- Usage with a local Supabase stack:
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/attempt_limits.sql
--
-- The script runs in a transaction and rolls back its fixtures.

\set ON_ERROR_STOP on

begin;

do $$
declare
  quota_device constant text := '33333333-3333-4333-8333-333333333333';
  payload_device constant text := '44444444-4444-4444-8444-444444444444';
  disk_device constant text := '55555555-5555-4555-8555-555555555555';
  question constant jsonb := '[{"type":"standard","question":"Q","options":["A","B"],"correctAnswerIndex":0}]'::jsonb;
  row_count integer;
begin
  for i in 1..200 loop
    insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
    values (quota_device, 'Attempt ' || i, 1, 1, question, '[]'::jsonb);
  end loop;

  begin
    insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
    values (quota_device, 'Attempt 201', 1, 1, question, '[]'::jsonb);
    raise exception 'expected the 201st attempt to be rejected';
  exception
    when check_violation then null;
  end;

  select count(*) into row_count
  from public.quiz_attempts
  where device_id = quota_device;

  if row_count <> 200 then
    raise exception 'expected 200 stored rows after the quota rejection, got %', row_count;
  end if;

  begin
    insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
    values (
      payload_device,
      'Oversized',
      1,
      1,
      jsonb_build_array(jsonb_build_object(
        'type', 'standard',
        'question', repeat('x', 600000),
        'options', '["A","B"]'::jsonb,
        'correctAnswerIndex', 0
      )),
      '[]'::jsonb
    );
    raise exception 'expected the oversized attempt to be rejected';
  exception
    when check_violation then null;
  end;

  select count(*) into row_count
  from public.quiz_attempts
  where device_id = payload_device;

  if row_count <> 0 then
    raise exception 'expected zero stored rows for the oversized attempt, got %', row_count;
  end if;

  -- This is the case the old text-size check missed: ~400 KB as text, ~800 KB
  -- as binary jsonb. pg_column_size(new) must reject it.
  begin
    insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
    select
      disk_device,
      'Disk-heavy',
      1,
      1,
      jsonb_agg('{}'::jsonb),
      '[]'::jsonb
    from generate_series(1, 100000);
    raise exception 'expected the disk-heavy attempt to be rejected';
  exception
    when check_violation then null;
  end;

  select count(*) into row_count
  from public.quiz_attempts
  where device_id = disk_device;

  if row_count <> 0 then
    raise exception 'expected zero stored rows for the disk-heavy attempt, got %', row_count;
  end if;
end;
$$;

select 'attempt_limits_ok' as result;

rollback;
