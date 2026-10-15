import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

// The ID card is drawn on canvas: these tests check that both faces are drawn, that the card can be
// flipped and downloaded but not printed (the gym issues the physical card), and that Escape closes
// only the top dialog.

test('a member opens their ID card, flips it and downloads it; there is no print option', async ({ page, request }) => {
  // The badge swings on its lanyard; with reduced motion it hangs still, so it can be clicked.
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  await expect(dialog.getByRole('button', { name: /print/i })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the front desk opens a member\'s ID card from their details; Escape closes only the card', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInAs(page, request, 'admin');
  await page.goto('/admin/members');
  await page.getByRole('button', { name: /^View / }).first().click();
  const details = page.getByRole('dialog').first();
  await details.getByRole('button', { name: 'ID card' }).click();

  const card = page.getByRole('dialog', { name: /'s ID card$/ });
  await expect(card.locator('img')).toHaveCount(2);
  await expect(card.getByRole('button', { name: /print/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('a coach opens their staff ID card from the coach dashboard', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInAs(page, request, 'trainer');
  await page.goto('/trainer');
  await expect(page.getByRole('heading', { level: 1, name: 'Coach dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'ID card' }).click();

  const dialog = page.getByRole('dialog', { name: 'My ID card' });
  await expect(dialog.locator('img')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Show the back of the card' })).toHaveAccessibleDescription(/, coach, staff ID PF-\d{2}-[0-9A-Z]{6}\./);
  await expect(dialog.getByRole('button', { name: /print/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the front desk opens a coach\'s ID card from Members › Coaches', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInAs(page, request, 'admin');
  await page.goto('/admin/members');
  await page.getByRole('group', { name: 'Show accounts' }).getByRole('button', { name: 'Coaches' }).click();
  await page.getByRole('button', { name: 'View Coach Vikram Rathore' }).click();
  await page.getByRole('dialog').first().getByRole('button', { name: 'ID card' }).click();

  const card = page.getByRole('dialog', { name: "Coach Vikram Rathore's ID card" });
  await expect(card.locator('img')).toHaveCount(2);
  await expect(card.getByRole('button', { name: 'Show the back of the card' })).toHaveAccessibleDescription(/, coach, staff ID PF-\d{2}-[0-9A-Z]{6}\./);
});
