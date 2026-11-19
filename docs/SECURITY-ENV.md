# Security environment setup

This file covers the production environment work that remains after the security fixes. It does not contain secret values. No real key is recorded here; any example values below are placeholders.

## 1. Upstash Redis (rate limiting)

The app uses Upstash's sliding-window limiter when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both set. Paid endpoints pass `strict`, so in production the limiter fails closed: if either variable is missing, or the Redis request errors, the request is denied rather than served by a per-instance fallback. Local development (`NODE_ENV` not `production`) and the E2E suite (`E2E_MOCK_AI=1`) keep an in-memory fallback. An in-memory `Map` is not a global limit on serverless, so production depends on Upstash being configured.

The IP key prefers Netlify's `x-nf-client-connection-ip`, then a validated `x-real-ip`, then a single shared bucket for headerless callers, which are throttled collectively. `x-forwarded-for` is never trusted.

### Create the database

1. Sign in at <https://console.upstash.com>.
2. Create a Redis database. Pick a region close to the Netlify functions, for example `us-east-1`.
3. Open the database's **REST API** section.
4. Copy these two values:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Do not use the TCP or `redis://` URL; the app uses the REST client.

### Set the variables in Netlify

1. Open the site in Netlify.
2. Go to **Site configuration > Environment variables > Add a variable**.
3. Add both variables with the exact names above.
4. Scope them to **Functions** and **Runtime**. They are not `NEXT_PUBLIC_` variables and must not reach the browser.
5. Save and redeploy. Netlify only injects environment changes into a new deploy.

Do not claim Upstash is active in production until these steps are complete and the checks below pass. Until then, paid endpoints deny requests by design (fail closed).

### Confirm it is actually being used

- Open **Netlify > Logs > Functions** after a few requests and look for rate-limit messages about missing Upstash configuration or Upstash request failures. Either one means the limiter did not use Redis.
- Open the Upstash database dashboard and check the **Commands** / **Requests** graph after generating a quiz or saving an attempt. A working limiter produces activity.
- Stronger check: make requests from two different networks. With Upstash configured, the 30/hour `quiz:` budget is shared across function instances.

Because paid endpoints fail closed in production, a misconfiguration makes rate-limited actions fail visibly. That is intentional.

## 2. Turnstile is opt-in

Turnstile is deliberately opt-in. Verification is a no-op only while `TURNSTILE_SECRET_KEY` is unset. That is the state in local dev, in the E2E suite, and in deployments that deliberately opt in to running without bot protection. Leave both the site key and the secret unset if you do not want the widget, so the UI does not render a control the server ignores.

When `TURNSTILE_SECRET_KEY` is set, server-side verification validates the response's `success`, checks the hostname against `TURNSTILE_EXPECTED_HOSTNAME`, checks the `quizify` action, and fails closed on network errors (a request is rejected if Cloudflare cannot be reached).

Turnstile tokens are single-use. The first successful check exchanges the token for a short-lived signed `quizify_bot` cookie (HttpOnly, Secure in production, SameSite=Lax). Later guarded actions in the same study session use that proof, so a token is not replayed and the user does not need a second widget after generation. The cookie expires after two hours.

Exact environment variables:

- `TURNSTILE_SECRET_KEY`: server-side secret used with Cloudflare's `siteverify` endpoint. Set it to enable verification. Never expose it to the browser and never commit it.
- `TURNSTILE_EXPECTED_HOSTNAME`: the host you expect, host only with no scheme or path, for example `quizify.netlify.app`.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: the public widget key, needed only if you render the Turnstile widget. It is intentionally public.

Production keys must be configured by the owner in Netlify. They are NOT committed to this repository.

To enable in production:

1. Create a Turnstile widget in Cloudflare for the production host.
2. Set the variables in Netlify, with the secret scoped to Functions/Runtime.
3. Redeploy and confirm the widget appears and a quiz submission succeeds with a valid token.
4. Confirm a request with a bad or missing token is rejected.

## 3. Historical leaked keys

The three distinct OpenAI/OpenRouter keys found in the public git history were checked on 2026-11-11 with provider identity endpoints. All returned HTTP 401, so they are revoked and no rotation is required for those values. No real secret values are recorded here.

Remaining work:

- Enable GitHub push protection and secret scanning for the repository (commands below).
- Purge the historical `.env.local` blobs if you want the public history clean. This is optional for risk but recommended for hygiene.
- Never commit `.env.local`; production values belong in Netlify's environment UI.
- If any additional key is found in history that this verification did not cover, rotate it before assuming it is dead.

### Enable secret scanning and push protection (owner action, not performed here)

Run these from a local checkout with `gh` authenticated as someone who can change repository settings. Replace `OWNER` and `REPO` with the real values. Do not run them in CI with a token that lacks admin rights.

```bash
# Enable both features on the repository
gh api -X PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  repos/OWNER/REPO \
  --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

# Read back the result
gh api repos/OWNER/REPO --jq '.security_and_analysis'
```

Web UI path:

1. Open the repository on GitHub.
2. Go to **Settings > Code security and analysis**.
3. Under **Secret scanning**, click **Enable**.
4. Under **Push protection**, click **Enable**.
5. Reload the page and confirm both show as enabled.

On github.com these features are available for public repositories and for private repositories with the appropriate GitHub Advanced Security license. If the PATCH returns a 4xx, check the repository's plan and the caller's permissions.

