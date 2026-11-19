# Quizify — Browser (e2e) & Unit Test Suite

Automated quality gates for the Quizify app: a deterministic Playwright
browser suite that exercises the real UI end-to-end, plus the existing Vitest
unit suite, all runnable on any machine with **no API keys, no network calls,
and no database**.

The browser tests run against a production build server (port `9003`) with
`E2E_MOCK_AI=1`, which swaps every AI / Supabase / web-fetch dependency for an
in-memory deterministic stand-in. This makes the suite fast (~30-60s warm),
free, and flake-free, and it never touches production data.

---

## 1. Quick Start

```bash
# 1. Install dependencies (first time only)
npm install
npx playwright install chromium

# 2. Run everything
npm run test:e2e        # browser suite (86 tests across 6 spec files; first run includes a next build)
npm test                # unit suite (210 tests across 24 files)
npm run typecheck
npm run lint
npm run lint:ox
npm run build

# 3. Open the HTML report from the last e2e run
npx playwright show-report
```

Individual files / focused runs:

```bash
npx playwright test test/e2e/setup.spec.ts
npx playwright test --grep "matching"
npx playwright test --headed   # watch the browser
```

---

## 2. What the Suite Covers

### 2.1 Browser e2e (`test/e2e/`) - 86 tests across 6 spec files

| File | Area | What is verified |
|------|------|------------------|
| `test/e2e/setup.spec.ts` | Home + setup | theme toggle changes computed background/foreground colors; no overflow, console hygiene; New Quiz / History view toggle; Upload / Paste / Web / Camera tab switching (mouse **and** arrow keys); disabled Generate until text; short-text toast; custom count clamping (1–50); 1-question and 50-question generation; unsupported file upload; drag-and-drop; malformed / valid / unreachable web URLs; camera OCR success + non-image error; incognito (no Share, no history) |
| `test/e2e/generation.spec.ts` | Quiz flow | generation from pasted text; focus moves to quiz header; Regenerate + focus; Start Over resets; all 6 formats (Multiple Choice, True/False, Fill-in-Blank, Matching, Situational, Mixed); answer locking with `aria-pressed`/disabled; destructive + emerald correct/wrong styling; matching link/unlink/scoring; wrong-pairing scoring; scorecard; Practice Missed (exactly the missed questions); AI summary generate/toggle; Ask Tutor mock guidance |
| `test/e2e/exports.spec.ts` | Exports | Anki `.txt` download (filename + TSV content); CSV download (header + topic column); **Print/PDF popup with no inline `<script>` (CSP regression guard) and `window.print()` actually invoked**; Cram Sheet popup grouped by topic; scorecard Export |
| `test/e2e/share-history.spec.ts` | Share + History | publish → QR card → shared page renders; shared page canonical `/q/slug` + `noindex`; invalid slug → 404; Restart reshuffle; QR panel toggle; history empty state; attempt appears without reload; refresh on re-activation; search; score-band + format filters; delete; retake; 2-attempt score-trend chart with **no recharts 0×0 warnings**; daily-goal set + heatmap |
| `test/e2e/accessibility.spec.ts` | A11y + layout + metadata | keyboard activation of view tabs; focus on quiz header after generation and on the shared page; light/dark theme contrast comparison; AXE audit (zero critical/serious violations on home, runner, shared page); 44×44 touch targets; no horizontal overflow at top/middle/bottom scroll and at 125%/200% zoom; reduced-motion disables reveal animations; theme screenshot changes without changing footprint; theme toggle stays in the top bar without overlapping content; exactly one h1 per view; 44x44 visible actions on setup, runner, and history; 3px focus rings on raw answer and format buttons; home + shared + 404 metadata (title, canonical, robots); no console errors or failed requests across the whole flow |
| `test/e2e/runner.mobile.spec.ts` | Mobile runner | mobile-only project that exercises the quiz runner at phone widths; only this spec runs in the `mobile-chromium` Playwright project, while `chromium` skips all `*.mobile.spec.ts` files |

Shared helpers + deterministic fixtures live in `test/e2e/helpers.ts`
(lecture text, standard-answer lookup, matching-pair lookup, deterministic
correct/wrong answering, and browser error tracking).

### 2.2 Unit tests (`test/`) - 210 tests across 24 files

