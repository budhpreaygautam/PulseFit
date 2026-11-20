import { expect, type Page } from '@playwright/test';
import { signInAs, test, useAppMode } from './helpers';

// The Timetable scrolls smoothly in the app (the owner's phone measured 7.95% janky frames on it): its
// calendar day tiles draw one tight shadow pair instead of two 12 px blurs, and its filters card, which
// holds selects, fades in without moving (Chrome re-lays out and repaints a moving card with a select on
// every frame). The website keeps both as they were.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const dayTile = (page: Page) => page.getByRole('grid').locator('button.neu-btn').first();
const filtersCard = (page: Page) => page.getByRole('group', { name: 'Category' }).locator('xpath=ancestor::div[contains(@class, "neu-flat")][1]');
const shadow = (blur: number, offset: number) =>
  new RegExp(`^rgba?\\([^)]*\\) ${offset}px ${offset}px ${blur}px 0px, rgba?\\([^)]*\\) -${offset}px -${offset}px ${blur}px 0px, rgba?\\([^)]*\\) 1px 1px 0px 0px inset$`);

test('in the app the day tiles have the cheap shadow and the filters card fades in without moving; the website keeps its own', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await expect(page.locator('#day-panel li').first()).toBeVisible();
  await expect(dayTile(page)).toHaveCSS('box-shadow', shadow(12, 5));
  await expect(filtersCard(page)).not.toHaveClass(/card-/);

  await useAppMode(page);
  await page.goto('/schedule');
  await expect(page.locator('#day-panel li').first()).toBeVisible();
  await expect(dayTile(page)).toHaveCSS('box-shadow', shadow(6, 3));
  // Below the fold, both wait hidden; a card without a select waits lower, to rise.
  await expect(filtersCard(page)).toHaveClass(/card-pending/);
  await expect(filtersCard(page)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.locator('#day-panel li.card-pending').first()).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 16)');
  // It still comes into view and settles.
  await filtersCard(page).scrollIntoViewIfNeeded();
  await expect(filtersCard(page)).not.toHaveClass(/card-/);
  await expect(filtersCard(page)).toHaveCSS('opacity', '1');
});
