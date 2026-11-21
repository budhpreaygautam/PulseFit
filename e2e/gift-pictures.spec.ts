import { expect } from '@playwright/test';
import { freshMember, test, useAppMode, useSession } from './helpers';

// A gift whose image is a built-in picture path shows as a picture (website and app); every other gift
// keeps its emoji. client/src/data/gift-pictures.json starts empty, so the store answer is rewritten here.

for (const mode of ['website', 'app'] as const) {
  test(`the store shows a built-in picture as an image and the other gifts as emoji (${mode})`, async ({ page, request }, testInfo) => {
    const m = await freshMember(request, `gift picture ${mode} ${testInfo.project.name}`);
    if (mode === 'app') await useAppMode(page);
    await useSession(page, m.token);
    await page.route('**/api/rewards/gifts', async route => {
      const response = await route.fetch();
      const json = await response.json();
      json.data = json.data.map((g: { id: string; image: string }) => (g.id === 'gift_mug' ? { ...g, image: '/gifts/mug.webp' } : g));
      await route.fulfill({ response, json });
    });
    await page.goto('/rewards');
    const mug = page.getByRole('listitem').filter({ hasText: 'Coffee mug' });
    await expect(mug.locator('img[src="/gifts/mug.webp"]')).toHaveCount(1);
    await expect(mug.getByText('☕')).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: 'Sticker pack' }).getByText('🏷️')).toBeVisible();
  });
}