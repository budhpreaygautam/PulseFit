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

  test('the launch screen shows its scene, and the pull spinner holds the loading scene', async ({ page, request }) => {
    const m = await freshMember(request, 'Art launch');
    await useSession(page, m.token);
    await useAppMode(page);
    await page.goto('/bookings');
    await expect(page.locator(`.app-launch ${scene('state.launch')}`)).toBeAttached();
    await expect(page.locator(`.pull-spinner ${scene('state.loading')}`)).toBeAttached();
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
