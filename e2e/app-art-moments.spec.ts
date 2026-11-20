import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { auth, freshMember, signInAs, test, useAppMode, useSession } from './helpers';

// The app's result cartoons: every toast shows a scene for what the action did (app mode only), the
// newest plays once and every toast ends on its still; the website keeps its icon.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

interface Occurrence { id: string; title: string; category: string; day_of_week: number; occurrence_date: string; starts_at: string; is_full: boolean; my_booking_id: string | null }

const mondayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
};

/** A Zumba class the demo member can book. */
async function bookable(request: APIRequestContext, token: string): Promise<Occurrence[]> {
  const classes = (await (await request.get('/api/classes', { headers: auth(token) })).json()).data as Occurrence[];
  const soon = Date.now() + 60 * 60_000;
  const open = classes.filter(c => c.category === 'Zumba & Cardio' && !c.my_booking_id && !c.is_full && Date.parse(c.starts_at) > soon);
  expect(open.length, 'a Zumba class the demo member can book').toBeGreaterThan(0);
  return open;
}

const newest = (page: Page) => page.locator('[data-toast-id]').last();
const book = (page: Page, c: Occurrence) => page.getByRole('button', { name: new RegExp(`Book this class.*${c.title}`) }).first().click();
const openDay = (page: Page, c: Occurrence) => page.goto(`/schedule?week=${mondayOf(c.occurrence_date)}&day=${c.day_of_week}`);

/** Cancel the member's booking for a class from My bookings; the answer is up to the page's routes. */
const cancel = async (page: Page, c: Occurrence) => {
  await page.getByRole('button', { name: new RegExp(`Cancel booking for ${c.title}`) }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel booking' }).click();
};
const refuseCancel = (page: Page) => page.route('**/api/bookings/*', route => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, json: { success: false, error: 'No' } }) : route.continue()));

test('booking, a refused cancel and a cancel each show their own scene', async ({ page, request }) => {
  const token = await signInAs(page, request, 'member');
  const [a] = await bookable(request, token);
  await useAppMode(page);
  await openDay(page, a);
  await book(page, a);
  await expect(newest(page).locator('[data-scene="moment.booked"]')).toBeVisible();

  await page.goto('/bookings');
  await refuseCancel(page);
  await cancel(page, a);
  await expect(newest(page).locator('[data-scene="moment.failed"]')).toBeVisible();
  await page.unroute('**/api/bookings/*');
  await cancel(page, a);
  await expect(newest(page).locator('[data-scene="moment.cancelled"]')).toBeVisible();
});

test('two toasts in a row: both end on their still', async ({ page, request }) => {
  const token = await signInAs(page, request, 'member');
  const [a] = await bookable(request, token);
  const made = await request.post('/api/bookings', { headers: auth(token), data: { class_id: a.id, booking_date: a.occurrence_date } });
  expect(made.ok(), await made.text()).toBeTruthy();
  await useAppMode(page);
  await page.goto('/bookings');
  // A refused cancel leaves the booking in place, so two tries give two toasts.
  await refuseCancel(page);
  await cancel(page, a);
  await expect(page.locator('[data-toast-id]')).toHaveCount(1);
  await cancel(page, a);
  await expect(page.locator('[data-toast-id]')).toHaveCount(2);
  const scenes = page.locator('[data-toast-id] [data-scene="moment.failed"]');
  await expect(scenes).toHaveCount(2);
  // The older one is held at its still at once, the newest after playing once.
  await expect(scenes.first()).toHaveAttribute('data-state', 'still');
  await page.waitForTimeout(1600);
  await expect(scenes.last()).toHaveAttribute('data-state', 'still');
  await page.unroute('**/api/bookings/*');
  await cancel(page, a);
});

test('a member claiming a gift sees the gift scene', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `moment gift ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  await useSession(page, m.token);
  await useAppMode(page);
  await page.goto('/rewards');
  await page.getByRole('button', { name: /Claim .*Sticker pack/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Claim' }).click();
  await expect(newest(page).locator('[data-scene="moment.giftClaimed"]')).toBeVisible();
});

test('the front desk scan result shows the checked-in scene', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `moment scan ${testInfo.project.name}`);
  await signInAs(page, request, 'admin');
  await useAppMode(page);
  await page.goto('/admin/check-in');
  await page.getByLabel('Pass code, ID card number, member email or trial code').fill(m.email);
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByText('Access granted')).toBeVisible();
  await expect(page.locator('[data-scene="moment.checkedIn"]')).toBeVisible();
});

test('on the website a toast keeps its icon and has no scene', async ({ page, request }) => {
  const token = await signInAs(page, request, 'member');
  const [a] = await bookable(request, token);
  await openDay(page, a);
  await book(page, a);
  await expect(newest(page).locator('.toast-icon svg')).toBeVisible();
  await expect(page.locator('[data-scene]')).toHaveCount(0);
});
