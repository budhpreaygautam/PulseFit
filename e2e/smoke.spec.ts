import { test, expect } from '@playwright/test';
import { signInAs, trackConsoleErrors } from './helpers';

const PUBLIC_ROUTES = ['/', '/strength', '/zumba', '/guide', '/schedule', '/pricing', '/coaches', '/exercises', '/privacy', '/terms', '/refund-policy'];

test.describe('public pages', () => {
  for (const path of PUBLIC_ROUTES) {
    test(`${path} renders without errors and survives a refresh`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveTitle(/PulseFit/);
      await page.reload();
      expect(new URL(page.url()).pathname).toBe(path);
      expect(errors).toEqual([]);
    });
  }

  test('unknown addresses show a 404 page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  });

  test('back and forward move between pages', async ({ page }) => {
    await page.goto('/pricing');
    await page.goto('/schedule');
    await page.goBack();
    await expect(page).toHaveURL(/\/pricing$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/schedule$/);
  });
});

test.describe('access rules', () => {
  test('a guest opening a member page is asked to sign in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /please sign in/i })).toBeVisible();
  });

  test('a member opening an admin page is told it is not for their account', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    await page.goto('/admin/members');
    await expect(page.getByRole('heading', { name: /isn't for your account/i })).toBeVisible();
  });

  for (const [role, path] of [
    ['member', '/dashboard'],
    ['trainer', '/trainer'],
    ['admin', '/admin']
  ] as const) {
    test(`${role} can open ${path} without errors`, async ({ page, request }) => {
      const errors = trackConsoleErrors(page);
      await signInAs(page, request, role);
      await page.goto(path);
      await expect(page.getByRole('heading', { name: /please sign in|isn't for your account/i })).toHaveCount(0);
      await expect(page.locator('main h1').first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
