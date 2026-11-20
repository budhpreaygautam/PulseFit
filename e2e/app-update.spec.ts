import { expect, type Page } from '@playwright/test';
import { APP, offerApp, signInAs, test, trackConsoleErrors, useAppMode } from './helpers';

// Inside the Android app, "Update available" when GET /api/config offers a higher versionCode
// (androidApp.versionCode, from pulsefit.json) than the installed app's. An e2e build stands in for
// the installed versionCode with a test switch (pulsefit_test_app_build); the test server has no APK,
// so /api/config is answered with one (offerApp).

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'the Android app is the phone layout'));

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Update available' });

/** The installed app's versionCode, as the e2e build reads it; call before page.goto. */
const installed = (page: Page, versionCode: number) =>
  page.addInitScript(code => window.localStorage.setItem('pulsefit_test_app_build', String(code)), versionCode);

/** Opens the app and waits until GET /api/config has answered and React has drawn what it says. */
async function openApp(page: Page): Promise<void> {
  const config = page.waitForResponse('**/api/config');
  await page.goto('/');
  await config;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('an older app is asked to update, and Update now downloads the new APK', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page); await installed(page, 2); await signInAs(page, request, 'member');
  await offerApp(page, { ...APP, version: '1.2.0', versionCode: 3 });
  await page.route('**/downloads/pulsefit.apk', route =>
    route.fulfill({ body: 'apk', headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="PulseFit.apk"' } })
  );
  await openApp(page);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('PulseFit 1.2.0 is ready');
  await expect(dialog(page)).toContainText('you stay signed in');
  const download = page.waitForEvent('download');
  await dialog(page).getByRole('button', { name: 'Update now' }).click();
  expect(new URL((await download).url()).pathname).toBe('/downloads/pulsefit.apk');
  await expect(dialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Later, or Android Back, puts it off until the app starts again', async ({ page }) => {
  await useAppMode(page); await installed(page, 2);
  await offerApp(page, { url: APP.url, size: APP.size, versionCode: 3 });
  await openApp(page);
  // Without a version name it still says what it is; a guest is not told they stay signed in.
  await expect(dialog(page)).toContainText('A new version of PulseFit is ready');
  await expect(dialog(page)).not.toContainText('signed in');
  await dialog(page).getByRole('button', { name: 'Later' }).click();
  await expect(dialog(page)).toHaveCount(0);

  await openApp(page);
  await expect(dialog(page)).toBeVisible();
  // The Android Back button closes the open dialog as Escape does (lib/native.ts).
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test('an app that is up to date is not asked', async ({ page }) => {
  await useAppMode(page); await installed(page, 3);
  await offerApp(page, { ...APP, versionCode: 3 });
  await openApp(page);
  await expect(dialog(page)).toHaveCount(0);
});

test('nothing is asked while the server names no versionCode', async ({ page }) => {
  await useAppMode(page); await installed(page, 2);
  await offerApp(page);
  await openApp(page);
  await expect(dialog(page)).toHaveCount(0);
});

test('the website never asks, even on an Android phone', async ({ page }) => {
  await installed(page, 2);
  await offerApp(page, { ...APP, versionCode: 3 });
  await openApp(page);
  // The website offers the app in its own bar instead.
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});
