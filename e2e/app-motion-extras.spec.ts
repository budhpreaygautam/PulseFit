import { expect, type Page } from '@playwright/test';
import { freshMember, signInAs, tabBar, test, touchDrag, trackConsoleErrors, useAppMode, useSession } from './helpers';

// The app's extra motion (app mode only): cards rise into view, buttons and links press in, the logo
// animates at launch, and pull to refresh reloads pages without a form. Nothing hides or moves with
// reduced motion, and none of it is on the website.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const hiddenCards = (page: Page) => page.locator('main .card-pending, main .card-rise').count();

/** Scrolls to the bottom a screen at a time, letting each screen's cards come into view. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    while (window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 1) {
      window.scrollBy(0, window.innerHeight / 2);
      await frame();
    }
  });
}

/** Pulls down from the page's heading; `by` is how far the finger moves. */
async function pull(page: Page, by: number, options: { release?: boolean } = {}) {
  const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  const from = { x: 195, y: h1.y + h1.height / 2 };
  return touchDrag(page, from, { x: from.x, y: from.y + by }, { steps: 10, ...options });
}

test('cards rise in as they scroll into view, also the ones that load later, and none stay hidden', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  // Below the fold they wait, hidden only while watched.
  await expect.poll(() => page.locator('main .card-pending').count()).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(() => page.evaluate(() => document.getAnimations().some(a => (a as CSSAnimation).animationName === 'card-rise'))).toBe(true);
  await scrollThrough(page);
  await expect.poll(() => hiddenCards(page)).toBe(0);
  // Only transform and opacity move.
  const keyframes = await page.evaluate(() =>
    // Only the app's own sheets: a cross-origin one (Google Fonts) does not share its rules.
    [...document.styleSheets].filter(s => !s.href || s.href.startsWith(location.origin)).flatMap(s => [...s.cssRules]).find(r => r instanceof CSSKeyframesRule && r.name === 'card-rise')!.cssText
  );
  expect(keyframes).toMatch(/opacity/);
  expect(keyframes.replace(/opacity|transform|translateY/g, '')).not.toMatch(/[a-z-]+\s*:/);
  expect(errors).toEqual([]);
});

test('a new tab brings its cards in too, and leaves them as they were', async ({ page, request }) => {
  // Counts the cards that started rising.
  await page.addInitScript(() => {
    new MutationObserver(records => {
      for (const r of records) {
        if ((r.target as Element).classList.contains('card-rise')) document.documentElement.dataset.rose = String(Number(document.documentElement.dataset.rose ?? 0) + 1);
      }
    }).observe(document, { attributes: true, attributeFilter: ['class'], subtree: true });
  });
  const rose = () => page.evaluate(() => Number(document.documentElement.dataset.rose ?? 0));
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect.poll(rose).toBeGreaterThan(0);
  const before = await rose();
  await tabBar(page).getByRole('link', { name: 'Pass' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My pass' })).toBeVisible();
  await expect.poll(rose).toBeGreaterThan(before);
  await expect.poll(() => hiddenCards(page)).toBe(0);
  expect(await page.locator('main section.neu-flat').getAttribute('class')).not.toMatch(/card-/);
});

test('nothing is hidden or rises with reduced motion, nor on the website', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useAppMode(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  expect(await hiddenCards(page)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 1500));
  expect(await hiddenCards(page)).toBe(0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.localStorage.removeItem('pulsefit_test_app_mode'));
  await page.addInitScript(() => window.localStorage.removeItem('pulsefit_test_app_mode'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  expect(await hiddenCards(page)).toBe(0);
});

test('buttons, links and tabs press in, but not with reduced motion, and only the app has the class for it', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\bin-app\b/);
  const home = tabBar(page).getByRole('link', { name: 'Home' });
  const box = (await home.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(home).toHaveCSS('scale', '0.97');
  await page.mouse.up();
  await expect(home).toHaveCSS('scale', 'none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.down();
  await expect(home).toHaveCSS('scale', 'none');
  await page.mouse.up();
});

test('the website has no app class', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/\bin-app\b/);
});

test('the launch animation shows at start without taking taps, and is gone within 1.5 s', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/', { waitUntil: 'commit' });
  const overlay = page.locator('.app-launch');
  await expect(overlay).toBeAttached();
  await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(overlay).toHaveCount(0, { timeout: 1500 });
  // Once per start: moving around the app does not bring it back.
  await tabBar(page).getByRole('link', { name: 'Contact' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await expect(overlay).toHaveCount(0);
});

test('the website has no launch animation', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('.app-launch')) document.documentElement.dataset.sawLaunch = '1';
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.sawLaunch)).toBeUndefined();
});

