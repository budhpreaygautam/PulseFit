import { expect, type Page } from '@playwright/test';
import { signInAs, tabBar, test, trackConsoleErrors, useAppMode } from './helpers';

// The gym's services in the app: the guests' Services tab (prices from GET /api/plans), the welcome
// panel's tiles and member Home's tiles. Gated services still ask a guest to sign in first.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const SERVICES = ['Strength floor', 'Zumba studio', 'Coaches', 'Plans & diets', 'Exercises', 'Memberships'];
const signInDialog = (page: Page) => page.getByRole('dialog', { name: 'Sign in to PulseFit' });
const servicesList = (page: Page) => page.getByRole('list', { name: 'Services' });
const card = (page: Page, name: string) => servicesList(page).getByRole('link', { name: new RegExp(`^${name}`) });

type Plan = { price_monthly: number; categories: string[] };
/** The cheapest monthly price of a plan covering `category` (a plan with no categories covers all), or of any plan. */
const cheapest = (plans: Plan[], category?: string) =>
  Math.min(...plans.filter(p => !category || p.categories.length === 0 || p.categories.includes(category)).map(p => p.price_monthly));
const fromPrice = (n: number) => `From ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)}/mo`;

/** The welcome panel, without the first launch's slides. */
async function openWelcome(page: Page, size?: { width: number; height: number }): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('pulsefit_welcome_seen', '1'));
  await useAppMode(page);
  if (size) await page.setViewportSize(size);
  await page.goto('/');
}

async function openServices(page: Page): Promise<void> {
  await openWelcome(page);
  await page.getByRole('button', { name: 'Explore first' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
}

test('the guest Services screen lists the six services, with the starting prices GET /api/plans gives', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const res = await request.get('/api/plans');
  expect(res.ok()).toBeTruthy();
  const plans: Plan[] = (await res.json()).data;
  await openServices(page);
  await expect(page.getByText('Strength & Zumba gym · Sector 29, Gurugram')).toBeVisible();
  await expect(tabBar(page).getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
  const cards = servicesList(page).getByRole('link');
  await expect(cards).toHaveCount(SERVICES.length);
  for (const [i, name] of SERVICES.entries()) await expect(cards.nth(i)).toHaveText(new RegExp(`^${name}`));
  await expect(card(page, 'Strength floor')).toContainText(fromPrice(cheapest(plans, 'Workout & Strength')));
  await expect(card(page, 'Zumba studio')).toContainText(fromPrice(cheapest(plans, 'Zumba & Cardio')));
  await expect(card(page, 'Memberships')).toContainText(fromPrice(cheapest(plans)));
  for (const name of ['Coaches', 'Plans & diets', 'Exercises']) await expect(card(page, name)).not.toContainText('From ');
  expect(errors).toEqual([]);
});

test('without the plans the cards still show, with no prices', async ({ page }) => {
  await page.route('**/api/plans', route => route.abort());
  // Wait for the failure itself: before it, the screen is still loading and shows no prices either.
  const failed = page.waitForEvent('requestfailed', r => new URL(r.url()).pathname === '/api/plans');
  await openServices(page);
  await failed;
  await expect(servicesList(page).getByRole('link')).toHaveCount(SERVICES.length);
  await expect(servicesList(page)).not.toContainText('From ');
});

test('a guest tapping a gated service signs in from the dialog and lands on that service', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await openServices(page);
  await card(page, 'Zumba studio').click();
  await expect(signInDialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /^DANCE\. SWEAT\./ })).toHaveCount(0);
  await signInDialog(page).getByRole('button', { name: /^Member/ }).click();
  await expect(page).toHaveURL(/\/zumba$/);
  await expect(page.getByRole('heading', { level: 1, name: /^DANCE\. SWEAT\./ })).toBeVisible();
  await expect(tabBar(page).getByRole('link', { name: 'Home' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Get a free pass opens the free-trial form', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await openServices(page);
  await page.getByRole('main').getByRole('button', { name: 'Get a free pass' }).click();
  await expect(page.getByRole('dialog', { name: 'Claim a free 1-day pass' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('See the full overview opens the landing page with Back, and Back returns to Services', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await openServices(page);
  await page.getByRole('link', { name: 'See the full overview' }).click();
  await expect(page).toHaveURL(/\/\?view=full$/);
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeFocused();
  await expect(page.locator('#route-announcer')).toHaveText('Strength & Zumba gym in Gurugram');
  await expect(tabBar(page).getByRole('link', { name: 'Services' })).not.toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeFocused();
  await expect(page.locator('#route-announcer')).toHaveText('Services');
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the welcome panel shows the services; a gated tile asks to sign in, Exercises opens in the guest shell', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await openWelcome(page);
  const offer = page.getByRole('region', { name: 'What we offer' });
  await expect(offer.getByRole('link')).toHaveText(SERVICES);
  await offer.getByRole('link', { name: 'Coaches' }).click();
  await expect(signInDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(signInDialog(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await offer.getByRole('link', { name: 'Exercises' }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Exercise library' })).toBeVisible();
  await expect(tabBar(page).getByRole('link')).toHaveText(['Services', 'Contact']);
  // The title bar's Back: the library also has a "Back" muscle-group filter.
  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('on a 360 px phone the welcome panel and the Services screen fit its width, with tiles of at least 44×44', async ({ page }) => {
  await openWelcome(page, { width: 360, height: 740 });
  const tiles = page.getByRole('region', { name: 'What we offer' }).getByRole('link');
  await expect(tiles).toHaveCount(SERVICES.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const { width, height } of await tiles.evaluateAll(els => els.map(el => ({ width: el.clientWidth, height: el.clientHeight })))) {
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Explore first' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('member Home shows the Services tiles between Rewards and Upcoming classes, and a tile opens its page', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  const services = page.getByRole('region', { name: 'Services' });
  await expect(services.getByRole('link')).toHaveText(SERVICES);
  const rewards = page.getByRole('main').getByRole('button', { name: /^Rewards/ });
  await expect(rewards).toBeVisible();
  const y = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y;
  expect(await y(rewards)).toBeLessThan(await y(services));
  expect(await y(services)).toBeLessThan(await y(page.getByRole('region', { name: 'Upcoming classes' })));
  await services.getByRole('link', { name: 'Coaches' }).click();
  await expect(page).toHaveURL(/\/coaches$/);
  await expect(page.getByRole('heading', { level: 1, name: 'MEET THE COACHES' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the website (no app mode) still shows the landing page on /', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toHaveCount(0);
  await expect(tabBar(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
