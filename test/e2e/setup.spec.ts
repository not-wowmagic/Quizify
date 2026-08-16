// test/e2e/setup.spec.ts
// Home + setup: dark theme, overflow/console hygiene, view toggling, input
// tabs, validation, custom counts, upload/web/camera flows, incognito mode.
import { test, expect } from '@playwright/test';
import { LECTURE, gotoHome, goPasteTab, setCustomCount, generateQuiz, attachErrorTracking } from './helpers';

test.describe('home page', () => {
  test('loads with dark theme, no horizontal overflow, and no console errors', async ({ page }) => {
    const errors = attachErrorTracking(page);
    await gotoHome(page);
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(500);
    expect(errors.get()).toHaveLength(0);
  });

  test('view tabs switch between New Quiz and History & Insights', async ({ page }) => {
    await gotoHome(page);
    const historyTab = page.getByRole('button', { name: /History & Insights/ });
    await historyTab.click();
    await expect(page.getByRole('heading', { name: 'No quizzes yet' })).toBeVisible();
    await page.getByRole('button', { name: /New Quiz/ }).click();
    await expect(page.getByRole('heading', { name: 'Configure Quiz' })).toBeVisible();
  });
});

test.describe('input tabs', () => {
  test('switches between Upload / Paste / Web / Camera', async ({ page }) => {
    await gotoHome(page);
    const tabs = page.getByRole('tab');
    const labels = ['Upload', 'Paste', 'Web', 'Camera'];
    for (const label of labels) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('data-state', 'active');
    }
    expect(await tabs.count()).toBe(4);
  });

  test('input tabs respond to keyboard arrow navigation', async ({ page }) => {
    await gotoHome(page);
    const upload = page.getByRole('tab', { name: 'Upload', exact: true });
    await upload.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Paste', exact: true })).toHaveAttribute('data-state', 'active');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Web', exact: true })).toHaveAttribute('data-state', 'active');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Camera', exact: true })).toHaveAttribute('data-state', 'active');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Web', exact: true })).toHaveAttribute('data-state', 'active');
  });
});

test.describe('validation', () => {
  test('Generate is disabled until text is provided', async ({ page }) => {
    await gotoHome(page);
    await goPasteTab(page);
    const generate = page.getByRole('button', { name: /Generate Quiz/ });
    await expect(generate).toBeDisabled();
  });

  test('shows an Invalid Input toast for text shorter than 100 characters', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill('Too short');
    await page.getByRole('button', { name: /Generate Quiz/ }).click();
    // Exact/anchored matches: Radix mirrors toast text into its
    // screen-reader live region (role="status"), so plain substring
    // matches can strict-violate on two elements depending on timing.
    await expect(page.getByText('Invalid Input', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Please provide enough text \(at least 100 characters\) and a valid question count \(1-50\)\.$/)).toBeVisible();
  });

  test('clamps custom question count to 1-50 on blur', async ({ page }) => {
    await gotoHome(page);
    await goPasteTab(page);
    await setCustomCount(page, '0');
    await expect(page.getByLabel('Custom number of questions')).toHaveValue('1');
    await setCustomCount(page, '999');
    await expect(page.getByLabel('Custom number of questions')).toHaveValue('50');
  });

  test('custom count of 1 generates a single-question quiz', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await setCustomCount(page, '1');
    await generateQuiz(page);
    await expect(page.getByRole('heading', { name: /1 .* Questions/ })).toBeVisible();
  });

  test('custom count of 50 generates 50 questions', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await setCustomCount(page, '50');
    await generateQuiz(page);
    await expect(page.getByRole('heading', { name: /50 .* Questions/ })).toBeVisible();
  });

  test('preset count buttons select the matching count', async ({ page }) => {
    await gotoHome(page);
    for (const n of [5, 10, 15, 20]) {
      await page.getByRole('button', { name: String(n), exact: true }).click();
      await expect(page.getByRole('button', { name: String(n), exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
  });
});

test.describe('upload tab', () => {
  test('rejects an unsupported file type with an error toast', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Upload', exact: true }).click();
    await page.locator('#dropzone-file').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a pdf'),
    });
    await expect(page.getByText('File Processing Error', { exact: true })).toBeVisible();
  });

  test('accepts a drag-and-dropped file and reports a processing error', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Upload', exact: true }).click();
    // onDrop lives on the dropzone's wrapping div, not the hidden input, and
    // the handler reads event.dataTransfer.files — so dispatch a real DOM
    // drop with a real DataTransfer on the container.
    await page.evaluate(() => {
      const dropzone = document.querySelector<HTMLInputElement>('#dropzone-file')?.closest('div');
      if (!dropzone) throw new Error('dropzone container not found');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['%PDF-1.4 not really'], 'lecture.pdf', { type: 'application/pdf' }));
      dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    });
    await expect(page.getByText('File Processing Error', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('web tab', () => {
  test('rejects a malformed URL with an inline error', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Web', exact: true }).click();
    const urlInput = page.getByLabel('Article URL');
    await urlInput.fill('not a url');
    await page.getByRole('button', { name: 'Fetch' }).click();
    await expect(page.getByRole('status')).toContainText(/full URL starting with http/i);
  });

  test('fetches a valid article URL on Enter and enables generation', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Web', exact: true }).click();
    const urlInput = page.getByLabel('Article URL');
    await urlInput.fill('https://en.wikipedia.org/wiki/Photosynthesis');
    await urlInput.press('Enter');
    await expect(page.getByRole('status')).toContainText(/Ready to generate/i);
    const generate = page.getByRole('button', { name: /Generate Quiz/ });
    await expect(generate).toBeEnabled();
  });

  test('shows an error for an unreachable host', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Web', exact: true }).click();
    const urlInput = page.getByLabel('Article URL');
    await urlInput.fill('https://nonexistent.invalid/article');
    await page.getByRole('button', { name: 'Fetch' }).click();
    await expect(page.getByRole('status')).toContainText(/could not reach/i);
  });
});

test.describe('camera tab', () => {
  test('shows an error for a non-image file', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Camera', exact: true }).click();
    await page.locator('#camera-file').setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF'),
    });
    await expect(page.getByRole('status')).toContainText(/unsupported image format/i);
  });

  test('extracts text from a valid image via OCR', async ({ page }) => {
    await gotoHome(page);
    await page.getByRole('tab', { name: 'Camera', exact: true }).click();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.locator('#camera-file').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('status')).toContainText(/Extracted .* characters/i);
    const generate = page.getByRole('button', { name: /Generate Quiz/ });
    await expect(generate).toBeEnabled();
  });
});

test.describe('incognito mode', () => {
  test('generates normally, hides Share, and records no history', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await page.getByRole('switch', { name: '' }).click();
    await generateQuiz(page);
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByRole('heading', { name: 'No quizzes yet' })).toBeVisible();
  });
});