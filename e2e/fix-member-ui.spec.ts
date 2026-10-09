import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { signInAs } from './helpers';

// Regression checks for the member-facing fixes: freezing, the rest and floor timers, the
// workout logger, the check-in pass, the free-trial days, the timetable, pricing, sign-in and
// password reset. Tests that change data use their own throwaway accounts and remove them.

interface Occurrence {
  id: string;
  title: string;
  category: string;
  day_of_week: number;
  occurrence_date: string;
  starts_at: string;
  is_full: boolean;
  my_booking_id: string | null;
  [key: string]: unknown;
}

interface TestUser {
  id: string;
  email: string;
  token: string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const gymToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/demo-login', { data: { role: 'admin' } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.token;
}

/** A fresh account made by the admin, signed in with its temporary password. */
async function createUser(
  request: APIRequestContext,
  admin: string,
  opts: { role?: 'member' | 'trainer'; tier?: 'none' | 'basic' | 'pro' | 'vip'; months?: number } = {}
): Promise<TestUser> {
  const email = `lane-ui-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await request.post('/api/members', {
    headers: auth(admin),
    data: { name: 'Lane Tester', email, role: opts.role ?? 'member', membership_tier: opts.tier ?? 'none', expiry_months: opts.months ?? 0 }
  });
  expect(res.status(), await res.text()).toBe(201);
  const { member, tempPassword } = (await res.json()).data;
  const login = await request.post('/api/auth/login', { data: { email, password: tempPassword } });
  expect(login.ok()).toBeTruthy();
  return { id: member.id, email, token: (await login.json()).data.token };
}

const deleteUser = (request: APIRequestContext, admin: string, id: string) => request.delete(`/api/members/${id}`, { headers: auth(admin) });

const useToken = (page: Page, token: string) => page.addInitScript(t => window.localStorage.setItem('pulsefit_token', t), token);

/** Classes this week and next that can still be booked (an hour or more away, inside the 14-day window, not full). */
async function bookableClasses(request: APIRequestContext, token?: string): Promise<Occurrence[]> {
  const today = gymToday();
  const all: Occurrence[] = [];
  for (const week of [mondayOf(today), mondayOf(addDays(today, 7))]) {
    const res = await request.get(`/api/classes?week_start=${week}`, { headers: token ? auth(token) : {} });
    all.push(...((await res.json()).data as Occurrence[]));
  }
  const soon = Date.now() + 60 * 60_000;
  const last = addDays(today, 14);
  return all
    .filter(c => Date.parse(c.starts_at) > soon && c.occurrence_date <= last && !c.is_full && !c.my_booking_id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
const scheduleUrl = (c: Occurrence) => `/schedule?week=${mondayOf(c.occurrence_date)}&day=${c.day_of_week}`;

/** The timetable card of one class. */
const cardOf = (page: Page, c: Occurrence) => page.locator('#day-panel li').filter({ has: page.getByRole('heading', { name: c.title, exact: true }) });

// ---------------------------------------------------------------------------------------------
// Membership freeze

test('freezing says how many bookings it cancels, and the toasts show what the server did', async ({ page, request }) => {
  const admin = await adminToken(request);
  const user = await createUser(request, admin, { tier: 'vip', months: 1 });
  try {
    const classes = await bookableClasses(request, user.token);
    for (const c of classes.slice(0, 2)) {
      const res = await request.post('/api/bookings', { headers: auth(user.token), data: { class_id: c.id, booking_date: c.occurrence_date } });
      expect(res.status()).toBe(201);
    }
    const upcoming = ((await (await request.get('/api/bookings/my', { headers: auth(user.token) })).json()).data as unknown[]).length;
    expect(upcoming).toBeGreaterThan(0);

    await useToken(page, user.token);
    await page.goto('/profile?tab=membership');
    await page.getByRole('button', { name: 'Freeze membership' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`Your ${upcoming} upcoming class ${upcoming === 1 ? 'booking' : 'bookings'} will be cancelled`);
    await expect(dialog).toContainText('clocked in on the gym floor, that session will be ended');
    await expect(dialog).toContainText('Sundays are not counted');
    await expect(dialog).not.toContainText('Nothing is lost');

    const frozen = page.waitForResponse(r => r.url().endsWith('/api/membership/freeze'));
    await dialog.getByRole('button', { name: 'Freeze membership' }).click();
    const freezeMessage = (await (await frozen).json()).message as string;
    expect(freezeMessage).toContain(String(upcoming));
    await expect(page.locator('.toast-message', { hasText: freezeMessage })).toBeVisible();
    expect(((await (await request.get('/api/bookings/my', { headers: auth(user.token) })).json()).data as unknown[]).length).toBe(0);

    await page.getByRole('button', { name: 'Unfreeze membership' }).click();
    const unfrozen = page.waitForResponse(r => r.url().endsWith('/api/membership/unfreeze'));
    await page.getByRole('dialog').getByRole('button', { name: 'Unfreeze' }).click();
    const unfreezeMessage = (await (await unfrozen).json()).message as string;
    expect(unfreezeMessage).toBeTruthy();
    await expect(page.locator('.toast-message', { hasText: unfreezeMessage })).toBeVisible();
  } finally {
    await deleteUser(request, admin, user.id);
  }
});

// ---------------------------------------------------------------------------------------------
// Workout logger

test('the rest timer counts wall-clock time, so a locked phone does not slow it down', async ({ page, request }) => {
  await page.clock.install();
  await signInAs(page, request, 'member');
  await page.goto('/log-workout');
  await page.getByRole('group', { name: 'Rest length' }).getByRole('button', { name: '90s' }).click();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText(/^1:(29|30)$/);
  // fastForward fires each due timer once, as a phone does when it wakes after the screen was locked.
  await page.clock.fastForward(60_000);
  await expect(timer).toHaveText(/^0:(29|30)$/);
});

async function fillOneSet(page: Page, title: string) {
  await page.locator('#wk-title').fill(title);
  await page.locator('#wk-duration').fill('30');
  await expect(page.locator('#wk-exercise')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  await page.locator('input[id$="-w"]').first().fill('20');
  await page.locator('input[id$="-r"]').first().fill('10');
}

test('the "Some fields need fixing" banner goes once the fields are fixed', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/log-workout');
  const banner = page.getByText('Some fields need fixing before the workout can be saved.');
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(banner).toBeVisible();
  await fillOneSet(page, 'Banner check');
  await expect(banner).toBeHidden();
});

test('"See my progress" is offered to members only, and opens their dashboard', async ({ page, request }) => {
  const admin = await adminToken(request);
  const coach = await createUser(request, admin, { role: 'trainer' });
  const member = await createUser(request, admin, { tier: 'pro', months: 1 });
  try {
    await useToken(page, coach.token);
    await page.goto('/log-workout');
    await fillOneSet(page, 'Coach session');
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page.getByRole('heading', { name: /Saved: Coach session/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'See my progress' })).toHaveCount(0);

    const memberPage = await page.context().newPage();
    await memberPage.addInitScript(t => window.localStorage.setItem('pulsefit_token', t), member.token);
    await memberPage.goto('/log-workout');
    await fillOneSet(memberPage, 'Member session');
    await memberPage.getByRole('button', { name: 'Save workout' }).click();
    await memberPage.getByRole('button', { name: 'See my progress' }).click();
    await expect(memberPage).toHaveURL(/\/dashboard$/);
    await expect(memberPage.getByText("This page isn't for your account")).toHaveCount(0);
  } finally {
    await deleteUser(request, admin, coach.id);
    await deleteUser(request, admin, member.id);
  }
});

// ---------------------------------------------------------------------------------------------
// Check-in pass

test('the check-in pass does not warn staff that the front desk will refuse them', async ({ page, request }) => {
  const admin = await adminToken(request);
  const coach = await createUser(request, admin, { role: 'trainer' });
  const member = await createUser(request, admin);
  try {
    await useToken(page, coach.token);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Check-in pass', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Staff pass');
    await expect(dialog).not.toContainText('front desk will not let this pass in');

    // A member without a plan is still warned.
    const memberPage = await page.context().newPage();
    await memberPage.addInitScript(t => window.localStorage.setItem('pulsefit_token', t), member.token);
    await memberPage.goto('/profile');
    await memberPage.getByRole('button', { name: 'Check-in pass', exact: true }).click();
    await expect(memberPage.getByRole('dialog')).toContainText('front desk will not let this pass in');
  } finally {
    await deleteUser(request, admin, coach.id);
    await deleteUser(request, admin, member.id);
  }
});

test('a coach whose own plan has ended still sees a working staff pass', async ({ page, request }) => {
  const admin = await adminToken(request);
  const coach = await createUser(request, admin, { role: 'trainer', tier: 'pro', months: 1 });
  try {
    // The coach's own plan ended three days ago; the front desk still lets staff in.
    const ended = addDays(gymToday(), -3);
    const res = await request.put(`/api/members/${coach.id}`, { headers: auth(admin), data: { membership_status: 'expired', membership_expiry: ended } });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect((await res.json()).data.membership_status).toBe('expired');

    await useToken(page, coach.token);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Check-in pass', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Staff pass: no membership is needed to check in.');
    await expect(dialog).toContainText('Coach · staff pass');
    await expect(dialog).toContainText('Your own Zumba & Cardio Pass ended on');
    await expect(dialog).not.toContainText('Valid through');
    await expect(dialog).not.toContainText('Expired');
    await expect(dialog).not.toContainText('front desk will not let this pass in');
  } finally {
    await deleteUser(request, admin, coach.id);
  }
});

// ---------------------------------------------------------------------------------------------
// Floor clock

function statsWith(activeSession: object | null, recentSessions: object[] = []) {
  return {
    success: true,
    data: { activeSession, totalTimeMinutesThisWeek: 0, totalTimeMinutesThisMonth: 0, totalSessionsCompleted: recentSessions.length, recentSessions }
  };
}

const openSession = (clockIn: number, durationMinutes: number) => ({
  id: 'tms_e2e',
  user_id: 'usr_e2e',
  user_name: 'Lane Tester',
  user_tier: 'pro',
  category: 'Zumba & Cardio',
  clock_in_time: new Date(clockIn).toISOString(),
  clock_out_time: null,
  duration_minutes: durationMinutes,
  status: 'active'
});

test('the floor timer stops at the 4-hour auto-close and then shows the closed session', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  let calls = 0;
  let clockIn = 0;
  await page.route('**/api/time-tracking/my-stats', async route => {
    calls++;
    // 3 h 59 min 54 s ago: the server rounds that to 240 minutes.
    if (calls === 1) clockIn = Date.now() - (4 * 60 * 60 - 6) * 1000;
    if (calls === 1) return route.fulfill({ json: statsWith(openSession(clockIn, 240)) });
    // The server has closed it at clock-in + 4 h; answer slowly so the capped card can be seen.
    await new Promise(resolve => setTimeout(resolve, 2500));
    const closed = { ...openSession(clockIn, 240), status: 'completed', clock_out_time: new Date(clockIn + 4 * 3600_000).toISOString(), auto_closed: true };
    return route.fulfill({ json: statsWith(null, [closed]) });
  });
  await page.goto('/dashboard');
  const timer = page.getByTestId('floor-timer');
  await expect(timer).toHaveText(/^03:59:5\d$/);
  await expect(timer).toHaveText('04:00:00', { timeout: 10_000 });
  await expect(page.getByText(/^Closed automatically/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clock out' })).toHaveCount(0);
  // It stays at 4 hours, then the refreshed stats show the session as closed.
  await expect(page.getByText(/· closed automatically/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Clock in/ })).toBeVisible();
  await expect(timer).toHaveCount(0);
  expect(calls).toBeGreaterThanOrEqual(2);
});

test('the floor timer keeps checking until the server has closed the session', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  // The server's clock is 20 s behind the device's, so the card reaches 4 hours before the
  // server closes the session: the first reload still finds it open.
  const serverSkew = -20_000;
  let calls = 0;
  let clockIn = 0;
  await page.route('**/api/time-tracking/my-stats', async route => {
    calls++;
    const serverNow = Date.now() + serverSkew;
    // 3 h 59 min 52 s old by the server's clock on the first call.
    if (calls === 1) clockIn = serverNow - (4 * 60 * 60 - 8) * 1000;
    const elapsed = serverNow - clockIn;
    if (elapsed < 4 * 3600_000) return route.fulfill({ json: statsWith(openSession(clockIn, Math.round(elapsed / 60_000))) });
    const closed = { ...openSession(clockIn, 240), status: 'completed', clock_out_time: new Date(clockIn + 4 * 3600_000).toISOString(), auto_closed: true };
    return route.fulfill({ json: statsWith(null, [closed]) });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('floor-timer')).toHaveText('04:00:00', { timeout: 10_000 });
  await expect(page.getByText(/^Closed automatically/)).toBeVisible();
  await expect.poll(() => calls, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  // A later reload, once the server has closed it, shows the closed session.
  await expect(page.getByText(/· closed automatically/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('button', { name: /Clock in/ })).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(3);
});

test('the floor timer follows the server clock when the device clock is wrong', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  // The device is 5 minutes slow: by its clock the session starts in the future.
  let session = openSession(Date.now() + 5 * 60_000, 0);
  await page.route('**/api/time-tracking/my-stats', route => route.fulfill({ json: statsWith(session) }));
  await page.goto('/dashboard');
  await expect(page.getByTestId('floor-timer')).toHaveText(/^00:00:0[1-9]$/);

  // The device is 10 minutes slow on a session the server says is 20 minutes old.
  session = openSession(Date.now() - 10 * 60_000, 20);
  await page.reload();
  await expect(page.getByTestId('floor-timer')).toHaveText(/^00:(19|20):\d\d$/);
});

// ---------------------------------------------------------------------------------------------
// Free trial

async function trialDays(page: Page, enforced: boolean | null, instant: string) {
  if (enforced !== null) {
    await page.route('**/api/config', async route => {
      const response = await route.fetch();
      const json = await response.json();
      json.data.gym.hours.enforced = enforced;
      await route.fulfill({ response, json });
    });
  }
  await page.clock.setFixedTime(new Date(instant));
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Claim a free pass' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[name="trial-date"]').first()).toBeAttached();
  return dialog;
}

test('the free-trial dialog does not offer today once the gym has closed', async ({ page }) => {
  // Thursday 8 Oct 2026, 10:30 pm IST.
  const dialog = await trialDays(page, true, '2026-10-08T17:00:00Z');
  await expect(dialog.locator('input[name="trial-date"]').first()).toBeDisabled();
  await expect(dialog.locator('input[name="trial-date"]').nth(1)).toBeEnabled();
  await expect(dialog).toContainText('Today is not available: the gym closed at 10:00 pm');
});

test('the free-trial dialog offers today while the gym is still open', async ({ page }) => {
  // Thursday 8 Oct 2026, 3:30 pm IST.
  const dialog = await trialDays(page, true, '2026-10-08T10:00:00Z');
  await expect(dialog.locator('input[name="trial-date"]').first()).toBeEnabled();
  await expect(dialog).not.toContainText('Today is not available');
});

test('the free-trial dialog keeps today when the server does not enforce opening hours', async ({ page }) => {
  const dialog = await trialDays(page, false, '2026-10-08T17:00:00Z');
  await expect(dialog.locator('input[name="trial-date"]').first()).toBeEnabled();
});

// ---------------------------------------------------------------------------------------------
// Timetable

test('a class the timetable lists on a Sunday is shown, and an empty Sunday says closed', async ({ page }) => {
  const week = mondayOf(addDays(gymToday(), 7));
  const sunday = addDays(week, 6);
  let inject = true;
  await page.route('**/api/classes?*', async route => {
    const response = await route.fetch();
    const json = await response.json();
    const classes = json.data as Occurrence[];
    if (inject && classes.length > 0 && route.request().url().includes(`week_start=${week}`)) {
      classes.push({ ...classes[0], id: 'cls_e2e_sunday', title: 'Sunday Probe Class', day_of_week: 0, occurrence_date: sunday, starts_at: `${sunday}T04:30:00.000Z`, my_booking_id: null });
    }
    await route.fulfill({ response, json });
  });

  await page.goto(`/schedule?week=${week}&day=0`);
  await expect(page.getByRole('heading', { name: 'Sunday Probe Class' })).toBeVisible();
  await expect(page.locator(`#day-${sunday}`)).not.toHaveAttribute('aria-label', /: closed/);
  await expect(page.getByRole('heading', { name: 'Closed on Sundays' })).toHaveCount(0);

  inject = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Closed on Sundays' })).toBeVisible();
  await expect(page.locator(`#day-${sunday}`)).toHaveAttribute('aria-label', /: closed/);
});

