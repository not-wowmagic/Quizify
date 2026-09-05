// Mobile runner coverage: responsive action menu, compact header sizing, and
// horizontal overflow at the phone breakpoint.
import { test, expect } from '@playwright/test';
import { LECTURE, gotoHome, goPasteTab, generateQuiz } from './helpers';

test.describe('mobile runner', () => {
  test('collapses runner actions into More and keeps the header compact', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);

    await expect(page.locator('.quizify-runner-action-row')).toBeHidden();
    const more = page.getByRole('button', { name: 'More', exact: true });
    await expect(more).toBeVisible();

    const header = page.locator('.quizify-runner-header');
    await expect.poll(async () => (await header.boundingBox())?.height ?? 0).toBeGreaterThan(0);
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox?.height).toBeLessThan(320);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await more.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    for (const label of [
      'Anki (.txt)',
      'CSV',
      'Print / PDF',
      'Study Cram Sheet',
      'Share',
      'Link only',
      'Generate Summary',
      'Settings',
    ]) {
      await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    }
  });
});
