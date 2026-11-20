import { expect } from '@playwright/test';
import { signInAs, test, trackConsoleErrors } from './helpers';

test('a guest sends an enquiry and an admin follows it up under Leads', async ({ page, request }) => {
  // Unique per run: the spec runs on the desktop and Pixel 7 projects against one database.
  const email = `enquiry-e2e-${Date.now()}@example.com`;
  const errors = trackConsoleErrors(page);

  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1, name: 'Contact us' })).toBeVisible();
  await page.locator('#enquiry-name').fill('Meera Joshi');
  await page.locator('#enquiry-email').fill(email);
  await page.locator('#enquiry-phone').fill('98110 55555');
  await page.getByText('Zumba & Cardio', { exact: true }).click();
  await page.locator('#enquiry-time').selectOption('Evening');
  await page.locator('#enquiry-message').fill('Are there evening Zumba batches?');

  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.locator('#enquiry-consent-error')).toBeVisible();
  await page.locator('#enquiry-consent').check();
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  const done = page.getByRole('status').filter({ hasText: "we've got your enquiry" });
  await expect(done).toBeVisible();
  await expect(done).toContainText('+91 98110 55555');
  expect(errors).toEqual([]);

  await signInAs(page, request, 'admin');
  await page.goto('/admin/trials');
  await expect(page.getByRole('heading', { level: 1, name: 'Leads' })).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: email });
  await expect(card).toContainText('Meera Joshi');
  await expect(card.getByLabel('Status')).toHaveValue('new');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/enquiries/') && r.request().method() === 'PATCH' && r.ok()),
    card.getByLabel('Status').selectOption('contacted')
  ]);
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: email }).getByLabel('Status')).toHaveValue('contacted');
});
