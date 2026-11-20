import { expect, type Page } from '@playwright/test';
import { countTransitions, offerApp, signInAs, test, trackConsoleErrors, transitionAnimations, transitions, useAppMode } from './helpers';

// Inside the Android/iOS app (app mode) the app is the website: the same header with its menu, pages
// and footer, opening on the homepage. Only page animations are added: a new page slides in, Back
// slides it out, and the header stays still. None with reduced motion, and none on the website.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const header = (page: Page) => page.getByRole('banner');
const menu = (page: Page) => page.locator('#mobile-menu');
const navKind = (page: Page) => page.evaluate(() => document.documentElement.dataset.nav);

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function openFromMenu(page: Page, name: string): Promise<void> {
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await menu(page).getByRole('link', { name, exact: true }).click();
}

/** Emulates a phone's safe-area insets; false when this Chromium cannot. Call after setting the viewport, which resets them. */
async function emulateInsets(page: Page, insets: Record<string, number>): Promise<boolean> {
  const cdp = (await page.context().newCDPSession(page)) as unknown as { send(method: string, params: object): Promise<unknown> };
  return cdp.send('Emulation.setSafeAreaInsetsOverride', { insets }).then(() => true, () => false);
}

test('the app opens on the website homepage with its header, menu and footer, and no app download offers', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await offerApp(page); await useAppMode(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explore first' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toHaveCount(0);
  await expect(page.locator('footer').getByRole('link', { name: 'Get the Android app' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a page opened from the menu slides in, Back slides it out, and the header stays still', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await countTransitions(page); await useAppMode(page);
  await page.goto('/');
  await expect(header(page)).toHaveCSS('view-transition-name', 'app-header');
  await openFromMenu(page, 'Contact us');
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => transitions(page)).toBe(1);
  expect(await navKind(page)).toBe('push');
  // index.css's slide runs on the page, and the header is captured on its own (so it does not slide).
  await expect.poll(() => transitionAnimations(page)).toContain('::view-transition-new(root) app-slide-in');
  expect((await transitionAnimations(page)).some(a => a.startsWith('::view-transition-group(app-header) '))).toBe(true);
  // The toasts are captured on their own too, so the still header never covers them.
  expect((await transitionAnimations(page)).some(a => a.startsWith('::view-transition-group(app-toasts) '))).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect.poll(() => transitions(page)).toBe(2);
  expect(await navKind(page)).toBe('pop');
  await expect.poll(() => transitionAnimations(page)).toContain('::view-transition-old(root) app-slide-out');
  expect(errors).toEqual([]);
});

test('a demo member signs in through the sign-in dialog and reaches their dashboard and account', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page);
  await page.goto('/');
  await header(page).getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('dialog', { name: 'Sign in to PulseFit' }).getByRole('button', { name: /^Member/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Hi, / })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Show my QR entry pass' })).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toHaveCount(0);
  await openFromMenu(page, 'My account');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
  // Signing in opened the dashboard once, as on the website, so Back goes to it and then home.
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Back returns to where the page was left (${reducedMotion} motion)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await useAppMode(page);
    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();
    // Deeper than Contact us is tall, so a restore on the page being left would be cut short.
    await page.evaluate(() => window.scrollTo(0, 6000));
    await expect.poll(() => scrollY(page)).toBe(6000);
    await openFromMenu(page, 'Contact us');
    await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
    await expect.poll(() => scrollY(page)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    // At or a little below: the homepage's images and data load again and grow above that point, and
    // the browser keeps what is on screen in place, as on the website.
    await expect.poll(() => scrollY(page)).toBeGreaterThanOrEqual(6000);
    expect(await scrollY(page)).toBeLessThan(7000);
  });
}

test('two quick Backs skip the first slide without an error and end two pages back', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await openFromMenu(page, 'Rewards');
  await expect(page).toHaveURL(/\/rewards$/);
  await openFromMenu(page, 'My account');
  await expect(page).toHaveURL(/\/profile$/);
  await page.evaluate(() => { history.back(); history.back(); });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Hi, / })).toBeVisible();
  expect(errors).toEqual([]);
});

test('switching sections inside a page does not slide it in again, and Profile keeps the bare address', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Invoices & billing' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=billing$/);
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(await transitions(page)).toBe(0);
});

test('signing out after a page slid in goes home without the sign-in dialog', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await openFromMenu(page, 'Rewards');
  await expect.poll(() => transitions(page)).toBe(1);
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await menu(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in to PulseFit' })).toHaveCount(0);
});

test('with reduced motion pages change without a transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countTransitions(page); await useAppMode(page);
  await page.goto('/');
  await openFromMenu(page, 'Contact us');
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(await transitions(page)).toBe(0);
  expect(await navKind(page)).toBeUndefined();
});

test('without startViewTransition pages switch instantly and nothing breaks', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.addInitScript(() => { delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition; });
  await useAppMode(page);
  await page.goto('/');
  await openFromMenu(page, 'Contact us');
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('on a notched phone the header stays below the status bar', async ({ page }) => {
  await useAppMode(page);
  const emulated = await emulateInsets(page, { top: 40 });
  await page.goto('/');
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(header(page)).toHaveClass(/top-\[env\(safe-area-inset-top\)\]/);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 600));
  expect((await header(page).getByRole('button', { name: 'Open menu' }).boundingBox())!.y).toBeGreaterThanOrEqual(40);
});

test('in landscape the header and pages keep clear of the side nav bar and cutout', async ({ page }) => {
  await useAppMode(page);
  await page.setViewportSize({ width: 915, height: 412 });
  const emulated = await emulateInsets(page, { left: 48, right: 32 });
  await page.goto('/');
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(header(page).locator('xpath=..')).toHaveClass(/pl-\[env\(safe-area-inset-left\)\] pr-\[env\(safe-area-inset-right\)\]/);
    return;
  }
  expect((await page.getByRole('link', { name: 'PulseFit Athletics home' }).boundingBox())!.x).toBeGreaterThanOrEqual(48);
  const menuButton = (await header(page).getByRole('button', { name: 'Open menu' }).boundingBox())!;
  expect(menuButton.x + menuButton.width).toBeLessThanOrEqual(915 - 32);
});

test('the website in a browser does not animate', async ({ page }) => {
  await countTransitions(page);
  await page.goto('/');
  await expect(header(page)).toHaveCSS('view-transition-name', 'none');
  await openFromMenu(page, 'Contact us');
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(await transitions(page)).toBe(0);
  expect(await navKind(page)).toBeUndefined();
});
