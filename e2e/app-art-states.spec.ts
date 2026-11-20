import { expect } from '@playwright/test';
import { freshMember, test, useAppMode, useSession } from './helpers';

// Loading, empty, error, offline, launch and refresh scenes (app mode only; the website keeps its icons).

const BOOKINGS = '**/api/bookings/my*';
const scene = (name: string) => `[data-scene^="${name}"]`;

test.describe('app', () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

  test('a new member sees an empty scene in My bookings', async ({ page, request }) => {
    const m = await freshMember(request, 'Art empty');
    await useSession(page, m.token);
    await useAppMode(page);
    await page.goto('/bookings');
    await expect(page.locator(scene('state.empty'))).toBeVisible();
    await expect(page.getByText('No upcoming classes')).toBeVisible();
  });

  test('a slow page shows the loading scene', async ({ page, request }) => {
    const m = await freshMember(request, 'Art loading');
    await useSession(page, m.token);
    await useAppMode(page);
    await page.route(BOOKINGS, async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.continue();
    });
    await page.goto('/bookings');
    await expect(page.getByRole('status').locator(scene('state.loading'))).toBeVisible();
  });

  test('a failed request shows the error scene', async ({ page, request }) => {
    const m = await freshMember(request, 'Art error');
    await useSession(page, m.token);
    await useAppMode(page);
    await page.route(BOOKINGS, route => route.fulfill({ status: 500, json: { success: false, error: 'Broken' } }));
    await page.goto('/bookings');
    await expect(page.getByRole('alert').locator(scene('state.error'))).toBeVisible();
  });

  test('no connection shows the offline scene', async ({ page, request }) => {
    const m = await freshMember(request, 'Art offline');
    await useSession(page, m.token);
    await useAppMode(page);
    await page.route('**/api/**', route => route.abort('internetdisconnected'));
    await page.goto('/bookings');
    await expect(page.locator(scene('state.offline'))).toBeVisible();
  });

  test('the launch screen shows its scene', async ({ page, request }) => {
    const m = await freshMember(request, 'Art launch');
    await useSession(page, m.token);
    await useAppMode(page);
    // The launch node is gone after 900 ms, so watch for it from the first frame.
    await page.addInitScript(() => {
      const w = window as unknown as { __sawLaunch?: boolean };
      new MutationObserver(() => {
        if (document.querySelector('.app-launch [data-scene^="state.launch"]')) w.__sawLaunch = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/bookings', { waitUntil: 'commit' });
    await page.waitForFunction(() => (window as unknown as { __sawLaunch?: boolean }).__sawLaunch === true);
  });

  test('a pull at the top shows the loading scene in the spinner', async ({ page, request }) => {
    const m = await freshMember(request, 'Art pull');
    await useSession(page, m.token);
    await useAppMode(page);
    await page.goto('/bookings');
    await expect(page.locator('.app-launch')).toHaveCount(0);
    await page.evaluate(() => {
      const touch = (type: string, y: number) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: 195, clientY: y });
        document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
      };
      touch('touchstart', 100);
      touch('touchmove', 300);
      touch('touchend', 300);
    });
    await expect(page.locator('.pull-spinner[data-refreshing]')).toBeAttached();
    await expect(page.locator('.pull-spinner [data-scene^="state.loading"]')).toBeAttached();
  });
});
test('the website has none of these scenes', async ({ page, request }) => {
  const m = await freshMember(request, 'Art web');
  await useSession(page, m.token);
  await page.route(BOOKINGS, route => route.fulfill({ status: 500, json: { success: false, error: 'Broken' } }));
  await page.goto('/bookings');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-scene^="state."], .app-launch, .pull-spinner')).toHaveCount(0);
});
