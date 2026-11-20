import { expect, type Page } from '@playwright/test';
import { auth, signInAs, test, trackConsoleErrors, useAppMode } from './helpers';

// The app's own pages, opened from its menu drawer (app mode), after the owner's phone test: Policies &
// terms (/policies), Visit us (/visit) and Offers & gifts (/offers). Not tabs, so the app bar shows ←
// and the page's title. On the website each is a missing page, as /pass is.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const ADDRESS = 'Plot 42, Sector 29, near Cyber Hub, Gurugram, Haryana 122002';

async function expectAppBar(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('banner').getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(title);
}

test('Policies & terms holds the three policies with their dates, jump links to each, and your account and data', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await useAppMode(page);
  await page.goto('/policies');
  await expect(page.getByRole('heading', { level: 1, name: 'Policies & terms' })).toBeVisible();
  await expectAppBar(page, 'Policies & terms');
  const parts = ['Privacy policy', 'Terms of service', 'Refund & cancellation policy', 'Your account and data'];
  for (const name of parts) await expect(page.getByRole('heading', { level: 2, name, exact: true })).toHaveCount(1);
  // The website's own texts: a section of each.
  for (const name of ['What we collect and why', 'Class bookings', 'How refunds are paid']) await expect(page.getByRole('heading', { level: 3, name }).first()).toBeAttached();
  await expect(page.getByText(/^Last updated/)).toHaveCount(3);

  const jumpList = page.getByRole('navigation', { name: 'On this page' });
  await expect(jumpList.getByRole('link')).toHaveText(parts);
  for (const name of ['Refund & cancellation policy', 'Your account and data', 'Privacy policy']) {
    const heading = page.getByRole('heading', { level: 2, name, exact: true });
    await jumpList.getByRole('link', { name }).click();
    await expect(heading).toBeInViewport();
    // Not hidden under the app bar.
    const bar = (await page.getByRole('banner').boundingBox())!;
    await expect.poll(async () => (await heading.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    await expect(page).toHaveURL(/\/policies$/);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  const account = page.getByRole('region', { name: 'Your account and data' });
  await expect(account.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/profile');
  await expect(account.getByRole('link', { name: 'Invoices & billing' })).toHaveAttribute('href', '/profile?tab=billing');
  await expect(account).toContainText('delete your account');
  await expect(account.getByRole('link', { name: '+91 98110 78573' })).toHaveAttribute('href', 'tel:+919811078573');
  await expect(account.getByRole('link', { name: 'contact@pulsefit.in' })).toHaveAttribute('href', 'mailto:contact@pulsefit.in');
  await expect(account.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact');
  // Only the installed app knows its version.
  await expect(account).not.toContainText('version');
  expect(errors).toEqual([]);
});

test.describe('Visit us', () => {
  // A device far from the gym: open or closed follows the gym's clock (IST), not the phone's.
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('shows the address, directions in Google Maps, tap to call, the email and the hours, open now', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    // Monday 23 November 2026, 10:30 am at the gym (Sunday 9 pm on this device).
    await page.clock.setFixedTime(new Date('2026-11-23T05:00:00Z'));
    await useAppMode(page);
    await page.goto('/visit');
    await expect(page.getByRole('heading', { level: 1, name: 'Visit us' })).toBeVisible();
    await expectAppBar(page, 'Visit us');
    await expect(page.locator('main address')).toHaveText(ADDRESS);
    await expect(page.getByRole('link', { name: 'Get directions' })).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`
    );
    await expect(page.getByRole('link', { name: '+91 98110 78573' })).toHaveAttribute('href', 'tel:+919811078573');
    await expect(page.getByRole('link', { name: 'contact@pulsefit.in' })).toHaveAttribute('href', 'mailto:contact@pulsefit.in');
    const hours = page.locator('main dl');
    await expect(hours.locator('dt')).toHaveText(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (day === 'Monday' ? `${day} (today)` : day)));
    await expect(hours.locator('dd')).toHaveText([...Array(6).fill('6:00 am – 10:00 pm'), 'Closed']);
    await expect(page.getByText('Open now · until 10:00 pm')).toBeVisible();
    // No embedded map.
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('says closed after closing time at the gym, and on Sunday', async ({ page }) => {
    await useAppMode(page);
    // Monday 10:30 pm at the gym, 9 am on this device.
    await page.clock.setFixedTime(new Date('2026-11-23T17:00:00Z'));
    await page.goto('/visit');
    await expect(page.getByText('Closed now')).toBeVisible();
    await expect(page.getByText(/^Open now/)).toHaveCount(0);
    // Sunday noon at the gym.
    await page.clock.setFixedTime(new Date('2026-11-22T06:30:00Z'));
    await page.reload();
    await expect(page.getByText('Closed now')).toBeVisible();
    await expect(page.locator('main dl dt').last()).toHaveText('Sunday (today)');
  });

  test('stays up to date while the page is open, and when the app comes back to the front', async ({ page }) => {
    // Monday 9:59 pm at the gym; the clock runs on from there.
    await page.clock.install({ time: new Date('2026-11-23T16:29:00Z') });
    await useAppMode(page);
    await page.goto('/visit');
    await expect(page.getByText('Open now · until 10:00 pm')).toBeVisible();
    await page.clock.runFor(60_000);
    await expect(page.getByText('Closed now')).toBeVisible();
    await expect(page.locator('main dl dt').first()).toHaveText('Monday (today)');
    // Back from the background on Sunday noon at the gym: no timer has fired yet.
    await page.clock.setSystemTime(new Date('2026-11-29T06:30:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('main dl dt').last()).toHaveText('Sunday (today)');
  });
});

test("a guest's Offers & gifts shows the sales and joining gifts from the API, how points work, and a sign-up prompt, never the gift store", async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const promotions = (await (await request.get('/api/promotions')).json()).data;
  expect(promotions.sales.length).toBeGreaterThan(0);
  expect(promotions.joining_gifts.length).toBeGreaterThan(0);
  const storeRequests: string[] = [];
  page.on('request', r => r.url().includes('/api/rewards') && storeRequests.push(r.url()));
  await useAppMode(page);
  await page.goto('/offers');
  await expect(page.getByRole('heading', { level: 1, name: 'Offers & gifts' })).toBeVisible();
  await expectAppBar(page, 'Offers & gifts');

  const sales = page.getByRole('region', { name: 'Sales on now' });
  for (const sale of promotions.sales) await expect(sales.getByText(sale.title, { exact: true })).toBeVisible();
  await expect(sales.getByText(/% off · ends in \d+ (day|hour|minute)s?$/).first()).toBeVisible();
  await expect(sales.getByRole('link', { name: 'See memberships' })).toHaveAttribute('href', '/pricing');
  const joining = page.getByRole('region', { name: 'Joining gifts' });
  for (const j of promotions.joining_gifts) await expect(joining.getByText(j.gifts.join(', '), { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Points and milestone gifts' })).toContainText('check-ins');
  await expect(page.getByRole('region', { name: 'Gift store' })).toHaveCount(0);
  // Pull to refresh is offered here.
  await expect(page.locator('.pull-spinner')).toHaveCount(1);

  await page.getByRole('region', { name: 'Sign up' }).getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('dialog', { name: 'Create your account' })).toBeVisible();
  expect(storeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("a member's Offers & gifts shows their points with a link to Rewards, their milestones and the gift store", async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const token = await signInAs(page, request, 'member');
  const rewards = (await (await request.get('/api/rewards/me', { headers: auth(token) })).json()).data;
  const store = (await (await request.get('/api/rewards/gifts', { headers: auth(token) })).json()).data;
  expect(store.length).toBeGreaterThan(0);
  await useAppMode(page);
  await page.goto('/offers');
  const points = page.getByRole('region', { name: 'Points and milestone gifts' });
  await expect(points.getByText(rewards.balance.toLocaleString('en-IN'), { exact: true })).toBeVisible();
  await expect(points.getByRole('link', { name: 'Open Rewards' })).toHaveAttribute('href', '/rewards');
  await expect(points).toContainText(`Earn ${rewards.earning.checkin} points for each check-in`);
  for (const m of rewards.milestones) await expect(points.getByText(m.gift_name, { exact: true })).toBeVisible();
  const giftStore = page.getByRole('region', { name: 'Gift store' });
  await expect(giftStore.getByRole('listitem')).toHaveCount(store.length);
  await expect(giftStore.getByText(store[0].name, { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sign up' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an admin's gift store is the members' store, in its order and stock, not the whole catalogue", async ({ page, request }) => {
  const adminToken = await signInAs(page, request, 'admin');
  // Gifts the admin's catalogue has and the store must not: reward-only and retired; and two sold out.
  const tag = Date.now().toString(36);
  const gift = { description: '', image: '🎁', level: 'small', kind: 'item' };
  const made = {
    rewardOnly: { ...gift, name: `E2E reward-only ${tag}`, points_cost: null, stock: null },
    retired: { ...gift, name: `E2E retired ${tag}`, points_cost: 100, stock: null, active: false },
    soldOut: { ...gift, name: `E2E sold out ${tag}`, points_cost: 300, stock: 0 },
    soldOutSized: { ...gift, name: `E2E sold out tee ${tag}`, points_cost: 310, sizes: ['M', 'L'], stock_by_size: { M: 0, L: 0 } }
  };
  for (const data of Object.values(made)) {
    const res = await request.post('/api/rewards/gifts', { headers: auth(adminToken), data });
    expect(res.status(), await res.text()).toBe(201);
  }
  const member = await request.post('/api/auth/demo-login', { data: { role: 'member' } });
  const store: { name: string; in_stock: boolean }[] = (await (await request.get('/api/rewards/gifts', { headers: auth((await member.json()).data.token) })).json()).data;
  const soldOut = store.filter(g => !g.in_stock).map(g => g.name);
  expect(soldOut).toEqual(expect.arrayContaining([made.soldOut.name, made.soldOutSized.name]));

  await useAppMode(page);
  await page.goto('/offers');
  const giftStore = page.getByRole('region', { name: 'Gift store' });
  const items = giftStore.getByRole('listitem');
  await expect(items).toHaveCount(store.length);
  // Same count, so each item in turn: cheapest first, as members see it.
  await expect(items).toContainText(store.map(g => g.name));
  await expect(items.filter({ hasText: 'Out of stock' })).toHaveCount(soldOut.length);
  await expect(items.filter({ hasText: 'Out of stock' })).toContainText(soldOut);
  for (const name of [made.rewardOnly.name, made.retired.name]) await expect(giftStore.getByText(name)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Points and milestone gifts' })).toContainText('Members earn points');
});

for (const path of ['/policies', '/visit', '/offers']) {
  test(`on the website ${path} is the missing page, also for a member`, async ({ page, request }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Please sign in' })).toHaveCount(0);
    await signInAs(page, request, 'member');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
}
