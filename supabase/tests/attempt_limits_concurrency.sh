#!/usr/bin/env bash
# Local-only concurrency proof for 20261111000000_attempt_limits.sql.
# Do NOT run against a linked or production project.
#
# Usage:
#   bash supabase/tests/attempt_limits_concurrency.sh \
#     "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
#
# It seeds 199 rows for one device, starts two psql sessions that each insert
# one more row for the same device, and asserts that exactly one insert wins,
# one is rejected by the quota trigger, neither deadlocks/times out, and the
# final count is exactly 200. Test rows are removed on exit.

set -euo pipefail

DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DEVICE="55555555-5555-4555-8555-555555555555"
QUESTION='[{"type":"standard","question":"Q","options":["A","B"],"correctAnswerIndex":0}]'
WORK="$(mktemp -d)"

cleanup() {
  psql "$DB_URL" -q -c "delete from public.quiz_attempts where device_id = '$DEVICE';" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "delete from public.quiz_attempts where device_id = '$DEVICE';"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
  select '$DEVICE', 'Seed ' || i, 1, 1, '$QUESTION'::jsonb, '[]'::jsonb
  from generate_series(1, 199) as i;
"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  set lock_timeout = '5s';
  insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
  values ('$DEVICE', 'Concurrent A', 1, 1, '$QUESTION'::jsonb, '[]'::jsonb);
" >"$WORK/a.out" 2>&1 &
PID_A=$!

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  set lock_timeout = '5s';
  insert into public.quiz_attempts (device_id, title, score, total, questions, answers)
  values ('$DEVICE', 'Concurrent B', 1, 1, '$QUESTION'::jsonb, '[]'::jsonb);
" >"$WORK/b.out" 2>&1 &
PID_B=$!

set +e
wait "$PID_A"; STATUS_A=$?
wait "$PID_B"; STATUS_B=$?
set -e

if [ "$STATUS_A" -eq 0 ] && [ "$STATUS_B" -eq 0 ]; then
  echo "FAIL: both concurrent inserts succeeded"
  cat "$WORK/a.out" "$WORK/b.out"
  exit 1
fi

if [ "$STATUS_A" -ne 0 ] && [ "$STATUS_B" -ne 0 ]; then
  echo "FAIL: both concurrent inserts failed"
  cat "$WORK/a.out" "$WORK/b.out"
  exit 1
fi

if ! grep -q "attempt quota exceeded" "$WORK/a.out" "$WORK/b.out"; then
  echo "FAIL: losing insert was not rejected by the quota trigger"
  cat "$WORK/a.out" "$WORK/b.out"
  exit 1
fi

if grep -Eqi "deadlock detected|lock timeout|canceling statement due to lock" "$WORK/a.out" "$WORK/b.out"; then
  echo "FAIL: a session deadlocked or timed out"
  cat "$WORK/a.out" "$WORK/b.out"
  exit 1
fi

ROWS="$(psql "$DB_URL" -At -q -c \
  "select count(*) from public.quiz_attempts where device_id = '$DEVICE';")"

if [ "$ROWS" != "200" ]; then
  echo "FAIL: expected exactly 200 rows after the race, got $ROWS"
  exit 1
fi

echo "attempt_limits_concurrency_ok rows=$ROWS"
