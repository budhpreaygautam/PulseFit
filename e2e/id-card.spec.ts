import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

// The ID card is drawn on canvas: these tests check that both faces are drawn and that the card
// can be flipped, downloaded and printed, and that Escape closes only the top dialog.

test('a member opens their ID card, flips it, downloads it and prints it', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'ID card' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'My ID card' });
  const faces = dialog.locator('img');
  await expect(faces).toHaveCount(2);
  for (const src of await faces.evaluateAll(imgs => imgs.map(i => (i as HTMLImageElement).src))) {
    expect(src.startsWith('data:image/png;base64,')).toBe(true);
  }

  // The card is one button: it flips, and screen readers get the card's details as its description.
  const card = dialog.getByRole('button', { name: 'Show the back of the card' });
  await expect(card).toHaveAccessibleDescription(/member ID PF-\d{2}-[0-9A-Z]{6}/);
  await card.click();
  await expect(dialog.getByRole('button', { name: 'Show the front of the card' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Flip card' }).click();
  await expect(dialog.getByRole('button', { name: 'Show the back of the card' })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download PNG' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^pulsefit-id-card-[a-z0-9-]+\.png$/);

  // Printing goes through a hidden frame holding both faces; focus comes back to the dialog.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.evaluate(() => {
    const original = HTMLIFrameElement.prototype.remove;
    (window as unknown as { printedFaces: number }).printedFaces = -1;
    HTMLIFrameElement.prototype.remove = function () {
      (window as unknown as { printedFaces: number }).printedFaces = this.contentDocument?.images.length ?? -1;
      original.call(this);
    };
  });
  await dialog.getByRole('button', { name: 'Print' }).click();
  await expect(dialog.getByRole('button', { name: 'Print' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printedFaces: number }).printedFaces)).toBe(2);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the front desk opens a member\'s ID card from their details; Escape closes only the card', async ({ page, request }) => {
  await signInAs(page, request, 'admin');
  await page.goto('/admin/members');
  await page.getByRole('button', { name: /^View / }).first().click();
  const details = page.getByRole('dialog').first();
  await details.getByRole('button', { name: 'ID card' }).click();

  const card = page.getByRole('dialog', { name: /'s ID card$/ });
  await expect(card.locator('img')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(1);
});