test('with a coach filter on, a closed day is not called closed when other coaches teach then', async ({ page, request }) => {
  const week = mondayOf(addDays(gymToday(), 7));
  const sunday = addDays(week, 6);
  const trainers = (await (await request.get('/api/trainers')).json()).data as { id: string }[];
  expect(trainers.length).toBeGreaterThanOrEqual(2);
  // The first coach teaches on that Sunday; the filter shows the second coach only.
  const [teaching, filtered] = trainers;
  await page.route('**/api/classes?*', async route => {
    const response = await route.fetch();
    const json = await response.json();
    const url = new URL(route.request().url());
    const classes = json.data as Occurrence[];
    if (!url.searchParams.has('trainerId') && url.searchParams.get('week_start') === week && classes.length > 0) {
      classes.push({ ...classes[0], id: 'cls_e2e_sunday_other', title: 'Sunday Other Coach Class', trainer_id: teaching.id, day_of_week: 0, occurrence_date: sunday, starts_at: `${sunday}T04:30:00.000Z`, my_booking_id: null });
    }
    await route.fulfill({ response, json });
  });

  await page.goto(`/schedule?week=${week}&day=0&trainer=${filtered.id}`);
  await expect(page.getByText('No classes match your filters on this day')).toBeVisible();
  await expect(page.locator(`#day-${sunday}`)).not.toHaveAttribute('aria-label', /: closed/);
  await expect(page.getByRole('heading', { name: /^Closed on/ })).toHaveCount(0);

  // Without the filter the Sunday class is listed.
  await page.goto(`/schedule?week=${week}&day=0`);
  await expect(page.getByRole('heading', { name: 'Sunday Other Coach Class' })).toBeVisible();
});

