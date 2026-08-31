// test/e2e/helpers.ts
// Shared helpers + deterministic fixtures for the Quizify browser suite.
// The dev server runs with E2E_MOCK_AI=1, so generation is instant and every
// "AI" response is canned (see src/ai/llm.ts mockLLM). These fixtures mirror
// that mock so tests can answer deterministically.
import { expect, type Locator, type Page } from '@playwright/test';

export const LECTURE = `Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy. This process takes place in the chloroplast, an organelle that contains the pigment chlorophyll. Chlorophyll absorbs light, mainly in the blue and red wavelengths, and reflects green light, which is why plants look green. The light-dependent reactions occur on the thylakoid membrane and produce ATP and NADPH. These energy carriers then drive the Calvin cycle, which fixes carbon dioxide into glucose in the stroma. Oxygen is released as a byproduct of water splitting during the light reactions. Photosynthesis is the foundation of nearly every food chain on Earth because it produces both food and oxygen for other organisms to use.`;

// Mirrors MOCK_MATCHING in src/ai/llm.ts (premise -> correct response).
export const MATCHING_PAIRS = [
  ['Light-dependent reactions', 'Thylakoid membrane'],
  ['Calvin cycle', 'Stroma'],
  ['Water splitting', 'Photosystem II'],
  ['Glucose synthesis', 'RuBisCO'],
] as const;

// Mirrors MOCK_STANDARD in src/ai/llm.ts (question -> correct option text).
export const STANDARD_ANSWERS = {
  'Which organelle is responsible for photosynthesis?': 'Chloroplast',
  'What is the main pigment that captures light energy in plants?': 'Chlorophyll',
  'The Calvin cycle produces which molecule?': 'Glucose',
  'True or False: Photosynthesis converts light energy into chemical energy.': 'True',
  'Which gas do plants absorb from the atmosphere for photosynthesis?': 'Carbon dioxide',
  'Where do the light-dependent reactions take place?': 'Thylakoid membrane',
  'Which molecule carries energy from the light reactions to the Calvin cycle?': 'ATP and NADPH',
  'What happens to oxygen produced during photosynthesis?': 'Released as a byproduct',
} as const satisfies Record<string, string>;

export async function gotoHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Quizify' })).toBeVisible();
}

export async function goPasteTab(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Paste' }).click();
  const textarea = page.locator('#lecture-text');
  await expect(textarea).toBeVisible();
  return textarea;
}

export async function setCustomCount(page: Page, n: string): Promise<void> {
  await page.getByLabel('Number of Questions', { exact: true }).selectOption('custom');
  const input = page.getByLabel('Custom number of questions');
  await input.fill(n);
  await input.blur();
}

export async function generateQuiz(page: Page, count?: number): Promise<void> {
  if (count !== undefined) {
    await setCustomCount(page, String(count));
  }
  await page.getByRole('button', { name: /Generate Quiz/ }).click();
  await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
}

/** Returns the visible question cards (standard + matching) in the active quiz. */
export function questionCards(page: Page): Locator {
  return page.locator('#setup .space-y-6 > .surface-card:visible');
}

async function isMatchingCard(card: Locator): Promise<boolean> {
  return (await card.locator('[role="group"][aria-label="Terms"]').count()) > 0;
}

/** Resolves the correct option text for a standard question card, if known. */
export async function correctAnswerForCard(card: Locator): Promise<string | null> {
  // CardTitle renders the question text; match by class, not element type,
  // so heading-semantics changes in ui/card.tsx cannot break this helper.
  const title = await card.locator('[class*="font-semibold"]').first().innerText();
  for (const [q, ans] of Object.entries(STANDARD_ANSWERS)) {
    if (title.includes(q)) return ans;
  }
  return null;
}

/**
 * Answers ONE standard question card. `correct` picks the right option,
 * otherwise the first option that is NOT the right one (deterministic).
 */
export async function answerStandardCard(card: Locator, correct = true): Promise<void> {
  const rightText = await correctAnswerForCard(card);
  const options = card.locator('button[aria-pressed]');
  const texts = await options.allInnerTexts();
  for (let i = 0; i < texts.length; i++) {
    const isRight = rightText !== null && texts[i].includes(rightText);
    if ((correct && isRight) || (!correct && !isRight)) {
      await options.nth(i).click();
      return;
    }
  }
}

/**
 * Answers every standard question in the active quiz. `correct` picks the
 * right option (deterministic via STANDARD_ANSWERS), otherwise the first
 * option that is NOT the right one.
 */
export async function answerStandardQuestions(page: Page, correct = true): Promise<void> {
  const cards = questionCards(page);
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    if (await isMatchingCard(card)) continue;
    const rightText = await correctAnswerForCard(card);
    const options = card.locator('button[aria-pressed]');
    const texts = await options.allInnerTexts();
    for (let i = 0; i < texts.length; i++) {
      const isRight = rightText !== null && texts[i].includes(rightText);
      if ((correct && isRight) || (!correct && !isRight)) {
        await options.nth(i).click();
        break;
      }
    }
  }
}

/**
 * Answers a matching card. `correct` links each premise to its own response
 * (deterministic via MATCHING_PAIRS), otherwise each premise is linked to the
 * NEXT premise's response (guaranteed wrong).
 */
export async function answerMatchingCard(card: Locator, correct = true): Promise<void> {
  const terms = card.locator('[role="group"][aria-label="Terms"] button');
  const tcount = await terms.count();
  for (let i = 0; i < tcount; i++) {
    await terms.nth(i).click();
    const premise = (await terms.nth(i).innerText()).trim();
    let responseText: string | undefined;
    if (correct) {
      responseText = MATCHING_PAIRS.find(([p]) => p === premise)?.[1];
    } else {
      responseText = MATCHING_PAIRS[(i + 1) % MATCHING_PAIRS.length][1];
    }
    await card.locator('[role="group"][aria-label="Matches"] button', { hasText: responseText }).click();
  }
  await card.getByRole('button', { name: 'Check Matching Pairs' }).click();
}

/** Answers every question in the active quiz (mixing standard + matching). */
export async function answerAllQuestions(page: Page, correct = true): Promise<void> {
  const cards = questionCards(page);
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    if (await isMatchingCard(card)) {
      await answerMatchingCard(card, correct);
    } else {
      await answerStandardQuestionsForCard(page, card, correct);
    }
  }
}

async function answerStandardQuestionsForCard(page: Page, card: Locator, correct: boolean): Promise<void> {
  const rightText = await correctAnswerForCard(card);
  const options = card.locator('button[aria-pressed]');
  const texts = await options.allInnerTexts();
  for (let i = 0; i < texts.length; i++) {
    const isRight = rightText !== null && texts[i].includes(rightText);
    if ((correct && isRight) || (!correct && !isRight)) {
      await options.nth(i).click();
      return;
    }
  }
}

/** Completes the current quiz and waits for the scorecard. */
export async function completeQuiz(page: Page, correct = true): Promise<void> {
  await answerAllQuestions(page, correct);
  await expect(page.getByRole('heading', { name: 'Quiz Completed!' })).toBeVisible({ timeout: 15_000 });
}

/** Collects browser console errors + page errors + failed requests since attach. */
export function attachErrorTracking(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    const url = req.url();
    // Ignore expected favicon / analytics noise or aborted requests from the e2e env.
    if (url.includes('favicon')) return;
    if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
    errors.push(`requestfailed: ${req.method()} ${url} -> ${req.failure()?.errorText}`);
  });
  return { errors, get: () => errors };
}
