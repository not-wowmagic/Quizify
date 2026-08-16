# Quizify — Browser (e2e) & Unit Test Suite

Automated quality gates for the Quizify app: a deterministic Playwright
browser suite that exercises the real UI end-to-end, plus the existing Vitest
unit suite, all runnable on any machine with **no API keys, no network calls,
and no database**.

The browser tests run against a dedicated dev server (port `9003`) with
`E2E_MOCK_AI=1`, which swaps every AI / Supabase / web-fetch dependency for an
in-memory deterministic stand-in. This makes the suite fast (~1.5 min), free,
and flake-free — and it never touches production data.

---

## 1. Quick Start

```bash
# 1. Install dependencies (first time only)
npm install
npx playwright install chromium

# 2. Run everything
npm run test:e2e        # browser suite (66 tests, ~1.5 min)
npm test                # unit suite (100 tests)
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

### 2.1 Browser e2e (`test/e2e/`) — 66 tests

| File | Area | What is verified |
|------|------|------------------|
| `test/e2e/setup.spec.ts` | Home + setup | dark theme, no overflow, console hygiene; New Quiz / History view toggle; Upload / Paste / Web / Camera tab switching (mouse **and** arrow keys); disabled Generate until text; short-text toast; custom count clamping (1–50); 1-question and 50-question generation; unsupported file upload; drag-and-drop; malformed / valid / unreachable web URLs; camera OCR success + non-image error; incognito (no Share, no history) |
| `test/e2e/generation.spec.ts` | Quiz flow | generation from pasted text; focus moves to quiz header; Regenerate + focus; Start Over resets; all 6 formats (Multiple Choice, True/False, Fill-in-Blank, Matching, Situational, Mixed); answer locking with `aria-pressed`/disabled; destructive + emerald correct/wrong styling; matching link/unlink/scoring; wrong-pairing scoring; scorecard; Practice Missed (exactly the missed questions); AI summary generate/toggle; Ask Tutor mock guidance |
| `test/e2e/exports.spec.ts` | Exports | Anki `.txt` download (filename + TSV content); CSV download (header + topic column); **Print/PDF popup with no inline `<script>` (CSP regression guard) and `window.print()` actually invoked**; Cram Sheet popup grouped by topic; scorecard Export |
| `test/e2e/share-history.spec.ts` | Share + History | publish → QR card → shared page renders; shared page canonical `/q/slug` + `noindex`; invalid slug → 404; Restart reshuffle; QR panel toggle; history empty state; attempt appears without reload; refresh on re-activation; search; score-band + format filters; delete; retake; 2-attempt score-trend chart with **no recharts 0×0 warnings**; daily-goal set + heatmap |
| `test/e2e/accessibility.spec.ts` | A11y + layout + metadata | keyboard activation of view tabs; focus on quiz header after generation and on the shared page; dark-mode contrast (destructive `rgb(239,68,68)`, light foreground); no horizontal overflow at top/middle/bottom scroll and at 125% zoom; fixed theme toggle never overlaps the hero; home + shared + 404 metadata (title, canonical, robots); no console errors or failed requests across the whole flow |

Shared helpers + deterministic fixtures live in `test/e2e/helpers.ts`
(lecture text, standard-answer lookup, matching-pair lookup, deterministic
correct/wrong answering, and browser error tracking).

### 2.2 Unit tests (`test/`) — 100 tests

| File | Covers |
|------|--------|
| `test/quiz-export.test.ts` | Anki/CSV builders; **new**: `buildPrintHtml` (no inline scripts, topic-label formatting, HTML escaping, matching answer key), `buildCramSheetHtml` (topic grouping, answer + distractors, Key Points fallback, escaping) |
| `test/quiz-processors.test.ts` | `processQuiz` shuffling, and the **Practice Missed mapping regression** (raw-index vs processed-index) |
| `test/utils.test.ts` | `formatTopicLabel` camelCase/acronym/whitespace edge cases |
| `test/llm.test.ts` | chat-message building, response parsing, provider resolution |
| `test/web-reader.test.ts` | **new**: SSRF hardening — non-http(s) protocols, malformed URLs, embedded credentials, private/loopback/link-local IPs (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.169.254`, `[::1]`) |
| `test/chunks-and-schemas.test.ts`, `test/extract-json.test.ts`, `test/quiz-validators.test.ts`, `test/rate-limit.test.ts` | chunking, JSON extraction, zod schemas, rate limiting |

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

`E2E_MOCK_AI` is only ever read on the test dev server; production code paths
are untouched.

### 3.2 Isolated dev server

- Runs on **port 9003** (`reuseExistingServer: !CI`) so it never collides with
  your normal `next dev` on 9002.
- Uses a **separate build dir** (`.next-e2e`) so the two dev servers don't
  fight over the `.next` cache (`NEXT_E2E_DIST_DIR` in `next.config.ts`).
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
workers: 1            // sequential — server-actions mock state is per-process
retries: CI ? 2 : 0   // deterministic locally; resilience on slow CI runners
reporter: ['list', ['html', { open: 'never' }]]
viewport: 1280x800
webServer:
  command: `npx next dev -p 9003`
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

---

## 6. Running in CI

The config already honours `CI`:

- `forbidOnly: !!process.env.CI` — fails if `test.only` is left in.
- `retries: CI ? 2 : 0` — optional resilience on slow runners.
- `reuseExistingServer: !process.env.CI` — CI always boots a fresh server.

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
| Port 9003 already in use | Stop the leftover test server, or set `reuseExistingServer: true` |
| Tests hit real AI / rate limits | Make sure `E2E_MOCK_AI=1` is on the server (it is, via config); if you started the server manually, restart it via `npx playwright test` |
| Want to see the tests run | `npx playwright test --headed` |

---

## 8. File Map

```
playwright.config.ts            # e2e runner + isolated dev server
test/e2e/
  helpers.ts                    # fixtures + deterministic answering helpers
  setup.spec.ts                 # home, tabs, validation, upload/web/camera, incognito
  generation.spec.ts            # formats, answer UX, matching, scorecard, summary
  exports.spec.ts               # anki/csv downloads, print/cram popups
  share-history.spec.ts         # share, shared page, history CRUD + charts
  accessibility.spec.ts         # a11y, contrast, overflow, zoom, metadata, console
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
| `npm test` (Vitest) | 9 files / **100 tests** passing |
| `npm run typecheck` | clean |
| `npm run lint` (eslint) | clean |
| `npm run lint:ox` (oxlint + anti-slop) | clean |
| `npm run build` (Next.js) | compiles, static pages generated |
| `npm run test:e2e` (Playwright) | 5 files / **66 tests** passing |

> Note: when deploying, set the Netlify env var
> `NEXT_PUBLIC_SITE_URL=https://quizifyyyy.netlify.app` (an existing env var
> overrides the code fallback).