test('classes outside the member plan show "Not in your plan" with an upgrade link', async ({ page, request }) => {
  const token = await signInAs(page, request, 'member'); // Zumba & Cardio pass
  const strength = (await bookableClasses(request, token)).find(c => c.category === 'Workout & Strength');
  expect(strength, 'a Workout & Strength class on the timetable').toBeTruthy();
  await page.goto(scheduleUrl(strength!));
  const card = cardOf(page, strength!);
  await expect(card.getByRole('button', { name: /Not in your plan/ })).toBeDisabled();
  await expect(card.getByRole('button', { name: /Book this class/ })).toHaveCount(0);
  await card.getByRole('button', { name: /Upgrade to the/ }).click();
  await expect(page).toHaveURL(/\/pricing\?plan=/);
});

test('after booking, the card goes straight to "Booked" while the timetable refreshes', async ({ page, request }) => {
  const admin = await adminToken(request);
  const user = await createUser(request, admin, { tier: 'pro', months: 1 });
  try {
    const zumba = (await bookableClasses(request, user.token)).find(c => c.category === 'Zumba & Cardio');
    expect(zumba, 'a bookable Zumba class').toBeTruthy();
    await useToken(page, user.token);
    await page.goto(scheduleUrl(zumba!));

    // Hold the timetable refresh that follows the booking.
    let booked = false;
    let refreshDelivered = false;
    await page.route('**/api/bookings', async route => {
      const response = await route.fetch();
      booked = response.ok();
      await route.fulfill({ response });
    });
    await page.route('**/api/classes?*', async route => {
      if (!booked) return route.continue();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
      refreshDelivered = true;
    });

    const card = cardOf(page, zumba!);
    await card.getByRole('button', { name: /Book this class/ }).click();
    await expect(page.locator('.toast-message', { hasText: zumba!.title })).toBeVisible();
    await expect(card.getByText('Booked', { exact: true })).toBeVisible();
    expect(refreshDelivered, 'checked while the refresh is still held back').toBe(false);
    expect(await card.getByRole('button', { name: /Book this class/ }).count()).toBe(0);
    await page.waitForTimeout(2500);
    await expect(card.getByText('Booked', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: /Book this class/ })).toHaveCount(0);
  } finally {
    await deleteUser(request, admin, user.id);
  }
});

