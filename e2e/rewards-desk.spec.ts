import { expect, Page } from '@playwright/test';
import { auth, freshMember, signInAs, test } from './helpers';

// The front desk and rewards: desk sales from the member forms, gifts handed over from the check-in
// scanner, and a member's points in the member details.

/** Find one account on the members page by email. */
async function findMember(page: Page, email: string) {
  await page.goto('/admin/members');
  await page.getByLabel('Search by name, email, phone or pass code').fill(email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^1 account$/ })).toBeVisible();
}

test('the desk records a sale from the member editor and the joining gift shows in the member details', async ({ page, request }, testInfo) => {
  await signInAs(page, request, 'admin');
  const label = `desk sale ${testInfo.project.name}`;
  const m = await freshMember(request, label);

  // On Add member, choosing a plan means the member paid at the desk, unless free time is chosen.
  await page.goto('/admin/members');
  await page.getByRole('button', { name: 'Add member' }).click();
  const add = page.getByRole('dialog');
  await add.getByLabel('Plan', { exact: true }).selectOption('basic');
  await expect(add.getByLabel('Payment collected at the desk')).toBeChecked();
  await add.getByRole('button', { name: 'Cancel' }).click();

  await findMember(page, m.email);
  await page.getByRole('button', { name: `Edit E2E ${label}` }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Plan sold').selectOption('basic');
  await edit.getByLabel('Billing').selectOption('annual');
  await expect(edit.getByLabel('Amount collected (₹)')).not.toHaveValue('');
  await edit.getByLabel('Paid by').selectOption('cash');
  await edit.getByRole('button', { name: 'Record sale' }).click();
  await expect(page.locator('.toast-message', { hasText: 'PulseFit T-shirt' })).toBeVisible();

  await page.getByRole('button', { name: `View E2E ${label}` }).click();
  const rewards = page.getByRole('dialog').getByRole('region', { name: 'Rewards' });
  await expect(rewards.getByRole('listitem').filter({ hasText: 'PulseFit T-shirt' })).toContainText('Needs a size');
  await expect(rewards.getByRole('listitem').filter({ hasText: 'Shaker' })).toContainText('Ready');
  const payments = (await (await request.get(`/api/payments?user_id=${m.id}`, { headers: auth(m.adminToken) })).json()).data;
  expect(payments[0]).toMatchObject({ source: 'desk', desk_method: 'cash', tier: 'basic', billing_cycle: 'annual' });
});

test('the check-in scanner shows a ready gift and hands it over', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `scanner gift ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  const claim = await request.post('/api/rewards/claims', { headers: auth(m.token), data: { gift_id: 'gift_sticker_pack' } });
  expect(claim.status(), await claim.text()).toBe(201);

  const token = await signInAs(page, request, 'admin');
  await page.goto('/admin/check-in');
  await page.getByLabel('Pass code, ID card number, member email or trial code').fill(m.email);
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByText('1 gift ready')).toBeVisible();
  await page.getByRole('button', { name: /^Hand over Sticker pack/ }).click();
  await expect(page.getByText('0 gifts ready')).toBeVisible();

  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  const claims = (await (await request.get(`/api/rewards/claims?user_id=${m.id}`, { headers: auth(token) })).json()).data;
  expect(claims[0]).toMatchObject({ gift_id: 'gift_sticker_pack', status: 'handed_over', handed_over_by: { name: me.name } });
});

test("an admin adjusts a member's points from the member details", async ({ page, request }, testInfo) => {
  await signInAs(page, request, 'admin');
  const label = `adjust points ${testInfo.project.name}`;
  const m = await freshMember(request, label);

  await findMember(page, m.email);
  await page.getByRole('button', { name: `View E2E ${label}` }).click();
  const rewards = page.getByRole('dialog').getByRole('region', { name: 'Rewards' });
  await expect(rewards.getByText('0 points', { exact: true })).toBeVisible();
  await rewards.getByLabel('Points to add or remove').fill('50');
  await rewards.getByLabel('Note', { exact: true }).fill('Helped at the open day');
  await rewards.getByRole('button', { name: 'Adjust points' }).click();
  await expect(rewards.getByText('50 points', { exact: true })).toBeVisible();

  const detail = (await (await request.get(`/api/members/${m.id}`, { headers: auth(m.adminToken) })).json()).data;
  expect(detail.rewards.balance).toBe(50);
  expect(detail.rewards.recent_points[0]).toMatchObject({ points: 50, reason: 'admin_adjust', note: 'Helped at the open day' });
});
