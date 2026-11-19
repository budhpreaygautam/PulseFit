import { expect } from '@playwright/test';
import { auth, freshMember, test, useAppMode, useSession } from './helpers';

// Rewards in the app: the card on Home and the Rewards section in Me, with the Rewards page (claiming,
// sizes, points history) one tap away.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

test('Home shows the Rewards card with the balance and a ready gift, and it opens the Rewards section in Me', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app rewards ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  const claim = (await (await request.post('/api/rewards/claims', { headers: auth(m.token), data: { gift_id: 'gift_sticker_pack' } })).json()).data;
  const rewards = (await (await request.get('/api/rewards/me', { headers: auth(m.token) })).json()).data;
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  // Named by what it says, so a screen reader hears the waiting gift too, not only the points.
  const card = page.getByRole('button', { name: new RegExp(`^Rewards .*Gift ready to collect ${rewards.balance.toLocaleString('en-IN')} points$`) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/profile\?section=rewards$/);
  const section = page.getByRole('region', { name: 'Rewards' });
  await expect(section).toBeInViewport();
  await expect(section.getByText(`Pickup code ${claim.pickup_code}`)).toBeVisible();
  await expect(section.getByText(rewards.referral_code)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(section.getByRole('button', { name: /, \d+ points$/ })).toHaveCount(3);
  await section.getByRole('link', { name: 'Gift store, my gifts & points history' }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/profile\?section=rewards$/);
});

test('a gift waiting for a size says Choose a size on Home and in Me, and opens the Rewards page', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app sizes ${testInfo.project.name}`);
  // Apparel from a milestone or a joining bundle arrives without a size; the answer is given one here.
  await page.route('**/api/rewards/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.claims.unshift({
      id: 'clm_e2e_size', user_id: m.id, user_name: 'E2E', gift_id: 'gift_tshirt', gift_name: 'PulseFit T-shirt', source: 'joining', source_ref: 'pay_e2e',
      points_spent: 0, pickup_code: 'SIZE23', status: 'needs_size', created_at: new Date().toISOString(), sizes: ['S', 'M', 'L', 'XL', 'XXL']
    });
    await route.fulfill({ response, json: body });
  });
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: /^Rewards .*Choose a size \d[\d,]* points$/ })).toBeVisible();
  await page.goto('/profile');
  const section = page.getByRole('region', { name: 'Rewards' });
  await expect(section.getByText('PulseFit T-shirt')).toBeVisible();
  await section.getByRole('button', { name: 'Choose a size' }).click();
  await expect(page).toHaveURL(/\/rewards$/);
});
