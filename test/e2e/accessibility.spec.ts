// test/e2e/accessibility.spec.ts
// A11y + layout + metadata: keyboard view-tab navigation, focus management,
// light/dark contrast, 44px touch targets, one h1 per view, focus rings,
// horizontal overflow at scroll/zoom, canonical/noindex metadata, and console/network hygiene.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LECTURE, gotoHome, goPasteTab, generateQuiz, completeQuiz, attachErrorTracking, questionCards, correctAnswerForCard } from './helpers';

// Publishes a quiz and returns its /q/<slug> path.
async function publishAndSlug(page: import('@playwright/test').Page): Promise<string> {
  await completeQuiz(page, true);
  await page.getByRole('button', { name: 'Share' }).first().click();
  await expect(page.getByText('Scan to share')).toBeVisible();
  const urlText = await page.locator('p[class*="break-all"]').first().innerText();
  return urlText.trim();
}

/** Visible actions under 44x44. Checkbox/radio hit areas are their labels. */
async function smallTargets(page: import('@playwright/test').Page): Promise<Array<{ text: string; w: number; h: number }>> {
  return page.evaluate(() => {
    const root = document.querySelector('main.quizify-shell') ?? document.body;
    const elements = [...root.querySelectorAll('a[href], button, select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="menuitem"]')];
    return elements
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          text: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      })
      .filter(target => target.w < 44 || target.h < 44);
  });
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
    expect(await page.locator('h1').count()).toBe(1);
  });
});

test.describe('theme contrast', () => {
  test('light and dark themes differ and the themed answer signal stays readable', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);

    // The two themes must produce genuinely different paper and ink colors.
    const html = page.locator('html');
    const body = page.locator('body');
    const readColors = async () => body.evaluate(el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, foreground: style.color };
    });
    const initial = await html.getAttribute('data-theme');
    const light = await readColors();
    const toggle = page.getByRole('button', { name: /toggle color theme/i });
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', initial === 'dark' ? 'light' : 'dark');
    const dark = await readColors();
    expect(dark.background).not.toBe(light.background);
    expect(dark.foreground).not.toBe(light.foreground);
    expect(light.foreground).not.toBe('rgb(255, 255, 255)');
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', initial ?? 'light');

    // Option order is shuffled, so pick a deterministically-wrong option;
    // Wrong answers use the destructive signal.
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
    await expect(options.nth(wrongIndex)).toHaveAttribute('data-answer-state', 'incorrect');
    await expect(options.nth(wrongIndex)).toHaveClass(/bg-destructive\/10/);
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

  test('does not render a fixed theme control', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('div.fixed.top-4.right-4')).toHaveCount(0);
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

test.describe('axe accessibility audit', () => {
  const seriousViolations = async (page: import('@playwright/test').Page) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    return results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
  };

  test('home page has no critical or serious violations', async ({ page }) => {
    await gotoHome(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('quiz runner has no critical or serious violations', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('shared quiz page has no critical or serious violations', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    const url = await publishAndSlug(page);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('touch targets, zoom, motion, and visual stability', () => {
  test('visible actions are at least 44 by 44 CSS pixels on setup, runner, and history', async ({ page }) => {
    await gotoHome(page);
    expect(await smallTargets(page)).toEqual([]);

    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    expect(await smallTargets(page)).toEqual([]);

    await completeQuiz(page, true);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByRole('heading', { name: 'Past Quizzes' })).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);

    // The public-visibility checkbox uses its full label as the hit area.
    const checkboxLabel = page.locator('label:has(input[type="checkbox"])').first();
    const labelBox = await checkboxLabel.boundingBox();
    expect(labelBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(labelBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('each view has exactly one h1', async ({ page }) => {
    await gotoHome(page);
    expect(await page.locator('h1').count()).toBe(1);

    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    expect(await page.locator('h1').count()).toBe(1);

    await completeQuiz(page, true);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByRole('heading', { name: 'Past Quizzes' })).toBeVisible();
    expect(await page.locator('h1').count()).toBe(1);
  });

  test('raw answer and format buttons expose a 3px focus ring', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);

    let formatFound = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const isFormat = await page.evaluate(() => document.activeElement?.classList.contains('quizify-question-format') ?? false);
      if (isFormat) { formatFound = true; break; }
    }
    expect(formatFound).toBe(true);
    const formatOutline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return { width: '0px', style: 'none', color: '' };
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });
    expect(formatOutline.style).toBe('solid');
    expect(formatOutline.width).toBe('3px');

    await generateQuiz(page, 3);
    let answerFound = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const isAnswer = await page.evaluate(() => document.activeElement?.classList.contains('quizify-answer-option') ?? false);
      if (isAnswer) { answerFound = true; break; }
    }
    expect(answerFound).toBe(true);
    const answerOutline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return { width: '0px', style: 'none', color: '' };
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });
    expect(answerOutline.style).toBe('solid');
    expect(answerOutline.width).toBe('3px');
  });

  test('no horizontal overflow at 200% zoom', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      // SAFETY: zoom is a non-standard CSSOM property Chromium honors; the
      // intersection type only adds the property TS does not know about.
      const style = document.documentElement.style as CSSStyleDeclaration & { zoom?: string };
      style.zoom = '2';
    });
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('reduced motion disables reveal animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHome(page);
    const animation = await page.locator('.quizify-workspace').first().evaluate(
      el => getComputedStyle(el).animationName,
    );
    expect(animation).toBe('none');
  });

  test('theme switch changes the rendered page without changing its footprint', async ({ page }) => {
    await gotoHome(page);
    const light = await page.screenshot();
    await page.getByRole('button', { name: /toggle color theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await page.screenshot();
    expect(light.length).toBeGreaterThan(1000);
    expect(dark.length).toBeGreaterThan(1000);
    expect(dark.equals(light)).toBe(false);
    expect(dark.readUInt32BE(16)).toBe(light.readUInt32BE(16));
    expect(dark.readUInt32BE(20)).toBe(light.readUInt32BE(20));
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
