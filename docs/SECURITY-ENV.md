# Security environment setup

This file covers the production environment work that remains after the security fixes. It does not contain secret values.

## 1. Upstash Redis (required for a real global rate limit)

The app uses Upstash's sliding-window limiter when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both set. Without them it falls back to an in-process `Map`; on serverless that is a per-instance limit, not a global one. Phase 3 added a one-time production warning when the fallback is used, and the IP key now prefers Netlify's `x-nf-client-connection-ip`.

### Create the database

1. Sign in at <https://console.upstash.com>.
2. Create a Redis database. Choose the free tier and a region close to the Netlify functions (for example, `us-east-1`).
3. Open the database's **REST API** section.
4. Copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Do not use the `UPSTASH_REDIS_REDIS_URL` / TCP URL; the app uses the REST client.

### Set the variables in Netlify

1. Open the site in Netlify.
2. **Site configuration → Environment variables → Add a variable**.
3. Add both variables with the exact names above.
4. Scope them to **Functions** and **Runtime** (the server-side code reads them at request time). They are not `NEXT_PUBLIC_` variables and must not be exposed to the browser.
5. Save and redeploy the site. Netlify only injects environment changes into a new deploy.

### Confirm it is actually being used

- Open **Netlify → Logs → Functions** after a few requests and search for:
  - `[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not configured` — if present, the variables did not reach the function.
  - `[rate-limit] Upstash request failed` — the variables are present but the credentials or network are wrong; the code has fallen back to memory.
- Open the Upstash database dashboard and check the **Commands** / **Requests** graph after generating a quiz or saving an attempt. A working limiter produces activity.
- A stronger check: make requests from two different networks. With Upstash configured, the 30/hour `quiz:` budget is shared across function instances; without it, each instance can grant its own window.

The fallback still exists for local development and for a Redis outage; it is not a substitute for Upstash in production.

## 2. Turnstile is intentionally deferred

Do not add Cloudflare Turnstile in this round. `TURNSTILE_SECRET_KEY` is currently absent, which means `verifyTurnstile()` returns true and the server performs no bot check. Leave both the public site key and the secret unset so the UI does not render a widget that the server ignores. The rate limit and the IP-key fix are the controls in place until Turnstile is deliberately added to all paid actions.

## 3. Historical leaked keys

The three distinct OpenAI/OpenRouter keys found in the public git history were checked on 2026-11-11 with free identity endpoints and all returned HTTP 401. They are revoked; no key rotation is required for those values.

Remaining work:

- Enable GitHub push protection and secret scanning for the repository.
- Purge the historical `.env.local` blobs if you want the public history clean (optional for risk, recommended for hygiene).
- Never commit `.env.local`; production values belong in Netlify's environment UI.
- If any additional key is found in history that the verification did not cover, rotate it before assuming it is dead.

## 4. Apply the new attempt-limit migration

The file is `supabase/migrations/20261111000000_attempt_limits.sql`. It:

- caps `quiz_attempts` at 200 rows per device, using a per-device advisory lock so concurrent inserts cannot race past the cap;
- rejects a row whose serialized `questions` + `answers` payload exceeds 512 KiB.

It is **not applied** to the remote project. Do not run `supabase db push` against a linked production project without reviewing the migration-history state first: the repository migration versions (`20260815000000`, `20260822000000`) differ from the versions recorded remotely (`20260815054310`, `20260831051013`). Applying only the new migration avoids replaying the older ones.

### Safest application path

1. Open the Supabase dashboard → **SQL Editor** for the project.
2. Paste the contents of `supabase/migrations/20261111000000_attempt_limits.sql`.
3. Run it. The script is idempotent for the function/trigger (`create or replace` + `drop trigger if exists`).
4. Verify the trigger exists:
   ```sql
   select tgname
   from pg_trigger
   where tgname = 'quiz_attempts_limits';
   ```
5. Do not insert test rows into production. The local SQL test is `supabase/tests/attempt_limits.sql`.

### Local verification (requires Docker + Supabase CLI)

```bash
supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/attempt_limits.sql
```

The test inserts 200 rows for one device, asserts the 201st is rejected, asserts an oversized payload is rejected, and rolls back its fixtures. It prints `attempt_limits_ok` on success.

## 5. Deployment checklist

- [ ] Merge the security commits to `master`.
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Netlify (Functions/Runtime scope).
- [ ] Redeploy; confirm the missing-Upstash warning is absent and Upstash shows requests.
- [ ] Apply `20261111000000_attempt_limits.sql` through the SQL editor; verify the trigger.
- [ ] Confirm the current `SUPABASE_SERVICE_ROLE_KEY` remains server-only and is not prefixed `NEXT_PUBLIC_`.
- [ ] Keep Turnstile unset until it is implemented end to end.
- [ ] Enable GitHub push protection/secret scanning; optionally purge the old history blobs.
