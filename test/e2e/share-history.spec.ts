// test/e2e/share-history.spec.ts
// Share: publish → QR card → shared page, canonical/noindex, invalid slug 404,
// restart reshuffle, QR panel. History: empty state, refresh on activation,
// search, filters, delete, retake, score-trend chart (no recharts 0×0
// warnings), and the daily-goal heatmap.
import { test, expect } from '@playwright/test';
import { LECTURE, gotoHome, goPasteTab, generateQuiz, completeQuiz, attachErrorTracking } from './helpers';

async function generateAndComplete(page: import('@playwright/test').Page, correct = true, count = 3) {
  await gotoHome(page);
  const textarea = await goPasteTab(page);
  await textarea.fill(LECTURE);
  await generateQuiz(page, count);
  await completeQuiz(page, correct);
}

/**
 * Returns to the setup screen after a completed quiz: the app keeps the
 * finished quiz's scorecard mounted, so "New Quiz" alone re-shows it —
 * "Start Over" (on the scorecard) is the actual reset path.
 */
async function returnToFreshSetup(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /New Quiz/ }).click();
  await page.getByRole('button', { name: 'Start Over' }).click();
}

async function publishQuiz(page: import('@playwright/test').Page): Promise<string> {
  await page.getByRole('button', { name: 'Share' }).first().click();
  const qr = page.getByText('Scan to share');
  await expect(qr).toBeVisible();
  const urlText = await page.locator('p[class*="break-all"]').first().innerText();
  return urlText.trim();
}

test.describe('share', () => {
  test('publishes a quiz, shows the QR card, and the shared page renders', async ({ page }) => {
    await generateAndComplete(page);
    const url = await publishQuiz(page);
    expect(url).toMatch(/\/q\//);
    const slug = url.split('/q/')[1];
    await page.goto(`/q/${slug}`);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible();
    await expect(page.locator('h1').first()).toContainText('Untitled Quiz');
  });

  test('publishes a quiz from the after-quiz scorecard', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('status').getByRole('button', { name: 'Share' }).click();
    const qr = page.getByText('Scan to share');
    await expect(qr).toBeVisible();
    const urlText = await page.locator('p[class*="break-all"]').first().innerText();
    expect(urlText.trim()).toMatch(/\/q\//);
  });

  test('shared quiz page exposes a canonical URL and noindex', async ({ page }) => {
    await generateAndComplete(page);
    const url = await publishQuiz(page);
    const slug = url.split('/q/')[1];
    await page.goto(`/q/${slug}`);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/q/${slug}`);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('invalid shared slug shows the 404 page', async ({ page }) => {
    await gotoHome(page);
    await page.goto('/q/this-slug-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Quizify' })).toBeVisible();
  });

  test('shared quiz Restart reshuffles a fresh quiz', async ({ page }) => {
    // Keep the full 10-question default: with fewer questions the reshuffle
    // poll would flake (3! = 6 orders, 1/6 same-order coincidence).
    await generateAndComplete(page, true, 10);
    const url = await publishQuiz(page);
    const slug = url.split('/q/')[1];
    await page.goto(`/q/${slug}`);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
    const beforeTitles = await page.locator('.surface-card:visible [class*="font-semibold"]').allInnerTexts();
    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
    // Restart runs processQuiz again: the 10 questions land in a fresh order
    // (identical order is a 1-in-10! coincidence; the shuffle itself is unit
    // tested) and every answer resets to un-answered.
    await expect.poll(async () =>
      page.locator('.surface-card:visible [class*="font-semibold"]').allInnerTexts(),
    ).not.toEqual(beforeTitles);
    await expect(page.locator('.surface-card:visible button[aria-pressed]').first()).toHaveAttribute('aria-pressed', 'false');
  });

  test('shared quiz QR panel toggles on and off', async ({ page }) => {
    await generateAndComplete(page);
    const url = await publishQuiz(page);
    const slug = url.split('/q/')[1];
    await page.goto(`/q/${slug}`);
    await page.getByRole('button', { name: 'Share QR' }).click();
    await expect(page.getByText('Scan to open this quiz on mobile')).toBeVisible();
    await page.getByRole('button', { name: 'Hide QR' }).click();
    await expect(page.getByText('Scan to open this quiz on mobile')).toHaveCount(0);
  });
});

test.describe('history', () => {
  test('empty state shows before any quiz is completed', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByRole('heading', { name: 'No quizzes yet' })).toBeVisible();
  });

  test('completed quiz appears in history without a reload', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/Quiz •/)).toBeVisible();
    await expect(page.getByText(/correct/)).toBeVisible();
  });

  test('history refreshes on re-activation after a new completion', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/correct/)).toBeVisible();
    await returnToFreshSetup(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    await completeQuiz(page, true);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    // Both attempts (the original + the new completion) must be listed after
    // re-activation — each attempt subtitle contains "correct".
    await expect(page.getByText(/correct/)).toHaveCount(2, { timeout: 10_000 });
  });

  test('search filters attempts by title', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/Quiz •/)).toBeVisible();
    await page.getByLabel('Search history').fill('zzz-no-match');
    await expect(page.getByText('No attempts match your filters.')).toBeVisible();
    await page.getByLabel('Search history').fill('Quiz');
    await expect(page.getByText(/Quiz •/)).toBeVisible();
  });

  test('score band and format filters narrow the list', async ({ page }) => {
    await generateAndComplete(page, false); // low score
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/correct/)).toBeVisible();
    await page.getByLabel('Filter by score').selectOption('mastered');
    await expect(page.getByText('No attempts match your filters.')).toBeVisible();
    await page.getByLabel('Filter by score').selectOption('needs-work');
    await expect(page.getByText(/correct/)).toBeVisible();
  });

  test('delete removes an attempt', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/correct/)).toBeVisible();
    await page.getByTitle('Delete this attempt').click();
    await expect(page.getByRole('heading', { name: 'No quizzes yet' })).toBeVisible();
  });

  test('retake loads the stored quiz into the runner', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/correct/)).toBeVisible();
    await page.getByTitle('Retake this quiz with a fresh shuffle').click();
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
  });

  test('history with two attempts renders the score trend chart with no recharts warnings', async ({ page }) => {
    await generateAndComplete(page, true);
    await returnToFreshSetup(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    await completeQuiz(page, false);
    const errors = attachErrorTracking(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByRole('heading', { name: 'Score Trend' })).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('.recharts-wrapper');
      return !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    });
    expect(errors.get().filter(e => /width\(0\)|height\(0\)|ResponsiveContainer/i.test(e))).toHaveLength(0);
  });

  test('daily goal can be set and updates the heatmap', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByRole('heading', { name: 'Daily Goal' })).toBeVisible();
    await page.getByRole('button', { name: 'Set daily goal' }).click();
    await page.getByLabel('Daily question goal').fill('20');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: /Goal: 20\/day/ })).toBeVisible();
    await expect(page.getByText(/questions today/)).toBeVisible();
  });

  test('history item Share button publishes the attempt and shows QR card', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/correct/)).toBeVisible();
    await page.getByTitle('Share this quiz').click();
    const qr = page.getByText('Scan to share');
    await expect(qr).toBeVisible();
    const urlText = await page.locator('p[class*="break-all"]').first().innerText();
    expect(urlText.trim()).toMatch(/\/q\//);
  });

  test('history item Export dropdown allows exporting Anki deck', async ({ page }) => {
    await generateAndComplete(page);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/correct/)).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Export quiz').click();
    await page.getByRole('menuitem', { name: 'Anki (.txt)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/anki\.txt$/);
  });
});