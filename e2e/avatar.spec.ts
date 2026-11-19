import { expect, Page } from '@playwright/test';
import { test, trackConsoleErrors, useSession } from './helpers';

// "Change avatar" on My account, on the picture and as a button, opens a small window with the ten
// avatars bundled with the app and a "Custom" tile that uploads a photo.

/** The image has loaded (an SVG from the app itself), not just been given an address. */
const loaded = (img: ReturnType<Page['locator']>) => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

// A 1×1 PNG, as a photo to upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('a member changes their avatar on My account', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const email = `avatar-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await request.post('/api/auth/register', { data: { name: 'Avi Patel', email, password: 'Lift-2026-now', gender: 'male' } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { token, user } = (await res.json()).data;
  await useSession(page, token);

  try {
    await page.goto('/profile');
    const photo = page.getByRole('img', { name: 'Your profile photo' });
    const navPicture = page.getByRole('link', { name: 'My account (Avi Patel)' }).locator('img');
    await expect(photo).toHaveAttribute('src', /\/avatars\/male\.svg$/);
    const changeAvatar = page.getByRole('button', { name: 'Change avatar', exact: true });
    // The picture's own button comes first, then the one next to "Check-in pass".
    await expect(changeAvatar).toHaveCount(2);

    await changeAvatar.first().click();
    const dialog = page.getByRole('dialog', { name: 'Change avatar' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await expect(dialog.locator('button[aria-pressed]')).toHaveCount(10);
    await expect(dialog.locator('button[aria-pressed="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

    // One tap saves it and closes the window.
    await dialog.getByRole('button', { name: 'Red baseball cap' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast-message', { hasText: 'Your avatar was updated.' })).toBeVisible();
    await expect(changeAvatar.first()).toBeFocused();
    for (const picture of [photo, navPicture]) {
      await expect(picture).toHaveAttribute('src', '/avatars/preset-06.svg');
      await expect.poll(() => loaded(picture)).toBe(true);
    }

    await page.reload();
    await expect(photo).toHaveAttribute('src', '/avatars/preset-06.svg');
    await expect(navPicture).toHaveAttribute('src', '/avatars/preset-06.svg');

    // The button opens the same window: the current avatar is marked, and Custom uploads a photo.
    await changeAvatar.last().click();
    await expect(dialog.getByRole('button', { name: 'Red baseball cap' })).toHaveAttribute('aria-pressed', 'true');
    const custom = dialog.getByRole('button', { name: 'Custom: upload your own photo' });
    await expect(custom).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(changeAvatar.last()).toBeFocused();

    await changeAvatar.last().click();
    const chooser = page.waitForEvent('filechooser');
    await custom.click();
    await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast-message', { hasText: 'Your photo was updated.' })).toBeVisible();
    await expect(photo).toHaveAttribute('src', /^data:image\/jpeg;base64,/);

    expect(errors).toEqual([]);
  } finally {
    const admin = (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token as string;
    await request.delete(`/api/members/${user.id}`, { headers: { Authorization: `Bearer ${admin}` } });
  }
});
