import { expect } from '@playwright/test';
import { countTransitions, offerApp, signInAs, tabBar, test, transitions, useAppMode } from './helpers';

// App mode (inside the Android/iOS app): members get the tab bar and no website chrome, coaches and
// admins keep the website layout. In a browser it needs the e2e build and the test-only switch.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const LANDING_H1 = /YOUR GYM FOR/;

test('a member opening the app lands on Home with the tab bar, no website chrome and no landing-page frame', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.__sawLanding = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll('h1')].some(h => /YOUR GYM FOR/.test(h.textContent ?? ''))) window.__sawLanding = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabBar(page).getByRole('link')).toHaveText(['Home', 'Classes', 'Pass', 'Train', 'Me']);
  await expect(tabBar(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await expect(page.getByText('Demo accounts:')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
  expect(await page.evaluate(() => window.__sawLanding)).toBe(false);
});

test('each tab opens its page, follows aria-current and is at least 44×44', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  for (const [name, url] of [['Classes', /\/schedule$/], ['Pass', /\/pass$/], ['Train', /\/log-workout$/], ['Me', /\/profile$/], ['Home', /\/dashboard$/]] as const) {
    const link = tabBar(page).getByRole('link', { name, exact: true });
    await link.click();
    await expect(page).toHaveURL(url);
    await expect(link).toHaveAttribute('aria-current', 'page');
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('the tab bar is 58 px at the bottom of the screen and the page scrolls clear of it', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  const bar = (await tabBar(page).boundingBox())!;
  expect(bar.height).toBe(58);
  expect(bar.y + bar.height).toBe(800);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const main = (await page.locator('main').boundingBox())!;
  expect(main.y + main.height).toBeLessThanOrEqual(bar.y + 0.5);
});

test('Back on a sub-screen goes back in the app, and with no earlier app page goes Home', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile?tab=membership');
  await expect(tabBar(page).getByRole('link', { name: 'Me', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Change plan' }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=membership$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('Back on a sub-screen opened directly goes Home', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('on a notched phone the title bar stays below the status bar and the tab bar above the home indicator', async ({ page, request }) => {
  await useAppMode(page);   // sets the viewport first, so the inset override below is not reset by it
  const cdp = (await page.context().newCDPSession(page)) as unknown as { send(method: string, params: object): Promise<unknown> };
  const emulated = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 40, bottom: 24 } }).then(() => true, () => false);
  await signInAs(page, request, 'member');
  await page.goto('/rewards');
  const titleBar = page.locator('header', { has: page.getByRole('button', { name: 'Back' }) });
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(titleBar).toHaveClass(/top-\[env\(safe-area-inset-top\)\]/);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 600));
  expect((await page.getByRole('button', { name: 'Back' }).boundingBox())!.y).toBeGreaterThanOrEqual(40);
  const bar = (await tabBar(page).boundingBox())!;
  expect(bar.y + bar.height).toBe(800);
  expect(bar.height).toBe(58 + 24);
});

test('in landscape the shell keeps clear of the side nav bar and cutout', async ({ page, request }) => {
  await useAppMode(page);   // sets the viewport first, so the inset override below is not reset by it
  const cdp = (await page.context().newCDPSession(page)) as unknown as { send(method: string, params: object): Promise<unknown> };
  const emulated = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 48, right: 32 } }).then(() => true, () => false);
  await signInAs(page, request, 'member');
  await page.goto('/rewards');
  const titleBar = page.locator('header', { has: page.getByRole('button', { name: 'Back' }) });
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(titleBar).toHaveClass(/pl-\[max\(4px,env\(safe-area-inset-left\)\)\]/);
    return;
  }
  expect((await page.getByRole('button', { name: 'Back' }).boundingBox())!.x).toBe(48);
  const links = tabBar(page).getByRole('link');
  expect((await links.first().boundingBox())!.x).toBe(48);
  const last = (await links.last().boundingBox())!;
  expect(last.x + last.width).toBe(390 - 32);
  await page.goto('/profile');
  expect((await page.locator('.app-screen > *').first().boundingBox())!.x).toBe(20 + 48);
});

test('a screen swapped under the same tab moves focus to its heading', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  await page.getByRole('link', { name: 'Personal details & avatar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/profile\?tab=details$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByRole('button', { name: 'Back' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeFocused();
});

test('a guest who explores, or signs in on Contact, has focus on the new screen', async ({ page, request }) => {
  const email = `app-focus-${Date.now().toString(36)}@example.com`;
  const reg = await request.post('/api/auth/register', { data: { name: 'Focus Lane', email, password: 'Contact2026x', gender: 'female' } });
  expect(reg.status(), await reg.text()).toBe(201);
  await useAppMode(page); await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Explore first' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: LANDING_H1 })).toBeFocused();
  await tabBar(page).getByRole('link', { name: 'Contact' }).click();
  // Signing in with a password keeps the page; the tab bar's Sign in button it came from is gone.
  await tabBar(page).getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to PulseFit' });
  await dialog.getByLabel('Email address', { exact: true }).fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill('Contact2026x');
  await dialog.locator('button[type="submit"]').click();
  await expect(tabBar(page).getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeFocused();
});

test('keyboard focus never lands under the tab bar', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  const covered: string[] = [];
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    const under = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.closest('.app-tabbar')) return null;
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.app-tabbar')!.getBoundingClientRect();
      return r.height > 1 && r.bottom > bar.top + 1 ? el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName : null;
    });
    if (under) covered.push(under);
  }
  expect(covered).toEqual([]);
});

test('opening the app offline says so, and Try again lands on Home once the server answers', async ({ page, request }) => {
  await page.route('**/api/auth/me', route => route.abort());
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: "Can't reach PulseFit right now" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabBar(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: LANDING_H1 })).toHaveCount(0);
});

test('coaches keep the website layout in app mode, with no page-change animation', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'trainer');
  await page.goto('/trainer');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
  await page.locator('footer').getByRole('link', { name: 'Strength floor' }).click();
  await expect(page).toHaveURL(/\/strength$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/trainer$/);
  expect(await transitions(page)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.dataset.nav)).toBeUndefined();
});

test('every button and field on the tab screens is at least 44×44, with the gym open all week', async ({ page, request }) => {
  // Seven day chips on Classes are the narrowest case.
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.gym.hours.closedWeekdays = [];
    await route.fulfill({ response, json: body });
  });
  await useAppMode(page); await signInAs(page, request, 'member');
  for (const path of ['/dashboard', '/schedule', '/pass', '/log-workout', '/profile']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    if (path === '/schedule') await expect(page.getByRole('group', { name: 'Day' }).getByRole('button')).toHaveCount(7);
    const small = await page.locator('main').locator('button, input, select').evaluateAll(els => els.flatMap(el => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return [];   // hidden, or screen-reader only
      return r.width < 44 || r.height < 44 ? [`${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim()}" ${Math.round(r.width)}×${Math.round(r.height)}`] : [];
    }));
    expect(small, path).toEqual([]);
  }
});

test('the Android download bar never shows in app mode', async ({ page }) => {
  await offerApp(page); await useAppMode(page);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toHaveCount(0);
});

test('without the switch a phone gets the website', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
});
