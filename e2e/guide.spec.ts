import { expect, Page } from '@playwright/test';
import { signInAs, test, trackConsoleErrors } from './helpers';

// The training plans, diet charts, supplements guide (/guide) and the strength split (/strength)
// are for signed-in accounts. Guests get a teaser and a way to sign in, and the full content is
// never sent to them: it comes from GET /api/guide, which needs a session.

// Lines that only the full guide holds (server/src/content/guide.ts).
const PLAN_EXERCISE = 'Barbell Flat Bench Press';
const MEAL = 'Oats & High-Protein Fuel Bowl';
const SUPPLEMENT = 'Creatine Monohydrate (Creapure®)';
const SPLIT_EXERCISE = 'Barbell bench press 4×8';

/** Every request the page makes for the full guide. */
function guideRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', r => {
    if (new URL(r.url()).pathname === '/api/guide') urls.push(r.url());
  });
  return urls;
}

test('a guest sees the guide teaser and a call to sign in, never the full charts', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const requests = guideRequests(page);
  await page.goto('/guide');
  const main = page.getByRole('main');

  // The intro and the section tabs stay public.
  await expect(main.getByRole('heading', { level: 1, name: 'TRAINING PLANS, DIETS & SUPPLEMENTS' })).toBeVisible();
  await expect(main.getByRole('tab')).toHaveCount(3);

  // Workout plans: names and one line each, then the way in. No day-by-day table.
  const panel = main.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: '5-Day Push / Pull / Legs (PPL)' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Sign in to open the full workout plans' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Create a free account' })).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(0);
  await expect(main).not.toContainText(PLAN_EXERCISE);

  await main.getByRole('tab', { name: 'Diet & meal charts' }).click();
  await expect(panel.getByRole('heading', { name: 'Pure Vegetarian High-Protein Plan' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Sign in to open the full diet charts' })).toBeVisible();
  await expect(main).not.toContainText(MEAL);
  await expect(main).not.toContainText('kcal');

  await main.getByRole('tab', { name: 'Supplements guide' }).click();
  await expect(panel.getByRole('heading', { name: 'Creatine monohydrate' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Sign in to read the full supplements guide' })).toBeVisible();
  await expect(main).not.toContainText(SUPPLEMENT);
  await expect(main).not.toContainText('Standard Dose');

  // "Create a free account" opens the sign-up dialog, as the other pages do.
  await panel.getByRole('button', { name: 'Create a free account' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Create your account' })).toBeVisible();

  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('signing in from the guide shows the full content without a reload', async ({ page }) => {
  await page.goto('/guide');
  await page.evaluate(() => ((window as unknown as { notReloaded: boolean }).notReloaded = true));
  const panel = page.getByRole('main').getByRole('tabpanel');

  await panel.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#auth-email').fill('member@pulsefit.com');
  await dialog.locator('#auth-password').fill('pulse123');
  const guide = page.waitForResponse(r => new URL(r.url()).pathname === '/api/guide');
  await dialog.locator('button[type="submit"]').click();
  expect((await guide).status()).toBe(200);
  await expect(dialog).toBeHidden();

  await expect(page).toHaveURL(/\/guide$/);
  await expect(panel.getByRole('table').first()).toContainText(PLAN_EXERCISE);
  await expect(panel.getByRole('heading', { name: /^Sign in to/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded)).toBe(true);
});

test('a signed-in member reads every section of the guide', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await signInAs(page, request, 'member');
  await page.goto('/guide');
  const main = page.getByRole('main');
  const panel = main.getByRole('tabpanel');

  await expect(panel.getByRole('heading', { level: 2, name: '5-Day Push / Pull / Legs (PPL)' })).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(5);
  await expect(panel.getByRole('table').first()).toContainText(PLAN_EXERCISE);
  await panel.getByRole('button', { name: /4-Day Upper \/ Lower Strength Split/ }).click();
  await expect(panel.getByRole('heading', { level: 2, name: '4-Day Upper / Lower Strength Split' })).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(4);

  await main.getByRole('tab', { name: 'Diet & meal charts' }).click();
  await expect(panel.getByRole('heading', { name: MEAL })).toBeVisible();
  // The day's total is added up from the meals: 650 + 320 + 850 + 380 + 280 + 520.
  await expect(panel.getByText('≈ 3,000 kcal a day')).toBeVisible();
  await expect(panel.getByText('Drink 3.5 to 4.5 Liters of water daily', { exact: false })).toBeVisible();

  await main.getByRole('tab', { name: 'Supplements guide' }).click();
  await expect(panel.getByRole('heading', { name: SUPPLEMENT })).toBeVisible();
  await expect(panel.getByText('3g to 5g daily (consistent every day)')).toBeVisible();

  await expect(main.getByRole('heading', { name: /^Sign in to/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the strength page keeps its split for signed-in accounts and the rest public', async ({ page, request }) => {
  const requests = guideRequests(page);
  await page.goto('/strength');
  const main = page.getByRole('main');
  // Public: the floor, the classes and the split's days.
  await expect(main.getByRole('heading', { name: "WHAT YOU'LL TRAIN WITH" })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'A 4-DAY BODY-PART SPLIT' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Chest & triceps' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Sign in to see the full split' })).toBeVisible();
  await expect(main).not.toContainText(SPLIT_EXERCISE);
  await expect(main.getByRole('button', { name: 'Log this workout' })).toHaveCount(0);
  expect(requests).toEqual([]);

  await signInAs(page, request, 'trainer');
  await page.reload();
  await expect(main.getByText(SPLIT_EXERCISE)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Log this workout' })).toHaveCount(4);
  await expect(main.getByRole('heading', { name: 'Sign in to see the full split' })).toHaveCount(0);
});
