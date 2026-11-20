import { expect, type Page } from '@playwright/test';
import { offerApp, signInAs, tabBar, test, useAppMode } from './helpers';

// A signed-out app: three slides on the first launch, then the welcome panel (the services, Sign in,
// Create account, a free pass, Contact us, Explore first). Exploring opens the Services screen in a guest shell.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const signInDialog = (page: Page) => page.getByRole('dialog', { name: 'Sign in to PulseFit' });

async function openPanel(page: Page): Promise<void> {
  await useAppMode(page); await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
}

test('the first launch shows three slides, then the panel; the next launch opens on the panel', async ({ page }) => {
  await useAppMode(page); await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Strength floor' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Zumba studio' })).toBeInViewport();
  // Focus stays on Next, so the new slide is announced.
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Slide 2 of 3: Zumba studio' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Rewards & gifts' })).toBeInViewport();
  await page.getByRole('button', { name: 'Get started' }).click();
  for (const name of ['Sign in', 'Create account', 'Get a free pass', 'Contact us', 'Explore first']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Strength floor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('Sign in opens the sign-in dialog and a member lands on Home', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await signInDialog(page).getByRole('button', { name: /^Member/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabBar(page)).toBeVisible();
});

test('a coach who signs in from the panel gets the website layout, and signing out returns to the panel', async ({ page }) => {
  await offerApp(page); await openPanel(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await signInDialog(page).getByRole('button', { name: /^Coach/ }).click();
  await expect(page).toHaveURL(/\/trainer$/);
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await expect(signInDialog(page)).toHaveCount(0);
});

test('Create account and Get a free pass open their forms; Contact us opens contact in the guest shell', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('dialog', { name: 'Create your account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Get a free pass' }).click();
  await expect(page.getByRole('dialog', { name: 'Claim a free 1-day pass' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Contact us' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(tabBar(page).getByRole('link')).toHaveText(['Services', 'Contact']);
  await expect(tabBar(page).getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(tabBar(page).getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page');
  // Services is the Services screen now, not the welcome panel again.
  await tabBar(page).getByRole('link', { name: 'Services' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  await expect(tabBar(page).getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
});

test('on a phone with a home indicator the slides keep Next above it, without scrolling', async ({ page }) => {
  await useAppMode(page);   // sets the viewport first, so the inset override below is not reset by it
  const cdp = (await page.context().newCDPSession(page)) as unknown as { send(method: string, params: object): Promise<unknown> };
  const emulated = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 40, bottom: 34 } }).then(() => true, () => false);
  await page.goto('/');
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(page.locator('.app-screen')).toHaveClass(/min-h-\[calc\(100dvh-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)\)\]/);
    return;
  }
  const next = (await page.getByRole('button', { name: 'Next' }).boundingBox())!;
  expect(next.y + next.height).toBeLessThanOrEqual(800 - 34);
});

test('Explore first opens the Services screen with guest tabs; gated services still ask to sign in; it is not remembered', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'Explore first' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  await expect(tabBar(page).getByRole('link')).toHaveText(['Services', 'Contact']);
  await page.getByRole('list', { name: 'Services' }).getByRole('link', { name: /^Strength floor/ }).click();
  await expect(signInDialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /^BUILD REAL STRENGTH/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
});

test('signing out from Me opens the panel without slides and without the sign-in dialog', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Strength floor' })).toHaveCount(0);
  await expect(signInDialog(page)).toHaveCount(0);
});
