import { expect } from '@playwright/test';
import { freshMember, test, useAppMode, useSession } from './helpers';

// A gift whose image is a built-in picture path shows as a picture (website and app); every other gift
// keeps its emoji. The store answer is rewritten here so the check does not depend on which pictures are listed
// in client/src/data/gift-pictures.json: the mug gets a picture and the free week is put back on its emoji.

for (const mode of ['website', 'app'] as const) {
  test(`the store shows a built-in picture as an image and the other gifts as emoji (${mode})`, async ({ page, request }, testInfo) => {
    const m = await freshMember(request, `gift picture ${mode} ${testInfo.project.name}`);
    if (mode === 'app') await useAppMode(page);
    await useSession(page, m.token);
    await page.route('**/api/rewards/gifts', async route => {
      const response = await route.fetch();
      const json = await response.json();
      const image: Record<string, string> = { gift_mug: '/gifts/mug.webp', gift_free_week: '📅' };
      json.data = json.data.map((g: { id: string; image: string }) => (image[g.id] ? { ...g, image: image[g.id] } : g));
      await route.fulfill({ response, json });
    });
    await page.goto('/rewards');
    const mug = page.getByRole('listitem').filter({ hasText: 'Coffee mug' });
    await expect(mug.locator('img[src="/gifts/mug.webp"]')).toHaveCount(1);
    await expect(mug.getByText('☕')).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: 'Free week of membership' }).getByText('📅')).toBeVisible();
  });
}