test('booking past the membership end date explains it with a readable date and a renew button', async ({ page, request }) => {
  const admin = await adminToken(request);
  const user = await createUser(request, admin, { tier: 'pro', months: 1 });
  try {
    const today = gymToday();
    const res = await request.put(`/api/members/${user.id}`, { headers: auth(admin), data: { membership_expiry: today } });
    expect(res.ok(), await res.text()).toBeTruthy();
    const later = (await bookableClasses(request, user.token)).find(c => c.category === 'Zumba & Cardio' && c.occurrence_date > today);
    expect(later, 'a Zumba class after today').toBeTruthy();

    await useToken(page, user.token);
    await page.goto(scheduleUrl(later!));
    const card = cardOf(page, later!);
    await card.getByRole('button', { name: /Book this class/ }).click();
    const issue = card.getByRole('alert');
    await expect(issue).toContainText('Your membership ends on');
    await expect(issue).not.toContainText(/\d{4}-\d{2}-\d{2}/);
    await issue.getByRole('button', { name: 'Renew my plan' }).click();
    await expect(page).toHaveURL(/\/pricing\?plan=pro/);
  } finally {
    await deleteUser(request, admin, user.id);
  }
});

test('the month calendar and guide tabs work with the keyboard', async ({ page }) => {
  await page.goto('/schedule');
  const grid = page.getByRole('grid');
  // One Tab stop in the calendar: the selected day.
  await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
  const selected = grid.locator('[role="gridcell"][aria-selected="true"] button');
  const start = (await selected.getAttribute('id'))!.replace('day-', '');
  const cell = (date: string) => page.locator(`#day-${date}`);
  await selected.focus();
  // Arrows move a day or a week and select that day; the day's heading follows.
  await page.keyboard.press('ArrowRight');
  await expect(cell(addDays(start, 1))).toBeFocused();
  await expect(cell(addDays(start, 1))).toHaveAttribute('tabindex', '0');
  await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(cell(addDays(start, 8))).toBeFocused();
  // Home and End go to the ends of that week.
  await page.keyboard.press('Home');
  await expect(cell(mondayOf(addDays(start, 8)))).toBeFocused();
  await page.keyboard.press('End');
  await expect(cell(addDays(mondayOf(addDays(start, 8)), 6))).toBeFocused();
  // Days before today cannot be picked.
  await expect(cell(addDays(gymToday(), -1))).toHaveCount(monthOf(addDays(gymToday(), -1)) === monthOf(start) ? 1 : 0);
  if (monthOf(addDays(gymToday(), -1)) === monthOf(start)) await expect(cell(addDays(gymToday(), -1))).toBeDisabled();

  await page.goto('/guide');
  await page.locator('#guide-tab-workout-plans').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#guide-tab-diet-charts')).toBeFocused();
  await expect(page.locator('#guide-tab-diet-charts')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.locator('#guide-tab-supplements')).toBeFocused();
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
});

