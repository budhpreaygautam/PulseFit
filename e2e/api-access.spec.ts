import { expect } from '@playwright/test';
import { test } from './helpers';

// API answers are for the app: an API address opened in the address bar (or another site's request)
// lacks the X-Requested-With header the app sends, and gets the same 404 as an unknown route. A
// deterrent, not a security boundary (requireAppHeader in server/src/middleware/auth.ts).

test('an API address opened in the address bar answers 404, while the page that reads it works', async ({ page }) => {
  const opened = await page.goto('/api/trainers');
  expect(opened!.status()).toBe(404);
  expect(await opened!.json()).toMatchObject({ success: false, code: 'NOT_FOUND' });

  // The health check stays open for the host's monitoring.
  expect((await page.goto('/api/health'))!.status()).toBe(200);

  // The home page reads the same answer (its guest view) through the app, which sends the header.
  const trainers = page.waitForResponse(r => new URL(r.url()).pathname === '/api/trainers');
  await page.goto('/');
  const res = await trainers;
  expect(res.status()).toBe(200);
  expect(await res.request().headerValue('x-requested-with')).toBe('PulseFit');
  const [first] = (await res.json()).data as { name: string }[];
  await expect(page.getByRole('main').getByText(first.name).first()).toBeVisible();
});
