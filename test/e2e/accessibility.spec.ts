// test/e2e/accessibility.spec.ts
// A11y + layout + metadata: keyboard view-tab navigation, focus management,
// dark-mode contrast, horizontal overflow at scroll/zoom, theme-toggle layout,
// canonical/noindex metadata, and console/network hygiene.
import { test, expect } from '@playwright/test';
import { LECTURE, gotoHome, goPasteTab, generateQuiz, completeQuiz, attachErrorTracking, questionCards, correctAnswerForCard } from './helpers';

// Publishes a quiz and returns its /q/<slug> path.
async function publishAndSlug(page: import('@playwright/test').Page): Promise<string> {
  await completeQuiz(page, true);
  await page.getByRole('button', { name: 'Share' }).first().click();
  await expect(page.getByText('Scan to share')).toBeVisible();
  const urlText = await page.locator('p[class*="break-all"]').first().innerText();
  return urlText.trim();
}

test.describe('keyboard navigation', () => {
  test('view tabs are reachable and activatable with the keyboard', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('button', { name: /New Quiz/ }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /History & Insights/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'No quizzes yet' })).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: /New Quiz/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Configure Quiz' })).toBeVisible();
  });
});

test.describe('focus management', () => {
  test('focus lands on the quiz header after generation', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeFocused();
  });

  test('focus lands on the shared quiz header after navigation', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    const url = await publishAndSlug(page);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeFocused();
  });
});

test.describe('dark-mode contrast', () => {
  test('normal text and the destructive option pass contrast in dark mode', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Normal text color should be light on the dark background.
    const foreground = await page.locator('body').evaluate(el => getComputedStyle(el).color);
    expect(foreground).toBe('rgb(248, 250, 252)');

    // Option order is shuffled, so pick a deterministically-wrong option;
    // wrong answers render the destructive red (the CSS var --destructive
    // resolves to rgb(239, 68, 68) in dark mode).
    const cards = questionCards(page);
    const total = await cards.count();
    let cardIndex = -1;
    let rightText = '';
    for (let i = 0; i < total; i++) {
      const known = await correctAnswerForCard(cards.nth(i));
      if (known) { cardIndex = i; rightText = known; break; }
    }
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    const options = cards.nth(cardIndex).locator('button[aria-pressed]');
    const count = await options.count();
    let wrongIndex = -1;
    for (let j = 0; j < count; j++) {
      const text = await options.nth(j).innerText();
      if (!text.includes(rightText)) { wrongIndex = j; break; }
    }
    expect(wrongIndex).toBeGreaterThanOrEqual(0);
    await options.nth(wrongIndex).click();
    await expect(options.nth(wrongIndex)).toHaveCSS('color', 'rgb(239, 68, 68)');
  });
});

test.describe('layout / overflow', () => {
  test('no horizontal overflow at top, middle, and bottom scroll positions', async ({ page }) => {
    await gotoHome(page);
    const scrollHeights = await page.evaluate(() => [
      { scrollY: 0 },
      { scrollY: window.innerHeight },
      { scrollY: document.documentElement.scrollHeight },
    ]);
    for (const { scrollY } of scrollHeights) {
      await page.evaluate(y => window.scrollTo(0, y), scrollY);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test('no horizontal overflow at 125% zoom', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      // SAFETY: zoom is a non-standard CSSOM property Chromium honors; the
      // intersection type only adds the property TS does not know about.
      // Applied to <html> (which carries suppressHydrationWarning) so the
      // mutation can never race React hydrating <body>.
      const style = document.documentElement.style as CSSStyleDeclaration & { zoom?: string };
      style.zoom = '1.25';
    });
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('fixed theme toggle does not overlap the hero heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1');
    const hero = await page.locator('h1').boundingBox();
    const toggle = await page.locator('div.fixed.top-4.right-4').boundingBox();
    expect(hero).not.toBeNull();
    expect(toggle).not.toBeNull();
    // The toggle sits in the top-right corner; the hero is centered and below
    // the very top, so the two must not intersect.
    if (hero && toggle) {
      const overlapX = Math.max(0, Math.min(hero.x + hero.width, toggle.x + toggle.width) - Math.max(hero.x, toggle.x));
      const overlapY = Math.max(0, Math.min(hero.y + hero.height, toggle.y + toggle.height) - Math.max(hero.y, toggle.y));
      expect(overlapX * overlapY).toBe(0);
    }
  });
});

test.describe('metadata', () => {
  test('home page has canonical URL and correct title', async ({ page }) => {
    await gotoHome(page);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('/');
    await expect(page).toHaveTitle(/Quizify/);
  });

  test('shared quiz page has canonical /q/slug and noindex robots', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    const url = await publishAndSlug(page);
    await page.goto(url);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('/q/');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('404 page has a sensible title and Back to Quizify link', async ({ page }) => {
    await page.goto('/q/definitely-not-a-real-slug');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page).toHaveTitle(/Quiz not found|Quizify/);
    await expect(page.getByRole('link', { name: 'Back to Quizify' })).toBeVisible();
  });
});

test.describe('console / network hygiene', () => {
  test('generation and completion produce no console errors or failed requests', async ({ page }) => {
    const errors = attachErrorTracking(page);
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    await completeQuiz(page, true);
    await expect.poll(() => errors.get()).toHaveLength(0);
  });

  test('shared quiz page loads without console errors', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    const url = await publishAndSlug(page);
    const errors = attachErrorTracking(page);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => errors.get()).toHaveLength(0);
  });
});