// ---------------------------------------------------------------------------------------------
// Pricing and payments

test('for a frozen member, pricing moves the end date by open days, stepping over Sundays', async ({ page, request }) => {
  await signInAs(page, request, 'member'); // Zumba & Cardio pass
  // Frozen for the last 10 days. Paying unfreezes first: the open days strictly between the
  // freeze and today are added to the end date as open days, so Sundays are stepped over.
  const today = gymToday();
  const frozenSince = addDays(today, -10);
  const expiry = addDays(today, 20);
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    const json = await response.json();
    Object.assign(json.data, { membership_status: 'frozen', frozen_since: frozenSince, membership_expiry: expiry });
    await route.fulfill({ response, json });
  });
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.payments = { enabled: true, keyId: 'rzp_test_e2e' };
    await route.fulfill({ response, json });
  });
  const isOpen = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;
  let openDays = 0;
  for (let d = addDays(frozenSince, 1); d < today; d = addDays(d, 1)) if (isOpen(d)) openDays++;
  let end = expiry;
  for (let i = 0; i < openDays; i++) {
    end = addDays(end, 1);
    while (!isOpen(end)) end = addDays(end, 1);
  }
  const readable = (date: string) =>
    new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

  await page.goto('/pricing');
  await expect(page.locator('#plan-pro-note')).toContainText(`The new period starts on ${readable(addDays(end, 1))}, the day after your current one ends.`);
});

