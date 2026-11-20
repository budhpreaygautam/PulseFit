import { expect, type Page } from '@playwright/test';
import { auth, countTransitions, signInAs, tabBar, test, trackConsoleErrors, transitions, useAppMode } from './helpers';

// App-mode motion: view transitions between pages, rising cards, the filling ring, count-up numbers,
// press-in buttons and shimmer placeholders; all of it off when the phone asks for reduced motion.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const navKind = (page: Page) => page.evaluate(() => document.documentElement.dataset.nav);

test('cards rise in with a 40 ms stagger capped at the eighth, within 150–350 ms', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await expect(page.locator('.app-rise').first()).toBeVisible();
  const styles = await page.locator('.app-rise').evaluateAll(els => els.map(el => {
    const s = getComputedStyle(el);
    return [s.animationName, s.animationDuration, s.animationDelay];
  }));
  expect(styles.length).toBeGreaterThan(1);
  styles.forEach((style, i) => expect(style).toEqual(['app-rise', '0.3s', `${Math.min(i, 7) * 0.04}s`]));
});

test('tab switches cross-fade, sub-screens slide in and Back slides out', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await expect.poll(() => transitions(page)).toBe(1);
  expect(await navKind(page)).toBe('tab');
  await tabBar(page).getByRole('link', { name: 'Me', exact: true }).click();
  await page.getByRole('link', { name: 'Password & two-step sign-in' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=security$/);
  expect(await navKind(page)).toBe('push');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(await navKind(page)).toBe('pop');
  // The URL changes before the transition swaps the screen: wait for Me's own screen (no title bar).
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  // Android Back from one tab's screen to another cross-fades, as the tab tap did.
  await page.goBack();
  await expect(page).toHaveURL(/\/schedule$/);
  expect(await navKind(page)).toBe('tab');
});

test('switching sections inside a page does not slide the screen in again', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile?tab=details');
  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Invoices & billing' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=billing$/);
  expect(await transitions(page)).toBe(0);
});

test('without startViewTransition pages switch instantly and nothing breaks', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await page.addInitScript(() => { delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition; });
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await tabBar(page).getByRole('link', { name: 'Me', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(errors).toEqual([]);
});

test('reduced motion turns every animation off and shows final numbers at once', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countTransitions(page); await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/dashboard');
  await expect(page.locator('.app-rise').first()).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('progressbar', { name: 'Sessions this week' })).toBeVisible();
  expect(await page.locator('[data-count-up]').first().textContent()).toBe(String(me.streak_days));
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  expect(await transitions(page)).toBe(0);
});

test('buttons press in and lists shimmer while loading', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.route('**/api/bookings/my*', async route => { await new Promise(r => setTimeout(r, 1_000)); await route.continue(); });
  await page.goto('/dashboard');
  const shimmer = page.getByRole('status', { name: 'Loading upcoming classes' });
  await expect(shimmer).toBeVisible();
  await expect(shimmer.locator('.app-shimmer').first()).toHaveCSS('animation-name', 'app-shimmer');
  await expect(shimmer).toHaveCount(0);
  const pressRule = await page.evaluate(() => [...document.styleSheets]
    .flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
    .some(rule => rule.cssText.includes('.app-press:active') && rule.cssText.includes('scale(0.97)')));
  expect(pressRule).toBe(true);
});

test('signing out while view transitions run shows the panel without the sign-in dialog', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Me', exact: true }).click();
  await expect.poll(() => transitions(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in to PulseFit' })).toHaveCount(0);
});
