import { expect } from '@playwright/test';
import { auth, freshMember, signInAs, test, useSession } from './helpers';

// The member Rewards page: points, the gift store and the dashboard's pickup banner. Each test uses
// its own new member, so the demo personas' seeded points and gifts never change the counts.

test('a member sees their points, claims a gift from the store and the dashboard says it is ready', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `rewards ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  await useSession(page, m.token);
  await page.goto('/rewards');
  await expect(page.getByText('300', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Claim .*Sticker pack/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText(/Pickup code [A-Z2-9]{6}/)).toBeVisible();
  const me = (await (await request.get('/api/rewards/me', { headers: auth(m.token) })).json()).data;
  expect(me.claims[0]).toMatchObject({ gift_id: 'gift_sticker_pack', status: 'ready' });
  await page.goto('/dashboard');
  await expect(page.getByText('You have a gift ready to collect')).toBeVisible();
});

test('an out-of-stock store gift keeps its text at full contrast', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `sold out ${testInfo.project.name}`);
  const name = `E2E sold out ${testInfo.project.name} ${Date.now().toString(36)}`;
  const made = await request.post('/api/rewards/gifts', {
    headers: auth(m.adminToken),
    data: { name, description: 'Back next month.', image: '🧃', level: 'small', points_cost: 100, kind: 'item', stock: 0 }
  });
  expect(made.status(), await made.text()).toBe(201);
  await useSession(page, m.token);
  await page.goto('/rewards');
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('Out of stock')).toBeVisible();
  // Dimming the whole card took its small grey text below 4.5:1 (review).
  await expect(card).toHaveCSS('opacity', '1');
});

test('a member earns points from a check-in, claims a gift, and the front desk hands it over from the scanner', async ({ page, browser, request }, testInfo) => {
  const m = await freshMember(request, `journey ${testInfo.project.name}`);
  // The front desk works in a browser of its own, signed in as the admin.
  const desk = await browser.newContext();
  try {
    const deskPage = await desk.newPage();
    await signInAs(deskPage, request, 'admin');
    const scan = async () => {
      await deskPage.getByLabel('Pass code, ID card number, member email or trial code').fill(m.email);
      await deskPage.getByRole('button', { name: 'Check in', exact: true }).click();
    };
    await deskPage.goto('/admin/check-in');
    await scan();
    await expect(deskPage.getByText('Access granted')).toBeVisible();

    await useSession(page, m.token);
    await page.goto('/rewards');
    await expect(page.getByText(/Check-in/).first()).toBeVisible();
    const me = (await (await request.get('/api/rewards/me', { headers: auth(m.token) })).json()).data;
    // Not a literal: the rules spec edits the points a check-in earns.
    expect(me.balance).toBe(me.earning.checkin);

    await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
    await page.reload();
    await page.getByRole('button', { name: /Claim .*Sticker pack/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Claim' }).click();
    await expect(page.getByText(/Pickup code [A-Z2-9]{6}/)).toBeVisible();

    // The second scan the same day lets them in without a new visit, and offers the gift.
    await deskPage.reload();
    await scan();
    await expect(deskPage.getByText('Already checked in today', { exact: false })).toBeVisible();
    await expect(deskPage.getByText('1 gift ready')).toBeVisible();
    await deskPage.getByRole('button', { name: /^Hand over Sticker pack/ }).click();
    await expect(deskPage.getByText('0 gifts ready')).toBeVisible();

    const claims = (await (await request.get(`/api/rewards/claims?user_id=${m.id}`, { headers: auth(m.adminToken) })).json()).data;
    expect(claims[0]).toMatchObject({ gift_id: 'gift_sticker_pack', status: 'handed_over' });
  } finally {
    await desk.close();
  }
});