test('the open pricing FAQ stays open on the same question when the plans arrive', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route('**/api/plans', async route => {
    await held;
    await route.continue();
  });
  await page.goto('/pricing');
  const fees = page.getByRole('button', { name: /Are there sign-up fees/ });
  await fees.click();
  await expect(fees).toHaveAttribute('aria-expanded', 'true');
  release();
  const classes = page.getByRole('button', { name: 'Which classes can I book with each plan?' });
  await expect(classes).toBeVisible();
  await expect(classes).toHaveAttribute('aria-expanded', 'false');
  await expect(fees).toHaveAttribute('aria-expanded', 'true');
});

const FAKE_RAZORPAY = `
window.Razorpay = function (options) { this.options = options; };
window.Razorpay.prototype.on = function () {};
window.Razorpay.prototype.open = function () {
  var o = this.options;
  setTimeout(function () { o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: 'pay_E2E123', razorpay_signature: 'sig' }); }, 0);
};`;

/** Pricing with online payments on and Razorpay faked: the first plan button pays, and verify answers `verify`. */
async function payWithFakeCheckout(page: Page, verify: { status: number; json: unknown }) {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.payments = { enabled: true, keyId: 'rzp_test_e2e' };
    await route.fulfill({ response, json });
  });
  await page.route('https://checkout.razorpay.com/**', route => route.fulfill({ contentType: 'application/javascript', body: FAKE_RAZORPAY }));
  await page.route('**/api/payment/create-order', route =>
    route.fulfill({
      json: {
        success: true,
        data: { orderId: 'order_E2E', amount: 79900, amount_inr: 799, currency: 'INR', keyId: 'rzp_test_e2e', tier: 'pro', billing_cycle: 'monthly', plan_name: 'Plan', description: 'Plan' }
      }
    })
  );
  await page.route('**/api/payment/verify', route => route.fulfill(verify));
  await page.goto('/pricing');
  await page.getByRole('button', { name: /·\s*₹/ }).first().click();
}

