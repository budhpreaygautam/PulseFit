import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { auth, freshMember, signInAs, tabBar, test, useAppMode, useSession } from './helpers';

// The app's Classes tab: the gym's open days as chips, each day's classes with the state the booking
// rules give them, and booking and cancelling in place.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

const chips = (page: Page) => page.getByRole('group', { name: 'Day' }).getByRole('button');

/** Select the i-th day chip and wait for that day's list or its empty line. */
async function openDay(page: Page, i: number): Promise<void> {
  const chip = chips(page).nth(i);
  await chip.click();
  const day = await chip.getAttribute('aria-label');
  await expect(page.getByRole('list', { name: `Classes on ${day}` }).or(page.getByText(/^No classes on /))).toBeVisible();
}

/** Tap the first Book button over the open days; returns the class title. */
async function bookFirst(page: Page): Promise<string> {
  for (let i = 0; i < (await chips(page).count()); i++) {
    await openDay(page, i);
    const book = page.getByRole('button', { name: /^Book .+ at / }).first();
    if (await book.count()) {
      const title = (await book.getAttribute('aria-label'))!.replace(/^Book (.+) at .+$/, '$1');
      await book.click();
      return title;
    }
  }
  throw new Error('no bookable class on the open days');
}

async function openClasses(page: Page, request: APIRequestContext, label: string) {
  const m = await freshMember(request, label);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/schedule');
  await expect(chips(page).first()).toBeVisible();   // the loops below count the chips
  return m;
}

test("day chips are the gym's open days from today", async ({ page, request }, testInfo) => {
  const { closedWeekdays } = (await (await request.get('/api/config')).json()).data.gym.hours as { closedWeekdays: number[] };
  await openClasses(page, request, `classes days ${testInfo.project.name}`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const labels: string[] = [];
  for (let i = 0; labels.length < 7 - closedWeekdays.length; i++) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    if (!closedWeekdays.includes(d.getUTCDay())) labels.push(new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d));
  }
  await expect(chips(page)).toHaveCount(labels.length);
  for (const [i, label] of labels.entries()) await expect(chips(page).nth(i)).toHaveAttribute('aria-label', label);
});

test('booking from Classes shows Booked and the class appears on Home', async ({ page, request }, testInfo) => {
  await openClasses(page, request, `classes book ${testInfo.project.name}`);
  const title = await bookFirst(page);
  await expect(page.getByText('Class booked').first()).toBeVisible();   // the toast and its screen-reader announcer
  const card = page.getByRole('listitem').filter({ hasText: title }).first();
  await expect(card.getByRole('button', { name: 'Booked' })).toBeVisible();
  await expect(card.getByText('You are booked')).toBeVisible();
  await tabBar(page).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('region', { name: 'Upcoming classes' }).getByText(title)).toBeVisible();
});

test('tapping Booked asks before cancelling, and cancelling frees the spot', async ({ page, request }, testInfo) => {
  const m = await openClasses(page, request, `classes cancel ${testInfo.project.name}`);
  const title = await bookFirst(page);
  const card = page.getByRole('listitem').filter({ hasText: title }).first();
  await card.getByRole('button', { name: 'Booked' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
  await expect(dialog).toContainText(title);
  await dialog.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(card.getByRole('button', { name: /^Book / })).toBeVisible();
  expect((await (await request.get('/api/bookings/my?scope=upcoming', { headers: auth(m.token) })).json()).data).toHaveLength(0);
});

test('classes outside the plan say "Not in plan" and offer no Book button', async ({ page, request }, testInfo) => {
  await openClasses(page, request, `classes plan ${testInfo.project.name}`);
  for (let i = 0; i < (await chips(page).count()); i++) {
    await openDay(page, i);
    const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Not in plan' }) }).first();
    if (!(await card.count())) continue;
    await expect(card.getByRole('button', { name: 'Not in plan' })).toBeDisabled();
    await expect(card).toContainText("Your plan doesn't include Zumba & Cardio");
    await expect(card.getByRole('button', { name: /^Book / })).toHaveCount(0);
    return;
  }
  throw new Error('no Zumba & Cardio class on the open days');
});

test('full and started classes cannot be booked', async ({ page, request }, testInfo) => {
  type Cls = { occurrence_date: string; start_time: string } & Record<string, unknown>;
  await page.route(/\/api\/classes\?/, async route => {
    const response = await route.fetch();
    const body = await response.json();
    const byDay = new Map<string, Cls[]>();
    for (const c of body.data as Cls[]) byDay.set(c.occurrence_date, [...(byDay.get(c.occurrence_date) ?? []), c]);
    for (const day of byDay.values()) {
      const [first, second] = day.sort((a, b) => a.start_time.localeCompare(b.start_time));
      Object.assign(first, { is_full: true, spots_left: 0, my_booking_id: null, category: 'Workout & Strength', starts_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (second) Object.assign(second, { my_booking_id: null, starts_at: new Date(Date.now() - 60_000).toISOString() });
    }
    await route.fulfill({ response, json: body });
  });
  await openClasses(page, request, `classes full ${testInfo.project.name}`);
  const cards = page.getByRole('list', { name: /^Classes on / }).getByRole('listitem');
  await expect(cards.nth(0).getByRole('button', { name: 'Full' })).toBeDisabled();
  await expect(cards.nth(0)).toContainText('Class full');
  await expect(cards.nth(1).getByRole('button', { name: 'Started' })).toBeDisabled();
});

test("a frozen member who taps Book sees the server's reason", async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `classes frozen ${testInfo.project.name}`);
  expect((await request.post('/api/membership/freeze', { headers: auth(m.token) })).ok()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/schedule');
  await expect(chips(page).first()).toBeVisible();
  const answer = page.waitForResponse(r => r.url().endsWith('/api/bookings') && r.request().method() === 'POST');
  await bookFirst(page);
  const { error } = await (await answer).json();
  await expect(page.getByText(error)).toBeVisible();
});

test("Full timetable opens today's timetable page with a Back arrow", async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Full timetable' }).click();
  await expect(page).toHaveURL(/\/schedule\?view=full$/);
  await expect(page.getByRole('heading', { level: 1, name: /book a class/i })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('group', { name: 'Day' })).toBeVisible();
});
