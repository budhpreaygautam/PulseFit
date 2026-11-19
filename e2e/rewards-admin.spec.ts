import { expect } from '@playwright/test';
import { auth, freshMember, signInAs, test } from './helpers';

// Admin "Plans & rewards": the gift catalogue and the front desk's pickups list.

test('an admin adds a gift to the catalogue', async ({ page, request }, testInfo) => {
  const token = await signInAs(page, request, 'admin');
  const name = `E2E bottle ${testInfo.project.name} ${Date.now().toString(36)}`;
  await page.goto('/admin/plans?section=gifts');
  await page.getByRole('button', { name: 'Add gift' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Level', { exact: true }).selectOption('medium');
  await form.getByLabel('Points', { exact: true }).fill('400');
  await form.getByLabel('Stock', { exact: true }).fill('3');
  await form.getByRole('button', { name: 'Add gift' }).click();
  // Exact: the row's Edit and Delete buttons carry the name too.
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  const gifts = (await (await request.get('/api/rewards/gifts', { headers: auth(token) })).json()).data;
  expect(gifts.find((g: any) => g.name === name)).toMatchObject({ level: 'medium', points_cost: 400, stock: 3, active: true });
});

test('saving a gift does not put back stock a member claimed while the form was open', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `stock ${testInfo.project.name}`);
  const name = `E2E flask ${testInfo.project.name} ${Date.now().toString(36)}`;
  const made = await request.post('/api/rewards/gifts', {
    headers: auth(m.adminToken),
    data: { name, description: '', image: '🧉', level: 'small', points_cost: 100, kind: 'item', stock: 3 }
  });
  const gift = (await made.json()).data;
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 100, note: 'e2e' } });

  await signInAs(page, request, 'admin');
  await page.goto('/admin/plans?section=gifts');
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Stock', { exact: true })).toHaveValue('3');
  expect((await request.post('/api/rewards/claims', { headers: auth(m.token), data: { gift_id: gift.id } })).status()).toBe(201);
  await form.getByLabel('Description', { exact: true }).fill('Now with a lid.');
  await form.getByRole('button', { name: 'Save gift' }).click();
  await expect(form).toBeHidden();
  const gifts = (await (await request.get('/api/rewards/gifts', { headers: auth(m.adminToken) })).json()).data;
  expect(gifts.find((g: any) => g.id === gift.id)).toMatchObject({ description: 'Now with a lid.', stock: 2 });
});

test('the pickups tab lists ready claims, and the desk hands one over', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `pickup ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  const res = await request.post('/api/rewards/claims', { headers: auth(m.token), data: { gift_id: 'gift_sticker_pack' } });
  expect(res.status(), await res.text()).toBe(201);
  const claim = (await res.json()).data;

  await signInAs(page, request, 'admin');
  await page.goto('/admin/plans');
  await page.getByRole('tab', { name: 'Pickups' }).click();
  const row = page.getByRole('listitem').filter({ hasText: claim.pickup_code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Hand over/ }).click();
  await expect(row).toBeHidden();
  const claims = (await (await request.get(`/api/rewards/claims?user_id=${m.id}`, { headers: auth(m.adminToken) })).json()).data;
  expect(claims[0]).toMatchObject({ pickup_code: claim.pickup_code, status: 'handed_over' });
});

// A gym-local (IST, no daylight saving) 'YYYY-MM-DDTHH:MM' for a datetime-local input, `days` from now.
const istInput = (days: number) => new Date(Date.now() + days * 86_400_000 + 330 * 60_000).toISOString().slice(0, 16);

test('an admin schedules a sale and it is not live before it starts', async ({ page, request }, testInfo) => {
  const token = await signInAs(page, request, 'admin');
  const title = `E2E sale ${testInfo.project.name} ${Date.now().toString(36)}`;
  await page.goto('/admin/plans?section=offers');
  await page.getByRole('button', { name: 'New sale' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Title', { exact: true }).fill(title);
  await form.getByLabel('Percent off', { exact: true }).fill('20');
  await form.getByLabel('Monthly', { exact: true }).check();
  await form.getByLabel('Starts', { exact: true }).fill(istInput(1));
  await form.getByLabel('Ends', { exact: true }).fill(istInput(8));
  await form.getByRole('button', { name: 'Add sale' }).click();
  // Exact: the toast names the sale too.
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  const offers = (await (await request.get('/api/offers', { headers: auth(token) })).json()).data;
  expect(offers.find((o: any) => o.title === title)).toMatchObject({ percent_off: 20, amount_off: null, tiers: [], billing_cycles: ['monthly'], active: true });
  // It starts tomorrow, so guests do not see it yet (and the WELCOME10 pricing test is unaffected).
  const promos = (await (await request.get('/api/promotions')).json()).data;
  expect(promos.sales.map((s: any) => s.title)).not.toContain(title);
});

test('an admin changes the points per check-in', async ({ page, request }) => {
  const token = await signInAs(page, request, 'admin');
  await page.goto('/admin/plans?section=rules');
  await page.getByLabel('Points per check-in').fill('12');
  await page.getByRole('button', { name: 'Save rules' }).click();
  await expect(page.locator('.toast-message', { hasText: 'Reward rules saved.' })).toBeVisible();
  const settings = (await (await request.get('/api/rewards/settings', { headers: auth(token) })).json()).data;
  expect(settings.points_per_checkin).toBe(12);
  // Put it back for the other specs; launched_at is the server's own and never sent.
  const { launched_at: _launched, ...rules } = settings;
  const reset = await request.put('/api/rewards/settings', { headers: auth(token), data: { ...rules, points_per_checkin: 10 } });
  expect(reset.ok(), await reset.text()).toBeTruthy();
});