test('a rejected payment does not promise that the membership will be activated', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await payWithFakeCheckout(page, {
    status: 409,
    json: {
      success: false,
      error: 'Razorpay reported a payment that does not match this order, so it was not applied. Please contact the front desk.',
      code: 'ORDER_REJECTED'
    }
  });
  const alert = page.getByRole('alert').filter({ hasText: 'could not be applied' });
  await expect(alert).toContainText('nothing was activated');
  await expect(alert).toContainText('pay_E2E123');
  await expect(alert).toContainText('activate the plan you paid for or refund the money in full');
  await expect(alert).not.toContainText('activated automatically');
});

test('after a successful payment the member sees the server message, including cancelled bookings', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  // verify answers with a real session, so the page stays signed in afterwards.
  const login = await request.post('/api/auth/demo-login', { data: { role: 'member' } });
  const { token, user } = (await login.json()).data;
  // Worded as the server builds it (paymentMessage in paymentController.ts).
  const message =
    'Payment received. Your Zumba Pass is active until 9 Nov 2026. 2 upcoming class bookings were cancelled because your new plan does not include those classes.';
  await payWithFakeCheckout(page, {
    status: 200,
    json: { success: true, message, data: { token, user, payment: { id: 'pay_e2e', period_end: '2026-11-09' }, message, cancelled_bookings: 2 } }
  });
  // "Payment received" is the toast's title, and the body does not say it again.
  const toast = page.locator('.toast-message', { hasText: '2 upcoming class bookings were cancelled' });
  await expect(toast).toHaveText(/^Your Zumba Pass is active until 9 Nov 2026\./);
  await expect(page.locator('.toast-title', { hasText: 'Payment received' })).toBeVisible();
});

