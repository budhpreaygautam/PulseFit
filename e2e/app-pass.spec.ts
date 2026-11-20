import { expect } from '@playwright/test';
import { auth, freshMember, signInAs, tabBar, test, useAppMode, useSession } from './helpers';

// The app's Pass tab: the member's real QR pass (the fixed pass code the front desk scans), with
// their member ID, plan and status. The website has no pass page.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

test("the Pass tab shows the member's real QR pass with ID, plan and status", async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Pass' }).click();
  await expect(page).toHaveURL(/\/pass$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Entry pass' })).toBeVisible();
  await expect(page.getByRole('img', { name: `QR code for pass ${me.qr_code_token}` })).toBeVisible();
  await expect(page.getByText(me.name, { exact: true })).toBeVisible();
  await expect(page.getByText(/^PF-\d{2}-[0-9A-Z]{6} · /)).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText(/refreshes in|Brightness/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy or save pass' }).click();
  await expect(page.getByRole('dialog', { name: 'Digital access pass' })).toBeVisible();
});

test('the Pass tab shows the status the server has now, on opening it and on coming back to the app', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `pass status ${testInfo.project.name}`);
  const setStatus = async (membership_status: string) =>
    expect((await request.put(`/api/members/${m.id}`, { headers: auth(m.adminToken), data: { membership_status } })).ok()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/pass');
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await setStatus('expired');
  await tabBar(page).getByRole('link', { name: 'Pass' }).click();
  await expect(page.getByText('Expired', { exact: true })).toBeVisible();
  // The app comes back from the background while it is on the Pass tab.
  await setStatus('active');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
});

test('the QR code fills the white tile, its own margin the border, as in the handoff', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/pass');
  const qr = page.getByRole('img', { name: `QR code for pass ${me.qr_code_token}` });
  await expect(qr).toBeVisible();
  const box = (await qr.boundingBox())!;
  expect([box.width, box.height].map(Math.round)).toEqual([196, 196]);
  await expect(qr.locator('..')).toHaveCSS('padding', '0px');
});

test("a frozen member's pass says the front desk will not let it in", async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `pass frozen ${testInfo.project.name}`);
  expect((await request.post('/api/membership/freeze', { headers: auth(m.token) })).ok()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/pass');
  await expect(page.getByText('Frozen', { exact: true })).toBeVisible();
  await expect(page.getByText('Your membership is frozen, so the front desk will not let this pass in until you unfreeze it.')).toBeVisible();
});

test('without the switch /pass is no app screen on the website', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/pass');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Entry pass' })).toHaveCount(0);
});