test('pulling down at the top of the timetable reloads it, with a spinner and a "Refreshing" announcement', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page); await signInAs(page, request, 'member');
  const loaded = page.waitForResponse('**/api/classes?**');
  await page.goto('/schedule');
  await loaded;
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  // Short of the threshold it springs back and reloads nothing.
  let reloads = 0;
  page.on('request', r => r.url().includes('/api/classes?') && reloads++);
  await pull(page, 80);
  await expect(page.locator('.pull-spinner')).toHaveCSS('opacity', '0');
  expect(reloads).toBe(0);

  const classes = page.waitForRequest('**/api/classes?**');
  const account = page.waitForRequest('**/api/auth/me');
  await pull(page, 220);
  await expect(page.locator('.pull-spinner')).toHaveAttribute('data-refreshing', 'true');
  await expect(page.locator('[role="status"]', { hasText: 'Refreshing' })).toHaveCount(1);
  await classes;
  await account;
  await expect(page.locator('.pull-spinner')).not.toHaveAttribute('data-refreshing');
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('no pull to refresh once scrolled down', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  let reloads = 0;
  page.on('request', r => r.url().includes('/api/classes?') && reloads++);
  await touchDrag(page, { x: 195, y: 400 }, { x: 195, y: 650 }, { steps: 10 });
  await expect(page.locator('.pull-spinner')).toHaveCSS('opacity', '0');
  await expect(page.locator('.pull-spinner')).not.toHaveAttribute('data-refreshing');
  expect(reloads).toBe(0);
});

test('no pull to refresh on a page with a form: the workout logger keeps what was typed', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/log-workout');
  await page.getByLabel('Title').fill('Leg day');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.pull-spinner')).toHaveCount(0);
  await pull(page, 220);
  await expect(page.getByLabel('Title')).toHaveValue('Leg day');
  await expect(page.locator('.pull-spinner')).toHaveCount(0);
});

test('no pull to refresh while a note is typed on the dashboard, so the note stays', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app pull note ${testInfo.project.name}`);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  const note = page.locator('#floor-notes-in, #floor-notes-out');
  await note.fill('Leg day');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.pull-spinner')).toHaveCount(1);
  let reloads = 0;
  page.on('request', r => r.url().includes('/api/auth/me') && reloads++);
  await pull(page, 220);
  await expect(note).toHaveValue('Leg day');
  await expect(page.locator('.pull-spinner')).not.toHaveAttribute('data-refreshing');
  await expect(page.locator('.pull-spinner')).toHaveCSS('opacity', '0');
  expect(reloads).toBe(0);
});

test('pull to refresh follows finger moves only of a touch that starts at the top, so other scrolling never waits for it', async ({ page, request }) => {
  // Counts the listeners on window that can stop scrolling (passive: false) for finger moves.
  await page.addInitScript(() => {
    const blocking = new Set<unknown>();
    const add = window.addEventListener;
    const remove = window.removeEventListener;
    window.addEventListener = function (this: Window, ...args: Parameters<typeof add>) {
      const options = args[2];
      if (args[0] === 'touchmove' && typeof options === 'object' && options.passive === false) blocking.add(args[1]);
      return add.apply(this, args);
    } as typeof add;
    window.removeEventListener = function (this: Window, ...args: Parameters<typeof remove>) {
      if (args[0] === 'touchmove') blocking.delete(args[1]);
      return remove.apply(this, args);
    } as typeof remove;
    (window as Window & { blockingTouchMoves?: () => number }).blockingTouchMoves = () => blocking.size;
  });
  const blocking = () => page.evaluate(() => (window as Window & { blockingTouchMoves?: () => number }).blockingTouchMoves!());
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  await expect(page.locator('.pull-spinner')).toHaveCount(1);
  expect(await blocking()).toBe(0);
  // Scrolled down, no pull can start: the touch is never followed.
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  let lift = await touchDrag(page, { x: 195, y: 400 }, { x: 195, y: 500 }, { steps: 4, release: false });
  expect(await blocking()).toBe(0);
  await lift();
  // At the top it is, until the finger lifts.
  await page.evaluate(() => window.scrollTo(0, 0));
  lift = await pull(page, 40, { release: false });
  expect(await blocking()).toBe(1);
  await lift();
  expect(await blocking()).toBe(0);
});

test('nothing in the app blurs what is behind it (smooth scrolling), while the website keeps its frosted glass', async ({ page }) => {
  const blurred = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('*')].flatMap(el =>
        [null, '::before', '::after'].filter(pseudo => getComputedStyle(el, pseudo).backdropFilter !== 'none').map(pseudo => `${el.tagName.toLowerCase()}.${el.className}${pseudo ?? ''}`)
      )
    );
  await useAppMode(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  expect(await blurred()).toEqual([]);
  // The bars are solid instead.
  await expect(page.getByRole('banner')).not.toHaveCSS('background-color', /rgba/);
  await expect(tabBar(page)).not.toHaveCSS('background-color', /rgba/);

  await page.evaluate(() => window.localStorage.removeItem('pulsefit_test_app_mode'));
  await page.addInitScript(() => window.localStorage.removeItem('pulsefit_test_app_mode'));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  expect((await blurred()).length).toBeGreaterThan(0);
});

test('the website has no pull to refresh', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  await expect(page.locator('.pull-spinner')).toHaveCount(0);
});
