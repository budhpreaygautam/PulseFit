import { expect } from '@playwright/test';
import { auth, freshMember, signInAs, tabBar, test, useAppMode, useSession } from './helpers';

// The app's Me tab: ID card, the freeze switch, plans, invoices, the account and explore links, the
// dark-mode switch and Sign out. Links with a query open the full website page inside the shell.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

test('the Freeze switch freezes and unfreezes through the existing confirmation', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `me freeze ${testInfo.project.name}`);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/profile');
  const freeze = page.getByRole('switch', { name: 'Freeze membership' });
  await expect(freeze).toHaveAttribute('aria-checked', 'false');
  await freeze.click();
  await page.getByRole('dialog', { name: 'Freeze your membership?' }).getByRole('button', { name: 'Freeze membership' }).click();
  await expect(freeze).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/^Frozen since /)).toBeVisible();
  await freeze.click();
  await page.getByRole('dialog', { name: 'Unfreeze your membership?' }).getByRole('button', { name: 'Unfreeze' }).click();
  await expect(freeze).toHaveAttribute('aria-checked', 'false');
});

test('invoices list the newest payments and open the invoice', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const payments: { invoice_number: string; created_at: string }[] = (await (await request.get('/api/payments/my', { headers: auth(token) })).json()).data;
  const newest = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  await page.goto('/profile');
  for (const p of newest) await expect(page.getByRole('button', { name: `Invoice ${p.invoice_number}` })).toBeVisible();
  await page.getByRole('button', { name: `Invoice ${newest[0].invoice_number}` }).click();
  await expect(page.getByRole('dialog')).toContainText(newest[0].invoice_number);
});

test('plans mark the current one, and Switch opens Memberships for that plan', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  const plans: { tier: string; name: string }[] = (await (await request.get('/api/plans')).json()).data;
  const current = plans.find(p => p.tier === me.membership_tier)!;
  const other = plans.find(p => p.tier !== me.membership_tier)!;
  await page.goto('/profile');
  const list = page.getByRole('list', { name: 'Plans' });
  await expect(list.getByRole('listitem').filter({ hasText: current.name })).toContainText('CURRENT');
  await list.getByRole('button', { name: `Switch to ${other.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/pricing\\?plan=${other.tier}$`));
});

test('every former header and footer link is reachable from Me or a tab', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  for (const [name, url] of [
    ['Overview', /\/\?view=full$/], ['Strength floor', /\/strength$/], ['Zumba studio', /\/zumba$/], ['Plans & diets', /\/guide$/],
    ['Coaches', /\/coaches$/], ['Memberships', /\/pricing$/], ['Exercises', /\/exercises$/], ['Contact us', /\/contact$/],
    ['My bookings', /\/bookings$/], ['Gift store, my gifts & points history', /\/rewards$/],
    ['Privacy policy', /\/privacy$/], ['Terms of service', /\/terms$/], ['Refunds & cancellations', /\/refund-policy$/]
  ] as const) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await page.goBack();
    await expect(page).toHaveURL(/\/profile$/);
  }
  await expect(tabBar(page).getByRole('link')).toHaveText(['Home', 'Classes', 'Pass', 'Train', 'Me']);
});

test('links with a query open the full page in the shell, never the tab screen', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  await page.goto('/profile?tab=security');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=details$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toHaveCount(0);
  await page.goto('/schedule?trainer=trn_vikram');
  await expect(page.getByRole('heading', { level: 1, name: /book a class/i })).toBeVisible();
  const exercises: { id: string }[] = (await (await request.get('/api/exercises', { headers: auth(token) })).json()).data;
  await page.goto(`/log-workout?exercise=${exercises[0].id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Log a workout' })).toBeVisible();
});

test('Dark mode switches the theme, and Sign out clears the Train draft', async ({ page, request }) => {
  await useAppMode(page, { theme: 'light' }); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/profile');
  await page.evaluate(id => localStorage.setItem(`pulsefit_train_draft:${id}`, JSON.stringify({ title: '', startedAt: Date.now(), exercises: [] })), me.id);
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(id => localStorage.getItem(`pulsefit_train_draft:${id}`), me.id)).toBeNull();
});