test('when the webhook applied the payment first, the member still hears what it did', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  const user = (await (await request.post('/api/auth/demo-login', { data: { role: 'member' } })).json()).data.user;
  const message =
    'Payment received. Your Zumba Pass is active until 9 Nov 2026. 1 upcoming class booking was cancelled because your new plan does not include that class.';
  await payWithFakeCheckout(page, {
    status: 409,
    json: { success: false, error: 'This payment has already been applied to your membership.', code: 'ALREADY_PROCESSED', data: { user, cancelled_bookings: 1, message } }
  });
  await expect(page.locator('.toast-message', { hasText: '1 upcoming class booking was cancelled' })).toBeVisible();
  await expect(page.locator('.toast-title', { hasText: 'Payment received' })).toBeVisible();
});

// ---------------------------------------------------------------------------------------------
// Sign-in and password reset

const pendingPlan = (page: Page) => page.evaluate(() => window.sessionStorage.getItem('pulsefit_pending_plan'));

test('a plan picked as a guest is dropped on a demo sign-in', async ({ page }) => {
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Create an account to join' }).first().click();
  expect(await pendingPlan(page)).not.toBeNull();
  await page.getByRole('dialog').getByRole('button', { name: /^Member/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await pendingPlan(page)).toBeNull();
});

test('a plan picked as a guest is dropped when the sign-in dialog is closed', async ({ page }) => {
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Create an account to join' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await pendingPlan(page)).not.toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await pendingPlan(page)).toBeNull();
});

test('a plan picked as a guest still leads back to pricing after signing in from that dialog', async ({ page }) => {
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Create an account to join' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.locator('#auth-email').fill('vip@pulsefit.com');
  await dialog.locator('#auth-password').fill('pulse123');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing\?plan=\w+&cycle=monthly/);
  await expect(page.locator('.toast-message', { hasText: 'Finish choosing your plan below.' })).toBeVisible();
});

test('the reset page shows the password rules and offers a new link when the link has expired', async ({ page }) => {
  await page.goto(`/reset-password?token=${'e2e0'.repeat(16)}`);
  await expect(page.getByText('8–72 characters, with at least one letter and one digit.')).toBeVisible();
  await expect(page.locator('#new-password')).toHaveAttribute('aria-describedby', 'new-password-hint');
  await page.locator('#new-password').fill('newpass123');
  await page.locator('#confirm-password').fill('newpass123');
  await page.getByRole('button', { name: 'Save password and sign in' }).click();
  await page.getByRole('button', { name: 'Request a new link' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset your password' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Get a reset link' })).toBeVisible();
});

test('the reset page without a link offers to request one', async ({ page }) => {
  await page.goto('/reset-password');
  await page.getByRole('button', { name: 'Request a new link' }).click();
  await expect(page.getByRole('dialog', { name: 'Reset your password' })).toBeVisible();
});
