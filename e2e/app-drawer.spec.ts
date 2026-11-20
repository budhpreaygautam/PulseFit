import { expect, type Page } from '@playwright/test';
import { appDrawer, auth, signInAs, test, touchDrag, trackConsoleErrors, useAppMode } from './helpers';

// The app's menu (app mode): a drawer from the left with the account at the top, the website menu's
// links in its groups, the theme switch and Sign out, and the footer's other links (the app has no
// footer). A modal dialog: Escape, Android Back, the scrim or a swipe left closes it.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const menuButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Open menu' });

/** Every page, phone and email the website's phone menu and footer link to, read on the website itself. */
async function websiteLinks(page: Page): Promise<string[]> {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Open menu' }).click();
  const hrefs = await page.locator('#mobile-menu a[href], footer a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')!));
  return [...new Set(hrefs)].sort();
}

/** Turns the app mode switch on for the next load (localStorage is shared with the website page before it). */
const switchToApp = (page: Page) => page.evaluate(() => window.localStorage.setItem('pulsefit_test_app_mode', '1'));

for (const persona of ['member', 'guest'] as const) {
  test(`the drawer offers a ${persona} every link the website menu and footer do`, async ({ page, request }) => {
    const errors = trackConsoleErrors(page);
    const token = persona === 'member' ? await signInAs(page, request, 'member') : null;
    await page.setViewportSize({ width: 390, height: 800 });
    const expected = await websiteLinks(page);
    expect(expected.length).toBeGreaterThan(10);
    await switchToApp(page);
    await page.goto('/');
    await menuButton(page).click();
    const drawer = appDrawer(page);
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    const offered = await drawer.locator('a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')!));
    expect(expected.filter(href => !offered.includes(href))).toEqual([]);
    await expect(drawer.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await expect(drawer.getByRole('button', { name: /^Switch to (light|dark) theme$/ })).toBeVisible();
    if (token) {
      const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
      await expect(drawer.getByText(me.name, { exact: true })).toBeVisible();
      await expect(drawer.getByText('Active', { exact: true })).toBeVisible();
      await expect(drawer.getByRole('navigation', { name: 'My PulseFit' })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeVisible();
    } else {
      await expect(drawer.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Join' })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('a coach sees their name and role at the top of the drawer, and their tools', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'trainer');
  await page.goto('/trainer');
  await menuButton(page).click();
  await expect(appDrawer(page).getByText('Coach', { exact: true })).toBeVisible();
  await expect(appDrawer(page).getByRole('navigation', { name: 'Coach tools' }).getByRole('link', { name: 'Check-in' })).toBeVisible();
});

test('the drawer is a modal dialog: focus moves in and stays in, the page cannot scroll, and Escape returns focus to ☰', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await menuButton(page).click();
  const drawer = appDrawer(page);
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('a link opens its page and closes the drawer', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await menuButton(page).click();
  await appDrawer(page).getByRole('link', { name: 'Rewards', exact: true }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await expect(appDrawer(page)).toHaveCount(0);
});

test('tapping the dimmed page closes the drawer', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/');
  await menuButton(page).click();
  await expect(appDrawer(page)).toBeVisible();
  await page.mouse.click(375, 400);
  await expect(appDrawer(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test('a swipe left closes the drawer, following the finger; a short drag springs back', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/');
  await menuButton(page).click();
  const drawer = appDrawer(page);
  // Fully slid in first: until then the finger would land on the dimmed page.
  await expect.poll(async () => (await drawer.boundingBox())!.x).toBe(0);
  const transform = () => drawer.evaluate(el => (el as HTMLElement).style.transform);

  // A short drag held still before letting go: no fling, under 30% of the width.
  const lift = await touchDrag(page, { x: 200, y: 400 }, { x: 160, y: 400 }, { release: false });
  await expect.poll(transform).toBe('translateX(-40px)');
  await page.waitForTimeout(150);
  await lift();
  await expect.poll(transform).toBe('');
  await expect(drawer).toBeVisible();
  await expect.poll(async () => (await drawer.boundingBox())!.x).toBe(0);

  await touchDrag(page, { x: 250, y: 400 }, { x: 40, y: 400 });
  await expect(drawer).toHaveCount(0);
});
