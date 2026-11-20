import { expect, type Page } from '@playwright/test';
import { appDrawer, countTransitions, emulateInsets, offerApp, signInAs, tabBar, test, trackConsoleErrors, transitionAnimations, transitions, useAppMode } from './helpers';

// Inside the Android/iOS app (app mode) the pages are the website's, opening on the homepage, in an app
// frame: a slim app bar, bottom tabs, a menu drawer and no footer (app-tabs and app-drawer specs). A new
// page slides in, Back slides it out, and the app bar stays still. None with reduced motion, and none on
// the website, which keeps its own header, menu and footer.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const header = (page: Page) => page.getByRole('banner');
const drawer = appDrawer;
const navKind = (page: Page) => page.evaluate(() => document.documentElement.dataset.nav);

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function openFromMenu(page: Page, name: string): Promise<void> {
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await drawer(page).getByRole('link', { name, exact: true }).click();
}

test('the app opens on the website homepage in the app frame: app bar, bottom tabs, no footer and no app download offers', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await offerApp(page); await useAppMode(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(header(page)).toContainText('PulseFit');
  await expect(header(page).getByRole('button', { name: 'Free pass' })).toBeVisible();
  await expect(tabBar(page)).toBeVisible();
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.locator('#mobile-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explore first' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Get the Android app' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a page opened from the drawer slides in, Back slides it out, and the app bar and tabs stay still', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await countTransitions(page); await useAppMode(page);
  await page.goto('/');
  await expect(header(page)).toHaveCSS('view-transition-name', 'app-header');
  await openFromMenu(page, 'Policies & terms');
  await expect(page).toHaveURL(/\/policies$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Policies & terms' })).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
  await expect.poll(() => transitions(page)).toBe(1);
  expect(await navKind(page)).toBe('push');
  // index.css's slide runs on the page, and the app bar and tab bar are captured on their own (so they do not slide).
  await expect.poll(() => transitionAnimations(page)).toContain('::view-transition-new(root) app-slide-in');
  expect((await transitionAnimations(page)).some(a => a.startsWith('::view-transition-group(app-header) '))).toBe(true);
  expect((await transitionAnimations(page)).some(a => a.startsWith('::view-transition-group(app-tabbar) '))).toBe(true);
  // The toasts are captured on their own too, so the still app bar never covers them.
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
  await tabBar(page).getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('dialog', { name: 'Sign in to PulseFit' }).getByRole('button', { name: /^Member/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Hi, / })).toBeVisible();
  await expect(header(page).getByRole('button', { name: 'Show my QR entry pass' })).toBeVisible();
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(tabBar(page).getByRole('link')).toHaveText(['Home', 'Classes', 'Pass', 'Me']);
  await tabBar(page).getByRole('link', { name: 'Me', exact: true }).click();
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
    await expect(tabBar(page)).toBeVisible();
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
  await page.goto('/');
  await openFromMenu(page, 'Rewards');
  await expect(page).toHaveURL(/\/rewards$/);
  await tabBar(page).getByRole('link', { name: 'Me', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.evaluate(() => { history.back(); history.back(); });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
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
  await page.goto('/');
  await openFromMenu(page, 'Rewards');
  await expect.poll(() => transitions(page)).toBe(1);
  await tabBar(page).getByRole('link', { name: 'Me', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await drawer(page).getByRole('button', { name: 'Sign out' }).click();
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

test('on a notched phone the app bar stays below the status bar', async ({ page }) => {
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

test('in landscape the app bar and pages keep clear of the side nav bar and cutout', async ({ page }) => {
  await useAppMode(page);
  await page.setViewportSize({ width: 915, height: 412 });
  const emulated = await emulateInsets(page, { left: 48, right: 32 });
  await page.goto('/');
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(header(page).locator('xpath=..')).toHaveClass(/pl-\[env\(safe-area-inset-left\)\] pr-\[env\(safe-area-inset-right\)\]/);
    return;
  }
  expect((await header(page).getByRole('button', { name: 'Open menu' }).boundingBox())!.x).toBeGreaterThanOrEqual(48);
  const freePass = (await header(page).getByRole('button', { name: 'Free pass' }).boundingBox())!;
  expect(freePass.x + freePass.width).toBeLessThanOrEqual(915 - 32);
});

test('the website in a browser keeps its header, menu and footer and does not animate', async ({ page }) => {
  await countTransitions(page);
  await page.goto('/');
  await expect(header(page)).toHaveCSS('view-transition-name', 'none');
  await expect(page.locator('footer')).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await page.locator('#mobile-menu').getByRole('link', { name: 'Contact us', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(await transitions(page)).toBe(0);
  expect(await navKind(page)).toBeUndefined();
});