| File | Covers |
|------|--------|
| `test/quiz-export.test.ts` | Anki/CSV builders; **new**: `buildPrintHtml` (no inline scripts, topic-label formatting, HTML escaping, matching answer key), `buildCramSheetHtml` (topic grouping, answer + distractors, Key Points fallback, escaping) |
| `test/quiz-processors.test.ts` | `processQuiz` shuffling, and the **Practice Missed mapping regression** (raw-index vs processed-index) |
| `test/utils.test.ts` | `formatTopicLabel` camelCase/acronym/whitespace edge cases |
| `test/llm.test.ts` | chat-message building, response parsing, provider resolution |
| `test/web-reader.test.ts` | **new**: SSRF hardening: non-http(s) protocols, malformed URLs, embedded credentials, private/loopback/link-local IPs (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.169.254`, `[::1]`) |
| `test/chunks-and-schemas.test.ts`, `test/extract-json.test.ts`, `test/quiz-validators.test.ts`, `test/rate-limit.test.ts` | chunking, JSON extraction, zod schemas, rate limiting |
| `test/device-cookie.test.ts`, `test/security-hardening.test.ts`, `test/integration-boundaries.test.ts`, `test/generation-recovery.test.ts` | signed device and bot cookies, Turnstile and rate-limit boundaries, score invariants, bounded reads, CSV neutralization, base URL validation, cancellation, provider fallback |

---

## 3. How Determinism Is Achieved

Everything expensive or external is mocked at the **server boundary**, so the
tests exercise the *real* React UI, server actions, and client logic but never
the real LLM / Supabase / internet.

### 3.1 `E2E_MOCK_AI=1` (set by `playwright.config.ts` on the webServer)

| Dependency | File | Behavior when `E2E_MOCK_AI=1` |
|------------|------|-------------------------------|
| LLM (`callLLM`, `callLLMVision`) | `src/ai/llm.ts` | `mockLLM(prompt)` returns canned JSON by prompt marker: standard questions, matching questions, summary text, tutor guidance, or OCR text |
| Supabase (`getSupabase`) | `src/lib/supabase-server.ts` → `src/lib/mock-supabase.ts` | in-memory chainable query builder (`insert/select/delete/eq/order/limit/single/maybeSingle`) so history + sharing are hermetic |
| Web reader (`fetchPublicPage`) | `src/lib/web-reader.ts` | returns a canned HTML article; `nonexistent.invalid` → simulated unreachable error |
| Rate limiting (`checkRateLimit`) | `src/lib/rate-limit.ts` | always allowed (many quizzes from one IP) |
| Turnstile (`verifyTurnstile`) | `src/lib/rate-limit.ts` | always passes (no bot check) |
| Turnstile widget | `playwright.config.ts` env | `NEXT_PUBLIC_TURNSTILE_SITE_KEY=''` → widget never renders |

`E2E_MOCK_AI` is only ever read on the test server; production code paths
are untouched.

### 3.2 Isolated production server

- Runs on **port 9003** against a **production build** (`npx next build && npx
  next start -p 9003`), so every route serves instantly with no per-route dev
  compilation. Set `E2E_DEV_SERVER=1` to fall back to `next dev` for warm-cache
  iteration.
- Uses a **separate build dir** (`.next-e2e`) so the e2e build never fights
  your normal `.next` cache (`NEXT_E2E_DIST_DIR` in `next.config.ts`).
- **Readiness probe**: the webServer waits on `/api/e2e-mock-status`, which
  answers 200 only when the server was started with `E2E_MOCK_AI=1`. A stale
  unmocked server on 9003 therefore fails fast at startup instead of hanging
  per test.
- **Parallelism**: `fullyParallel: true` with `workers: CI ? 1 : 4` (4 local
  workers, 1 in CI).
- Hermetic data: each test gets a fresh browser context → fresh device id →
  isolated history; published quizzes use random slugs.

### 3.3 Deterministic fixtures

`test/e2e/helpers.ts` mirrors the exact canned questions in `mockLLM`, so tests can
answer correctly (or deliberately incorrectly) every time — no guessing, no
flaky shuffles.

---

## 4. Configuration

### `playwright.config.ts`

```ts
testDir: './test/e2e'
fullyParallel: true
forbidOnly: !!process.env.CI
retries: CI ? 2 : 0
workers: CI ? 1 : 4
reporter: ['list', ['html', { open: 'never' }]]
timeout: 30_000
expect: { timeout: 10_000 }
viewport: 1280x800
webServer:
  command: E2E_DEV_SERVER === '1' ? `npx next dev -p 9003` : `npx next build && npx next start -p 9003`
  url: http://localhost:9003/api/e2e-mock-status   // readiness probe: 200 only when E2E_MOCK_AI=1
  reuseExistingServer: !CI
  timeout: 240_000   // covers a cold `next build` on Windows
  env: { E2E_MOCK_AI: '1', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '', NEXT_E2E_DIST_DIR: '.next-e2e' }
```

### Ignored from lint/typecheck (generated artifacts)

`.next/`, `.next-e2e/`, `test-results/`, `playwright-report/`, `blob-report/`,
`playwright/.cache/` are excluded in `tsconfig.json`, `eslint.config.mjs`, and
`oxlint.config.mts`.

---

## 5. Notable Regression Guards

These tests exist specifically because real production bugs were found and
fixed; the suite would catch them if they ever regressed:

- **CSP-safe printing** — the print popup must contain **no inline `<script>`**
  and must actually invoke `window.print()`. (Previously an inline
  `window.onload = print()` script was silently blocked by CSP and the dialog
  never opened.)
- **Practice Missed question mapping** — missed questions are picked from the
  *processed* (shuffled) quiz, not the raw array. `generation.spec.ts`
  "Practice Missed builds a quiz from the actually-missed questions" verifies
  the count matches.
- **History refresh on activation** — history refetches from the DB every time
  the tab becomes active, so new completions show up without a reload.
- **Dark-mode destructive contrast** — wrong-selected options use the readable
  dark `--destructive` (`rgb(239, 68, 68)`), asserted via computed styles.
- **Canonical + noindex** — shared quizzes expose `/q/<slug>` canonical and
  `noindex, follow`.
- **Recharts 0×0 warnings** — history charts only mount once their container
  has real size; the suite asserts no `width(0)`/`height(0)` warnings.
- **SSRF hardening** — `test/web-reader.test.ts` blocks private/loopback hosts.
- **Topic-label humanization** — camelCase AI slugs are spaced out for display.
- **CSV formula neutralization** — `buildQuizCsv` prefixes `'` to any answer or
  term token that begins with `=`, `+`, `-`, or `@`, so spreadsheet imports treat
  it as text instead of a formula.
- **Theme and touch targets** — the e2e suite toggles the real ThemeToggle and
  asserts computed colors differ, then measures primary controls at >=44px.

The AXE checks in `accessibility.spec.ts` import `@axe-core/playwright`. That
package must be present in `devDependencies` for the e2e suite to compile; it is
not installed by the app itself.

### Offline manual check (F-04)

The service worker caches only the app shell. History, retakes, and sharing are
server actions and are not intercepted. To verify: load the app online once,
then go offline and reload. The interface should open, but history/retake
actions should report that a connection is needed.

---

## 6. Running in CI

The config already honours `CI`:

- `forbidOnly: !!process.env.CI` fails if `test.only` is left in.
- `retries: CI ? 2 : 0` gives optional resilience on slow runners.
- `workers: CI ? 1 : 4` runs CI serial (single worker) and 4 workers locally.
- `reuseExistingServer: !process.env.CI` means CI always boots a fresh server,
  so the readiness probe can never reuse a stale one.

Suggested pipeline:

```bash
npm ci
npx playwright install --with-deps chromium
npm run typecheck
npm run lint
npm run lint:ox
npm test
npm run build
npm run test:e2e
```

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npx playwright` not found | `npm install` (adds `@playwright/test`) |
| Browser binary missing | `npx playwright install chromium` |
| Run fails at startup with a webServer timeout | A stale unmocked server is on 9003: the readiness probe `/api/e2e-mock-status` 404s (it only answers 200 when the server was started with `E2E_MOCK_AI=1`). Kill the stale server, or restart it via `npx playwright test` |
| Tests hit real AI / rate limits | The readiness probe would have failed the run at startup, so this means the server was started without `E2E_MOCK_AI=1`; restart it via `npx playwright test` |
| Want to see the tests run | `npx playwright test --headed` |

---

## 8. File Map

```
playwright.config.ts            # e2e runner + isolated production server + readiness probe
test/e2e/
  helpers.ts                    # fixtures + deterministic answering helpers
  setup.spec.ts                 # home, tabs, validation, upload/web/camera, incognito
  generation.spec.ts            # formats, answer UX, matching, scorecard, summary
  exports.spec.ts               # anki/csv downloads, print/cram popups
  share-history.spec.ts         # share, shared page, history CRUD + charts
  accessibility.spec.ts         # a11y, axe, contrast, touch targets, zoom, motion, metadata
  runner.mobile.spec.ts         # mobile-only quiz runner (mobile-chromium project)
test/
  quiz-export.test.ts           # export builders incl. print/cram HTML
  quiz-processors.test.ts       # processQuiz + practice-missed regression
  utils.test.ts                 # formatTopicLabel edge cases
  web-reader.test.ts            # SSRF hardening
  llm.test.ts, chunks-and-schemas.test.ts, extract-json.test.ts,
  quiz-validators.test.ts, rate-limit.test.ts
src/
  ai/llm.ts                     # mockLLM (E2E_MOCK_AI=1)
  lib/mock-supabase.ts          # in-memory Supabase stand-in (e2e only)
  lib/supabase-server.ts        # routes to mock when E2E_MOCK_AI=1
  lib/web-reader.ts             # canned page mock
  lib/rate-limit.ts             # e2e bypasses
  lib/quiz-export.ts            # buildPrintHtml / buildCramSheetHtml (pure, tested)
```

---

## 9. Status

| Gate | Result |
|------|--------|
| `npm test` (Vitest) | 24 files / **210 tests** passing |
| `npm run typecheck` | clean |
| `npm run lint` (eslint) | clean |
| `npm run lint:ox` (oxlint + anti-slop) | clean |
| `npm run build` (Next.js) | compiles, static pages generated |
| `npm run test:e2e` (Playwright) | 6 spec files / **86 tests** passing; `runner.mobile.spec.ts` runs in the `mobile-chromium` project only |

> Note: when deploying, set the Netlify env var
> `NEXT_PUBLIC_SITE_URL=https://quizify.netlify.app` (an existing env var
> overrides the shared fallback exported from `src/app/manifest.ts`).
