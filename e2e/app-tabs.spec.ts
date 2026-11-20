import { expect, type Page } from '@playwright/test';
import {
  appDrawer,
  auth,
  countTransitions,
  emulateInsets,
  freshMember,
  signInAs,
  tabBar,
  test,
  trackConsoleErrors,
  transitionAnimations,
  transitions,
  useAppMode,
  useSession
} from './helpers';

// The app's frame (app mode): a slim app bar with ☰ on a tab's own page and ← elsewhere, and bottom
// tabs for members (Home, Classes, Pass, Me), guests (Home, Contact, Sign in), coaches (Today, Check-in,
// Classes, Me) and admins (Dashboard, Members, Leads, Classes; Check-in stays in their drawer). Coaches
// and admins start the app on their first tab. The Pass tab is an app-only page; on the website /pass
// is a missing page.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const header = (page: Page) => page.getByRole('banner');
const tab = (page: Page, name: string) => tabBar(page).getByRole('link', { name, exact: true });
const navKind = (page: Page) => page.evaluate(() => document.documentElement.dataset.nav);
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test("a member's tabs open Home, Classes, Pass and Me, mark the open one, and are big enough to tap", async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(tabBar(page).getByRole('link')).toHaveText(['Home', 'Classes', 'Pass', 'Me']);
  await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
  // Members start the app on the homepage, as guests do.
  await expect(page).toHaveURL(/\/$/);
  for (const [name, url, heading] of [
    ['Classes', /\/schedule$/, 'BOOK A CLASS'],
    ['Pass', /\/pass$/, 'My pass'],
    ['Me', /\/profile$/, /./],
    ['Home', /\/$/, /YOUR GYM FOR/]
  ] as const) {
    await tab(page, name).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveCount(1);
    const box = (await tab(page, name).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
  // Me stays open on its sections; a page with a query (a deep link) is no tab's own page.
  await page.goto('/profile?tab=billing');
  await expect(tab(page, 'Me')).toHaveAttribute('aria-current', 'page');
  await page.goto('/schedule?category=zumba');
  await expect(tabBar(page).locator('[aria-current="page"]')).toHaveCount(0);
  await expect(header(page).getByRole('button', { name: 'Back' })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a guest's tabs are Home, Contact and Sign in, which opens the sign-in dialog", async ({ page }) => {
  await useAppMode(page);
  await page.goto('/');
  await expect(tabBar(page).locator('a, button')).toHaveText(['Home', 'Contact', 'Sign in']);
  await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/\/$/);
  await tab(page, 'Contact').click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(tab(page, 'Contact')).toHaveAttribute('aria-current', 'page');
  await tabBar(page).getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in to PulseFit' })).toBeVisible();
  await expect(page).toHaveURL(/\/contact$/);
});

// Each staff tab: its label, the address it opens and that page's own heading.
const STAFF_TABS = {
  trainer: [
    ['Today', /\/trainer$/, 'Coach dashboard'],
    ['Check-in', /\/admin\/check-in$/, 'Check-in'],
    ['Classes', /\/schedule$/, 'BOOK A CLASS'],
    ['Me', /\/profile$/, /./]
  ],
  admin: [
    ['Dashboard', /\/admin$/, 'Gym overview'],
    ['Members', /\/admin\/members$/, 'Members'],
    ['Leads', /\/admin\/trials$/, 'Leads'],
    ['Classes', /\/admin\/classes$/, 'Classes & coaches']
  ]
} as const;

for (const persona of ['trainer', 'admin'] as const) {
  test(`a ${persona} starts the app on their first tab, and their tabs open their own pages`, async ({ page, request }) => {
    const errors = trackConsoleErrors(page);
    await useAppMode(page); await signInAs(page, request, persona);
    await page.goto('/');
    const tabs = STAFF_TABS[persona];
    await expect(page).toHaveURL(tabs[0][1]);
    await expect(page.getByRole('heading', { level: 1, name: tabs[0][2] })).toBeVisible();
    await expect(tabBar(page).getByRole('link')).toHaveText(tabs.map(([name]) => name));
    await expect(tab(page, tabs[0][0])).toHaveAttribute('aria-current', 'page');
    // A replace, not a new page: nothing to go Back to.
    expect(await page.evaluate(() => Boolean(window.history.state?.inApp))).toBe(false);
    for (const [name, url, heading] of [...tabs.slice(1), tabs[0]]) {
      await tab(page, name).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
      await expect(header(page).getByRole('button', { name: 'Open menu' })).toBeVisible();
    }
    await expect(header(page).getByRole('link', { name: /^My account/ })).toBeVisible();
    await expect(page.locator('footer')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('an admin has no Check-in tab but finds it in the drawer, and a deep link keeps its page', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'admin');
  await page.goto('/contact');
  await expect(tabBar(page).getByRole('link')).toHaveText(['Dashboard', 'Members', 'Leads', 'Classes']);
  await expect(page).toHaveURL(/\/contact$/);
  await expect(tabBar(page).getByRole('link', { name: 'Check-in' })).toHaveCount(0);
  await header(page).getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await appDrawer(page).getByRole('link', { name: 'Check-in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/check-in$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Check-in' })).toBeVisible();
  await expect(header(page)).toContainText('Front-desk check-in');
  await expect(header(page).getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(tabBar(page).locator('[aria-current="page"]')).toHaveCount(0);
});

test('tapping the open tab scrolls its page back to the top and keeps its section', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  // On a section of Me: opening the tab again would drop ?tab=billing, scrolling up keeps it.
  await page.goto('/profile?tab=billing');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(tab(page, 'Me')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  await tab(page, 'Me').click();
  await expect.poll(() => scrollY(page)).toBe(0);
  await expect(page).toHaveURL(/\/profile\?tab=billing$/);
});

test('switching tabs cross-fades, a page from the drawer slides in, and Back slides it out', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await tab(page, 'Classes').click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect.poll(() => transitions(page)).toBe(1);
  expect(await navKind(page)).toBe('tab');
  await expect.poll(() => transitionAnimations(page)).toContain('::view-transition-new(root) app-fade-in');
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await appDrawer(page).getByRole('link', { name: 'Rewards', exact: true }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await expect.poll(() => transitions(page)).toBe(2);
  expect(await navKind(page)).toBe('push');
  await expect.poll(() => transitionAnimations(page)).toContain('::view-transition-new(root) app-slide-in');
  await header(page).getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect.poll(() => transitions(page)).toBe(3);
  expect(await navKind(page)).toBe('pop');
  expect(errors).toEqual([]);
});

test('with reduced motion tabs and pages change without a transition', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await tab(page, 'Pass').click();
  await expect(page).toHaveURL(/\/pass$/);
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await appDrawer(page).getByRole('link', { name: 'Rewards', exact: true }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await header(page).getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/pass$/);
  expect(await transitions(page)).toBe(0);
  expect(await navKind(page)).toBeUndefined();
});

test("the app bar shows ☰ and the title on a tab's page, ← and the page's title elsewhere, and ← goes back", async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(header(page)).toContainText('PulseFit');
  await expect(header(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
  await tab(page, 'Classes').click();
  await expect(header(page)).toContainText('Class timetable');
  await expect(header(page).getByRole('button', { name: 'Open menu' })).toBeVisible();
  await header(page).getByRole('button', { name: 'Open menu' }).click();
  await appDrawer(page).getByRole('link', { name: 'Strength Floor', exact: true }).click();
  await expect(page).toHaveURL(/\/strength$/);
  await expect(header(page)).toContainText('Strength floor');
  await expect(header(page).getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await header(page).getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  // Opened straight on a page (no earlier page in the app), ← goes to the first tab.
  await page.goto('/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await header(page).getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
});

test('the tab bar hides while the keyboard is up', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/contact');
  const field = page.getByLabel('Full name');
  await expect(field).toBeVisible();
  // Resizes the screen and lets the tab bar's resize handler run before anything is checked.
  const resize = async (height: number) => {
    await page.setViewportSize({ width: 390, height });
    await page.waitForFunction(h => window.visualViewport!.height === h, height);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  // A shorter screen without a field in focus is no keyboard (a split screen).
  await resize(450);
  await expect(tabBar(page)).toBeVisible();
  await resize(800);
  await field.focus();
  await resize(450);
  await expect(tabBar(page)).toBeHidden();
  await resize(800);
  await expect(tabBar(page)).toBeVisible();
});

test('the tab bar sits above the gesture bar and the page scrolls clear of it', async ({ page, request }) => {
  await useAppMode(page);   // sets the viewport first, so the inset override below is not reset by it
  const emulated = await emulateInsets(page, { bottom: 24 });
  await signInAs(page, request, 'member');
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const inset = emulated ? 24 : 0;
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    const rule = await page.evaluate(() =>
      [...document.styleSheets]
        .filter(sheet => !sheet.href || sheet.href.startsWith(location.origin))
        .flatMap(sheet => [...sheet.cssRules])
        .find(r => r instanceof CSSStyleRule && r.selectorText === '.app-tabbar')?.cssText ?? ''
    );
    expect(rule).toContain('env(safe-area-inset-bottom)');
  }
  const bar = (await tabBar(page).boundingBox())!;
  expect(bar.y + bar.height).toBe(800);
  expect(bar.height).toBe(62 + inset);
  const me = (await tab(page, 'Me').boundingBox())!;
  expect(me.y + me.height).toBeLessThanOrEqual(800 - inset + 0.5);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastBottom = await page.locator('main').evaluate(main => {
    const items = [...main.querySelectorAll('*')].map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
    return Math.max(...items.map(r => r.bottom));
  });
  expect(lastBottom).toBeLessThanOrEqual(bar.y + 0.5);
});

test("the tab bar keeps clear of a landscape phone's side nav bar and cutout", async ({ page, request }) => {
  await useAppMode(page);
  const emulated = await emulateInsets(page, { left: 48, right: 32 });
  await signInAs(page, request, 'member');
  await page.goto('/profile');
  await expect(tab(page, 'Me')).toBeVisible();
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    const rule = await page.evaluate(() =>
      [...document.styleSheets]
        .filter(sheet => !sheet.href || sheet.href.startsWith(location.origin))
        .flatMap(sheet => [...sheet.cssRules])
        .find(r => r instanceof CSSStyleRule && r.selectorText === '.app-tabbar')?.cssText ?? ''
    );
    expect(rule).toContain('safe-area-inset-left');
    expect(rule).toContain('safe-area-inset-right');
    return;
  }
  expect((await tab(page, 'Home').boundingBox())!.x).toBeGreaterThanOrEqual(48);
  const me = (await tab(page, 'Me').boundingBox())!;
  expect(me.x + me.width).toBeLessThanOrEqual(390 - 32);
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

test('a guest who signs in from the Sign in tab has focus on the page, as that tab is gone', async ({ page, request }) => {
  const email = `app-focus-${Date.now().toString(36)}@example.com`;
  const reg = await request.post('/api/auth/register', { data: { name: 'Focus Lane', email, password: 'Contact2026x', gender: 'female' } });
  expect(reg.status(), await reg.text()).toBe(201);
  await useAppMode(page);
  await page.goto('/');
  await tab(page, 'Contact').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  // Signing in with a password keeps the page; the Sign in tab it came from is gone.
  await tabBar(page).getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to PulseFit' });
  await dialog.getByLabel('Email address', { exact: true }).fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill('Contact2026x');
  await dialog.locator('button[type="submit"]').click();
  await expect(tab(page, 'Pass')).toBeVisible();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.locator('#main')).toBeFocused();
});

test("the Pass tab shows the member's QR pass, the same the QR dialog shows, and their ID card", async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/');
  await tab(page, 'Pass').click();
  await expect(page.getByRole('heading', { level: 1, name: 'My pass' })).toBeVisible();
  const qr = page.getByRole('main').getByRole('img', { name: `QR code for pass ${me.qr_code_token}` });
  await expect(qr).toBeVisible();
  await expect(page.getByRole('main').getByText(me.name, { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText('Show this at the front desk to check in.')).toBeVisible();
  const src = await qr.getAttribute('src');
  await header(page).getByRole('button', { name: 'Show my QR entry pass' }).click();
  const dialog = page.getByRole('dialog', { name: 'Digital access pass' });
  await expect(dialog.getByRole('img', { name: `QR code for pass ${me.qr_code_token}` })).toHaveAttribute('src', src!);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'ID card' }).click();
  await expect(page.getByRole('dialog', { name: 'My ID card' })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a frozen member's pass says the front desk will not let it in", async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app pass frozen ${testInfo.project.name}`);
  expect((await request.post('/api/membership/freeze', { headers: auth(m.token) })).ok()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/pass');
  await expect(page.getByRole('main').getByText('Frozen', { exact: true })).toBeVisible();
  await expect(page.getByText('Your membership is frozen, so the front desk will not let this pass in until you unfreeze it.')).toBeVisible();
});

test('the Pass tab shows the status the server has now, on opening it and on coming back to the app', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app pass status ${testInfo.project.name}`);
  const setStatus = async (membership_status: string) =>
    expect((await request.put(`/api/members/${m.id}`, { headers: auth(m.adminToken), data: { membership_status } })).ok()).toBeTruthy();
  // The drawer shows the status too: only the page's own counts.
  const status = (name: string) => page.getByRole('main').getByText(name, { exact: true });
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/pass');
  await expect(status('Active')).toBeVisible();
  await tab(page, 'Classes').click();
  await expect(page).toHaveURL(/\/schedule$/);
  await setStatus('expired');
  await tab(page, 'Pass').click();
  await expect(status('Expired')).toBeVisible();
  // The app comes back from the background while it is on the Pass tab.
  await setStatus('active');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(status('Active')).toBeVisible();
});

test('a guest opening /pass in the app is asked to sign in', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/pass');
  await expect(page.getByRole('heading', { name: 'Please sign in' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in to PulseFit' })).toBeVisible();
});

test('on the website /pass is the missing page, also for a member', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/pass');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'My pass' })).toHaveCount(0);
  await expect(tabBar(page)).toHaveCount(0);
});
