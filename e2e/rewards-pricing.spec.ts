import { expect, Page } from '@playwright/test';
import { APP_HEADER, auth, signInAs, test } from './helpers';

// Sales and coupons on Memberships, the sale banner on the home page, and a friend's referral code
// at sign-up. The demo seed runs a 15% annual sale and the coupon WELCOME10 (10% off monthly plans).

const inr = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

/** Online payments on, as fix-member-ui.spec.ts does: the coupon field sits under the pay button. */
async function paymentsOn(page: Page) {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.payments = { enabled: true, provider: 'razorpay', keyId: 'rzp_test_e2e' };
    await route.fulfill({ response, json });
  });
}

test('Memberships shows the live annual sale and accepts WELCOME10 on a monthly plan', async ({ page, request }) => {
  const token = await signInAs(page, request, 'member');
  await paymentsOn(page);
  const quotes = (await (await request.get('/api/payment/quotes', { headers: auth(token) })).json()).data as Array<{ tier: string; billing_cycle: string; base: number; total: number }>;
  const basicAnnual = quotes.find(q => q.tier === 'basic' && q.billing_cycle === 'annual')!;

  await page.goto('/pricing?cycle=annual');
  await expect(page.getByText('15% off').first()).toBeVisible();
  await expect(page.getByText(/ends in/).first()).toBeVisible();
  // The list price struck through, and the pay button says what the member pays.
  const basic = page.locator('#plan-basic');
  await expect(basic.locator('s')).toContainText(inr(basicAnnual.base));
  await expect(basic.getByRole('button', { name: new RegExp(`· ${inr(basicAnnual.total)},`) })).toBeVisible();

  await page.getByRole('button', { name: 'Monthly' }).click();
  await page.getByRole('button', { name: 'Have a coupon?' }).first().click();
  await page.getByLabel('Coupon code').fill('welcome10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('WELCOME10: 10% off')).toBeVisible();
  const withCoupon = (await (await request.post('/api/payment/quote', { headers: auth(token), data: { tier: 'basic', billing_cycle: 'monthly', coupon_code: 'WELCOME10' } })).json()).data;
  await expect(basic.getByRole('button', { name: new RegExp(`· ${inr(withCoupon.total)},`) })).toBeVisible();

  // A wrong code shows the server's message; Remove goes back to the normal price.
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByLabel('Coupon code').fill('NOSUCHCODE');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('That coupon code is not valid. Check it and try again.')).toBeVisible();
});

test('guests see the sale banner on the home page and never a coupon code', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Sale' });
  await expect(banner).toContainText(/ends in/);
  await expect(page.getByText(/Join on an annual plan and get a welcome kit: /)).toBeVisible();
  expect(await page.content()).not.toContain('WELCOME10');
  await banner.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Create your account' })).toBeVisible();
});

test('the sign-up form sends a referral code', async ({ page, request }) => {
  const friend = (await (await request.post('/api/auth/demo-login', { data: { role: 'member' } })).json()).data;
  const code = (await (await request.get('/api/rewards/me', { headers: auth(friend.token) })).json()).data.referral_code as string;

  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create an account' }).click();
  await dialog.locator('#auth-name').fill('Kabir Referred');
  await dialog.getByLabel('Gender', { exact: true }).selectOption('male');
  await dialog.locator('#auth-email').fill(`referral-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await dialog.locator('#auth-password').fill('Lift-2026-now');
  await dialog.getByLabel(/Referral code/).fill(code.toLowerCase());
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog).toBeHidden();

  // The page's own cookies, plus the header the app sends.
  const me = (await (await page.request.get('/api/auth/me', { headers: APP_HEADER })).json()).data;
  const admin = (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token as string;
  try {
    const detail = (await (await request.get(`/api/members/${me.id}`, { headers: auth(admin) })).json()).data;
    expect(detail.rewards.referred_by).toEqual({ id: friend.user.id, name: friend.user.name });
  } finally {
    await request.delete(`/api/members/${me.id}`, { headers: auth(admin) });
  }
});
