import { expect, type Page } from '@playwright/test';
import { test, trackConsoleErrors, useAppMode } from './helpers';

// The app's cartoons (AppArt, app mode only), on the 404 page with the e2e build's stand-in art: shown
// in the app and never on the website, still with reduced motion, paused whenever nobody can see it,
// gone without a trace when it cannot load, and a once-only scene holds its still for good.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const art = (page: Page) => page.locator('[data-scene="state.notFound"]');

/** Running animations in the scene, with a looping probe added to it (the stand-in art has none of its own). */
const running = (page: Page) =>
  art(page).evaluate(el => {
    if (!el.querySelector('[data-probe]')) {
      el.insertAdjacentHTML('beforeend', '<style>@keyframes probe { to { opacity: 0.5 } }</style><i data-probe style="display: block; animation: probe 1s infinite"></i>');
    }
    return el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length;
  });

/** The app going to the background (true) and coming back (false), as the WebView reports it. */
const background = (page: Page, hidden: boolean) =>
  page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

/** Lets React apply what an event changed. */
const settle = (page: Page) => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test('renders the scene in the app and nothing on the website', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(art(page)).toHaveCount(0);

  await useAppMode(page);
  await page.goto('/no-such-page');
  await expect(art(page)).toBeVisible();
  await expect(art(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(art(page)).toHaveAttribute('data-art', 'pulsefit-app-art-stub');
  await expect(art(page)).toHaveAttribute('data-state', 'playing');
  expect(await running(page)).toBeGreaterThan(0);
  expect(await art(page).evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
});

test('holds a still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useAppMode(page);
  await page.goto('/no-such-page');
  await expect(art(page)).toHaveAttribute('data-state', 'still');
  expect(await running(page)).toBe(0);
});

test('pauses off screen, under a dialog and in the background, and resumes', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/no-such-page');
  const scene = art(page);
  await expect(scene).toHaveAttribute('data-state', 'playing');

  // The 404 page is short: give it room to scroll the scene away.
  await page.evaluate(() => {
    document.body.style.paddingBottom = '2000px';
    window.scrollTo(0, 1500);
  });
  await expect(scene).toHaveAttribute('data-state', 'paused');
  expect(await running(page)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(scene).toHaveAttribute('data-state', 'playing');
  expect(await running(page)).toBeGreaterThan(0);

  // The 404 page shows Back, not the menu: the app bar's Free pass opens a dialog there.
  await page.getByRole('button', { name: 'Free pass' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(scene).toHaveAttribute('data-state', 'paused');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(scene).toHaveAttribute('data-state', 'playing');

  await background(page, true);
  await expect(scene).toHaveAttribute('data-state', 'paused');
  await background(page, false);
  await expect(scene).toHaveAttribute('data-state', 'playing');
});

test('a scene that cannot load leaves no trace', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.addInitScript(() => ((window as unknown as { __appArtFail: boolean }).__appArtFail = true));
  await useAppMode(page);
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(art(page)).toHaveAttribute('data-state', 'missing');
  expect(await art(page).evaluate(el => el.getBoundingClientRect().height)).toBe(0);
  expect(errors).toEqual([]);
});

test('a once-only scene keeps its still after the app comes back', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/no-such-page?once=1');
  await expect(art(page)).toHaveAttribute('data-state', 'playing');
  await page.waitForTimeout(1600);
  expect(await art(page).getAttribute('data-state')).toBe('still');

  await background(page, true);
  await settle(page);
  await background(page, false);
  await settle(page);
  expect(await art(page).getAttribute('data-state')).toBe('still');
});
