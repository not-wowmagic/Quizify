// test/e2e/exports.spec.ts
// Exports: Anki/CSV downloads, print + cram sheet popups (CSP-safe, no inline
// scripts, window.print() actually invoked), and the scorecard Export button.
import { test, expect } from '@playwright/test';
import { LECTURE, gotoHome, goPasteTab, generateQuiz, completeQuiz } from './helpers';

test.describe('downloads', () => {
  test('Anki download has the right filename and tab-separated content', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Anki (.txt)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('quizify-anki.txt');
    const path = await download.path();
    const content = await (await import('node:fs/promises')).readFile(path!, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    expect(content).toContain('\t');
  });

  test('CSV download has the expected header row and topic column', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('quizify-quiz.csv');
    const path = await download.path();
    const content = await (await import('node:fs/promises')).readFile(path!, 'utf8');
    const header = content.split('\n')[0];
    expect(header).toBe('Question,Options,Correct Answer,Topic');
    expect(content).toContain('PhotosynthesisOverview');
  });
});

test.describe('print', () => {
  test('Print / PDF opens a popup with the study sheet and no inline scripts, and calls print()', async ({ page }) => {
    // SAFETY: window.print is a real Window method; we swap it for a no-op
    // stub that marks the document before the popup ever loads, so the host's
    // print() call is observable without opening a native print dialog.
    await page.context().addInitScript(() => {
      window.print = () => {
        document.documentElement.dataset.printed = 'true';
      };
    });

    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Print / PDF' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    // The payload must be CSP-safe: no inline <script> elements.
    const inlineScripts = await popup.evaluate(() => document.querySelectorAll('script').length);
    expect(inlineScripts).toBe(0);
    await expect(popup.locator('h1').first()).toContainText('Quizify Study Sheet');
    // The host must have actually invoked window.print() on the popup.
    await expect
      .poll(async () => popup.evaluate(() => document.documentElement.dataset.printed))
      .toBe('true');
  });

  test('Study Cram Sheet opens a popup grouped by topic', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Study Cram Sheet' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('h1').first()).toContainText('Cram Sheet for');
    // Grouped by topic: multiple topic headings with questions under each.
    await expect(popup.locator('h2').first()).toBeVisible();
    await expect(popup.locator('h2').first()).toHaveText(/.+/);
    await expect(popup.locator('h2')).toHaveCount(5);
    await expect(popup.locator('h2 + ul li').first()).toBeVisible();
  });

  test('scorecard Export dropdown downloads the Anki deck', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page, 3);
    await completeQuiz(page, true);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('status').getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Anki (.txt)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('quizify-anki.txt');
  });
});