### Verify a suspected leaked key is dead

Never paste a key into chat, a doc, or shell history. Read it from a secret manager into a variable first.

```bash
# Replace the prompt input with a value pulled from your secret manager, never a literal in source.
read -rsp 'Key to check: ' KEY_UNDER_TEST; echo

# OpenAI: 401 means dead, 200 means still live.
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY_UNDER_TEST" \
  https://api.openai.com/v1/models

# OpenRouter: 401 means dead, 200 means still live.
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY_UNDER_TEST" \
  https://openrouter.ai/api/v1/key

unset KEY_UNDER_TEST
```

If a check returns 200, rotate that key at the provider immediately, replace it in Netlify, and revoke the old value. Record only the outcome (revoked, date, provider) in your private tracker, not the key itself.

## 4. Attempt-limit migration

The file `supabase/migrations/20261111000000_attempt_limits.sql` caps `quiz_attempts` at 200 rows per device using a per-device advisory lock, and rejects a row whose stored size (`pg_column_size(new)`, covering the whole row including `questions`/`answers`) exceeds 512 KiB.

Verified applied to the linked remote project as of 2026-11-19. Do not re-run it against production.

Read-only verification (safe to run):

```sql
select tgname
from pg_trigger
where tgname = 'quiz_attempts_limits';
```

Local verification (requires Docker + Supabase CLI):

```bash
supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/attempt_limits.sql
```

The test inserts 200 rows for one device, asserts the 201st is rejected, asserts an oversized payload is rejected, and rolls back its fixtures. It prints `attempt_limits_ok` on success.

### Pending database hardening migrations (not applied)

Two new migration files are staged but have NOT been applied to the linked remote project. They require owner review and approval before any `supabase db push` or SQL Editor run. Do not apply them as part of routine deploys.

- `supabase/migrations/20261119000001_secure_function_search_path.sql`: sets `search_path = ''` on `public.enforce_attempt_limits` to clear the mutable-search_path advisor WARN.
- `supabase/migrations/20261119000002_quiz_attempts_quiz_id_index.sql`: adds a covering index on `quiz_attempts(quiz_id)` to clear the advisor INFO about `quiz_attempts_quiz_id_fkey`.

RLS invariant (unchanged): both `public.quizzes` and `public.quiz_attempts` keep row level security enabled with no policies. All database access goes through the server-only client in `src/lib/supabase-server.ts`, which uses the service role key and is guarded by `import 'server-only'`. Do not add policies that would open either table through the Data API.

## 5. Deployment checklist

Machine-verifiable items are marked done where the code or migration state enforces them. Items that need the owner to configure Netlify, GitHub, or Cloudflare remain unchecked.

- [x] Attempt-limit migration verified applied to the linked remote project as of 2026-11-19; do not re-run against production.
- [x] Paid endpoints fail closed in production when Upstash is missing or errors; the in-memory fallback is limited to non-production and E2E.
- [x] Turnstile verification validates `success`, hostname, and the `quizify` action, fails closed on network errors, and exchanges a single-use token for a two-hour signed bot session cookie when the secret is set.
- [x] Database client is server-only (`import 'server-only'`) and uses the service role; both tables keep RLS enabled with no policies.
- [ ] Merge the security commits to `master`.
- [ ] Configure Upstash and confirm requests appear in the Upstash dashboard.
- [ ] Configure Turnstile keys if bot protection is wanted; otherwise confirm the deliberate opt-out.
- [ ] Apply the two pending hardening migrations after owner review and approval.
- [ ] Enable GitHub secret scanning and push protection.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` in Netlify is server-only and is not prefixed `NEXT_PUBLIC_`.

### Requires owner action

Netlify environment variables (set only the ones that apply to your deployment; scope server-side values to Functions/Runtime):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_EXPECTED_HOSTNAME` (host only, for example `quizify.netlify.app`)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (only if rendering the widget)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_SITE_URL`
- `OPENCODE_API_KEY` (or `GEMINI_API_KEY` when `AI_PROVIDER=gemini`)
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (optional analytics)

GitHub settings:

- Secret scanning: enabled
- Push protection: enabled
- Private vulnerability reporting: enabled (recommended, see SECURITY.md)
- Optional: purge historical `.env.local` blobs from public history

Cloudflare:

- Turnstile widget for the production host and its keys (only if enabling bot protection)

## 6. Prompt injection defense in depth

Study material, web pages, OCR text, and learner questions are wrapped in inert delimiters in the AI prompts, every flow validates the returned JSON against a strict Zod schema, and providers receive JSON-only response formats plus an output-token cap where supported. This is defense in depth, not a guarantee: a model can still be steered by adversarial input, so generated questions and guidance are untrusted text. The residual risk is accepted for this product; do not treat AI output as trusted instructions, and keep the schema validation and output budgets in place.

## 7. Attempt score integrity

The server recomputes the score and every answer's `correct` flag from the submitted `selectedIndex` or `matches`, requires `total` to equal the number of questions, rejects duplicate or out-of-range answer indices, and rejects a recomputed score above `total`. This prevents a client from submitting an arbitrary score or inflating it with repeated answers.

For anonymous generated quizzes, the question set is still supplied by the client, so the server enforces internal consistency but cannot attest that a self-reported quiz answer key is truthful. Shared quiz attempts carry a `quiz_id`. Do not treat device history as an authoritative assessment or a cross-user leaderboard.
