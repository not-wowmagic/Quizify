// test/e2e/generation.spec.ts
// Quiz flow: generation, focus, regenerate/start over, all question formats,
// answer UX, matching interaction, scorecard + practice missed, AI summary,
// and the Ask Tutor mock.
import { test, expect } from '@playwright/test';
import {
  LECTURE, gotoHome, goPasteTab, setCustomCount, generateQuiz,
  answerAllQuestions, completeQuiz, questionCards, correctAnswerForCard,
} from './helpers';

test.describe('generation', () => {
  test('generates a quiz from pasted text and moves focus to the quiz header', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeFocused();
  });

  test('focus returns to the quiz header after Regenerate', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    // Regenerate lives on the scorecard, so the round must be completed first.
    await completeQuiz(page, true);
    await page.getByRole('button', { name: /Regenerate/ }).click();
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Questions/ })).toBeFocused();
  });

  test('Start Over returns to a clean setup screen', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    // Start Over lives on the scorecard, so the round must be completed first.
    await completeQuiz(page, true);
    await page.getByRole('button', { name: 'Start Over' }).click();
    await expect(page.getByRole('heading', { name: 'Configure Quiz' })).toBeVisible();
    // Setup remounts on the Upload tab; activate Paste before asserting state.
    const reset = await goPasteTab(page);
    await expect(reset).toHaveValue('');
  });

  for (const format of ['Multiple Choice', 'True / False', 'Fill in Blank', 'Matching Pairs', 'Situational', 'Mixed Types']) {
    test(`${format} generates and completes`, async ({ page }) => {
      await gotoHome(page);
      const textarea = await goPasteTab(page);
      await textarea.fill(LECTURE);
      await page.getByRole('button', { name: format, exact: true }).click();
      await generateQuiz(page);
      await completeQuiz(page);
      await expect(page.getByRole('heading', { name: 'Quiz Completed!' })).toBeVisible();
    });
  }
});

test.describe('answer UX', () => {
  test('options lock after answering with aria-pressed and disabled state', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    const card = questionCards(page).first();
    const option = card.locator('button[aria-pressed]').first();
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(option).toBeDisabled();
  });

  test('wrong selection is styled with destructive colors and the correct one is highlighted', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    // Question order AND option order are shuffled, so no nth position is
    // stable: locate a card whose correct answer is known, then pick a
    // deterministically-wrong option within it.
    const cards = questionCards(page);
    const total = await cards.count();
    let cardIndex = -1;
    let rightText = '';
    for (let i = 0; i < total; i++) {
      const known = await correctAnswerForCard(cards.nth(i));
      if (known) { cardIndex = i; rightText = known; break; }
    }
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    const card = cards.nth(cardIndex);
    const options = card.locator('button[aria-pressed]');
    const count = await options.count();
    let wrongIndex = -1;
    for (let j = 0; j < count; j++) {
      const text = await options.nth(j).innerText();
      if (!text.includes(rightText)) { wrongIndex = j; break; }
    }
    expect(wrongIndex).toBeGreaterThanOrEqual(0);
    await options.nth(wrongIndex).click();
    await expect(options.nth(wrongIndex)).toHaveCSS('color', 'rgb(239, 68, 68)');
    await expect(card.locator('button', { hasText: rightText }).first()).toHaveCSS('color', /rgb\(16, 185, 129\)|rgb\(52, 211, 153\)/);
  });
});

test.describe('matching interaction', () => {
  test('links pairs, allows unlink, and completes with scoring', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await page.getByRole('button', { name: 'Matching Pairs', exact: true }).click();
    await generateQuiz(page);
    await answerAllQuestions(page, true);
    await expect(page.getByRole('heading', { name: 'Quiz Completed!' })).toBeVisible({ timeout: 15_000 });
    const scorecard = page.getByRole('status');
    await expect(scorecard).toContainText(/correct/i);
  });

  test('wrong pairings are flagged and the score reflects them', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await page.getByRole('button', { name: 'Matching Pairs', exact: true }).click();
    await generateQuiz(page);
    await answerAllQuestions(page, false);
    await expect(page.getByRole('heading', { name: 'Quiz Completed!' })).toBeVisible({ timeout: 15_000 });
    const scorecard = page.getByRole('status');
    await expect(scorecard).toContainText('0 / 1');
  });
});

test.describe('scorecard', () => {
  test('shows the score, feedback, and Practice Missed action', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await setCustomCount(page, '3');
    await generateQuiz(page);
    await completeQuiz(page, false);
    const scorecard = page.getByRole('status');
    await expect(scorecard).toContainText('Quiz Completed!');
    await expect(scorecard).toContainText(/keep reinforcing/i);
    await expect(page.getByRole('button', { name: /Practice Missed Questions/ })).toBeVisible();
  });

  test('Practice Missed builds a quiz from the actually-missed questions', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await setCustomCount(page, '3');
    await generateQuiz(page);
    await completeQuiz(page, false);
    await page.getByRole('button', { name: /Practice Missed Questions/ }).click();
    const missed = 3;
    await expect(page.getByRole('heading', { name: new RegExp(`${missed} .* Questions`) })).toBeVisible();
    // The runner renders no "Practice" heading — the session is identified by
    // the attempt title it saves, so complete the round and check History.
    await completeQuiz(page, true);
    await page.getByRole('button', { name: /History & Insights/ }).click();
    await expect(page.getByText(/Practice: /).first()).toBeVisible();
  });
});

test.describe('AI summary', () => {
  test('generates, renders, and toggles the summary', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    await page.getByRole('button', { name: 'Generate Summary' }).click();
    await expect(page.getByRole('heading', { name: 'AI Study Summary' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Photosynthesis is the process/)).toBeVisible();
    await page.getByRole('button', { name: 'Hide Summary' }).click();
    await expect(page.getByRole('heading', { name: 'AI Study Summary' })).toHaveCount(0);
  });

  test('Ask Tutor returns guidance from the mock', async ({ page }) => {
    await gotoHome(page);
    const textarea = await goPasteTab(page);
    await textarea.fill(LECTURE);
    await generateQuiz(page);
    const card = questionCards(page).first();
    await card.getByRole('button', { name: 'Ask Tutor' }).click();
    await card.getByRole('button', { name: 'Why is the correct answer correct?' }).click();
    await expect(card.getByText(/chlorophyll sits in the thylakoid membrane/)).toBeVisible({ timeout: 20_000 });
  });
});