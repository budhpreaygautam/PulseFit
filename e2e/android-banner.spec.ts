import { test, expect, type Page } from '@playwright/test';
import { trackConsoleErrors } from './helpers';

// The "Get the PulseFit app" bar and the footer link, offered when GET /api/config reports an APK
// (androidApp). The test server has none, so /api/config is answered with one here. The mobile
// project is a Pixel 7 (an Android user agent); the desktop project is Chrome on desktop.

const APP = { url: '/downloads/pulsefit.apk', version: '2.2.0', size: 24 * 1024 * 1024 };
const DISMISSED_KEY = 'pulsefit_app_banner_dismissed';

async function offerApp(page: Page, androidApp: typeof APP | null = APP): Promise<void> {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, data: { ...body.data, androidApp } } });
  });
}

const banner = (page: Page) => page.getByRole('complementary', { name: 'PulseFit Android app' });
const footerLink = (page: Page) => page.locator('footer').getByRole('link', { name: 'Get the Android app' });

test.describe('on an Android phone', () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'Android user agent only'));

  test('offers the app in a bar over the page, with a download link and install help', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await offerApp(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText('Get the PulseFit app');
    await expect(banner(page)).toContainText('24 MB');
    // It floats over the page (fixed to the bottom), so it moves nothing when it appears.
    expect(await banner(page).evaluate(el => getComputedStyle(el).position)).toBe('fixed');
    const box = (await banner(page).boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(page.viewportSize()!.height, 0);
    // Still one h1 on the page, and no headings in the bar.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(banner(page).locator('h1, h2, h3, h4, h5, h6')).toHaveCount(0);

    const download = banner(page).getByRole('link', { name: 'Download' });
    await expect(download).toHaveAttribute('href', '/downloads/pulsefit.apk');
    await expect(download).toHaveAttribute('download', 'PulseFit.apk');

    const help = banner(page).getByText(/allow installing apps from your browser/);
    await expect(help).toBeHidden();
    await banner(page).getByText('How to install').click();
    await expect(help).toBeVisible();

    await expect(footerLink(page)).toHaveAttribute('href', '/downloads/pulsefit.apk');
    expect(errors).toEqual([]);
  });

  test('closing the bar keeps it closed after a reload, for 30 days', async ({ page }) => {
    await offerApp(page);
    await page.goto('/pricing');
    await banner(page).getByRole('button', { name: 'Close the app download bar' }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(Number(await page.evaluate(key => localStorage.getItem(key), DISMISSED_KEY))).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator('main h1')).toBeVisible();
    // The footer link stays: closing the bar is not a "no" to the app.
    await expect(footerLink(page)).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    // A month later it is offered again.
    await page.evaluate(key => localStorage.setItem(key, String(Date.now() - 31 * 24 * 60 * 60 * 1000)), DISMISSED_KEY);
    await page.reload();
    await expect(banner(page)).toBeVisible();
  });

  test.describe('on a small phone (360x640)', () => {
    test.use({ viewport: { width: 360, height: 640 } });

    // True when the middle of the element is what a tap there would hit (not the bar over it).
    const tappable = (target: ReturnType<Page['locator']>) =>
      target.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
    const scrollToEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastFooterLink = (page: Page) => page.locator('footer').getByRole('link', { name: 'Refunds & cancellations' });

    test('the footer can be scrolled clear of the bar, with the install help closed and open', async ({ page }) => {
      await offerApp(page);
      await page.goto('/');
      await expect(banner(page)).toBeVisible();
      const card = banner(page).locator(':scope > div');
      const footerClear = async () => {
        await scrollToEnd(page);
        const footerBottom = await page.locator('footer').evaluate(el => el.getBoundingClientRect().bottom);
        const barTop = await card.evaluate(el => el.getBoundingClientRect().top);
        return footerBottom <= barTop + 0.5 && (await tappable(lastFooterLink(page)));
      };
      await expect.poll(footerClear).toBe(true);

      // The open help makes the bar much taller; the end of the page still clears it.
      await banner(page).getByText('How to install').click();
      await expect(banner(page).getByText(/allow installing apps from your browser/)).toBeVisible();
      await expect.poll(footerClear).toBe(true);
      for (const name of ['Privacy policy', 'Terms of service', 'Refunds & cancellations']) {
        expect(await tappable(page.locator('footer').getByRole('link', { name })), name).toBe(true);
      }
    });

    test('the open mobile menu is above the bar', async ({ page }) => {
      await offerApp(page);
      await page.goto('/');
      await expect(banner(page)).toBeVisible();
      await page.getByRole('button', { name: 'Open menu' }).click();
      const themeToggle = page.locator('#mobile-menu').getByRole('button', { name: /^Switch to (light|dark) theme$/ });
      await expect(themeToggle).toBeVisible();
      expect(await tappable(themeToggle)).toBe(true);
      await themeToggle.click();
    });
  });

  test('says nothing while the server has no app to offer', async ({ page }) => {
    await offerApp(page, null);
    const config = page.waitForResponse('**/api/config');
    await page.goto('/');
    await config;
    await expect(page.locator('main h1')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(footerLink(page)).toHaveCount(0);
  });
});

test.describe('on a desktop browser', () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop', 'desktop user agent only'));

  test('shows no bar, only the footer link', async ({ page }) => {
    await offerApp(page);
    await page.goto('/');
    await expect(footerLink(page)).toHaveAttribute('href', '/downloads/pulsefit.apk');
    await expect(footerLink(page)).toHaveAttribute('download', 'PulseFit.apk');
    await expect(banner(page)).toHaveCount(0);
  });
});
