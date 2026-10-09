import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { signInAs, trackConsoleErrors } from './helpers';

// Coach portal fixes: admins open any coach's dashboard, every booked session of the last 14 days
// can be opened, the roster keeps its booked count and unlocks itself (also after the computer
// sleeps), shared notes do not stick.
// Nothing here depends on the hour: sessions come from the API, and what a test changes it undoes.

interface RecentSession {
  class_id: string;
  class_title: string;
  date: string;
  booked: number;
  unmarked: number;
}

interface Upcoming {
  id: string;
  title: string;
  occurrence_date: string;
  starts_at: string;
  booked_count: number;
}

interface Dashboard {
  upcoming: Upcoming[];
  recent_sessions: RecentSession[];
}

interface RosterEntry {
  booking_id: string;
  user_name: string;
  status: string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function dashboard(request: APIRequestContext, token: string, trainerId?: string): Promise<Dashboard> {
  const res = await request.get(`/api/trainer/me${trainerId ? `?trainer_id=${trainerId}` : ''}`, { headers: auth(token) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data as Dashboard;
}

async function roster(request: APIRequestContext, token: string, classId: string, date: string): Promise<RosterEntry[]> {
  const res = await request.get(`/api/bookings/class/${classId}/roster?date=${date}`, { headers: auth(token) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.attendees as RosterEntry[];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The "Last 14 days" rows render in the API's order (newest first), so row i is recent_sessions[i].
 * The button's accessible name starts with its visible text (WCAG 2.5.3, label in name).
 */
async function openRecentSession(page: Page, index: number, session: RecentSession) {
  const rows = page.getByRole('region', { name: 'Last 14 days' }).getByRole('listitem');
  const action = session.unmarked > 0 ? 'Take attendance' : 'Review attendance';
  const button = rows.nth(index).getByRole('button', { name: new RegExp(`^${action}: ${escapeRegExp(session.class_title)} on `) });
  await expect(button).toContainText(action);
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('an admin opens the dashboard of a coach without a login and can take attendance there', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const token = await signInAs(page, request, 'admin');

  // The Dashboard button on Classes & coaches lands on that coach.
  await page.goto('/admin/classes');
  await page.getByRole('button', { name: "View Kavya Sen's dashboard" }).click();
  await expect(page).toHaveURL(/\/trainer\?trainer=trn_kavya$/);
  await expect(page.getByRole('heading', { level: 1, name: "Kavya Sen's dashboard" })).toBeVisible();

  const kavya = await dashboard(request, token, 'trn_kavya');
  expect(kavya.recent_sessions.length, 'Kavya has booked sessions in the last 14 days').toBeGreaterThan(0);
  const rows = page.getByRole('region', { name: 'Last 14 days' }).getByRole('listitem');
  await expect(rows).toHaveCount(kavya.recent_sessions.length);

  // The roster opens with attendance unlocked (the session has started), and the admin marks it.
  const first = kavya.recent_sessions[0];
  const entry = (await roster(request, token, first.class_id, first.date)).find(a => a.status !== 'no_show');
  expect(entry, 'a booking on Kavya’s latest session that is not a no-show yet').toBeTruthy();
  const dialog = await openRecentSession(page, 0, first);
  await expect(dialog.getByRole('group', { name: /^Attendance for / })).toHaveCount(first.booked);
  const group = dialog.getByRole('group', { name: `Attendance for ${entry!.user_name}` });
  try {
    await group.getByRole('button', { name: 'No-show' }).click();
    await expect(group.getByRole('button', { name: 'No-show' })).toHaveAttribute('aria-pressed', 'true');
    expect((await roster(request, token, first.class_id, first.date)).find(a => a.booking_id === entry!.booking_id)?.status).toBe('no_show');
  } finally {
    // Put the booking back as it was for the other tests.
    await request.patch(`/api/bookings/${entry!.booking_id}/attendance`, { headers: auth(token), data: { status: entry!.status } });
  }
  await dialog.getByRole('button', { name: 'Close dialog' }).first().click();

  // The coach switcher keeps the choice in the address.
  await page.getByLabel('Coach', { exact: true }).selectOption('trn_simran');
  await expect(page).toHaveURL(/\/trainer\?trainer=trn_simran$/);
  await expect(page.getByRole('heading', { level: 1, name: "Simran Kaur's dashboard" })).toBeVisible();

  // Without a coach in the address, the admin chooses one.
  await page.goto('/trainer');
  await expect(page.getByRole('heading', { level: 1, name: 'Coach dashboards' })).toBeVisible();
  await page.getByRole('button', { name: "View Karan Joshi's dashboard" }).click();
  await expect(page).toHaveURL(/\/trainer\?trainer=trn_rohan$/);
  await expect(page.getByRole('heading', { level: 1, name: "Karan Joshi's dashboard" })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a coach can open any booked session of the last 14 days, not only last week’s', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const token = await signInAs(page, request, 'trainer');
  const { recent_sessions: sessions } = await dashboard(request, token);
  expect(sessions.length, 'Coach Vikram has booked sessions in the last 14 days').toBeGreaterThan(0);

  await page.goto('/trainer');
  const rows = page.getByRole('region', { name: 'Last 14 days' }).getByRole('listitem');
  await expect(rows).toHaveCount(sessions.length);

  // The oldest one listed.
  const oldest = sessions[sessions.length - 1];
  const dialog = await openRecentSession(page, sessions.length - 1, oldest);
  await expect(dialog.getByRole('heading', { name: `${oldest.class_title} roster` })).toBeVisible();
  await expect(dialog.getByRole('group', { name: /^Attendance for / })).toHaveCount(oldest.booked);
  await expect(dialog.getByRole('button', { name: 'Attended' }).first()).toBeEnabled();
  expect(errors).toEqual([]);
});

test('marking a no-show does not lower the booked count on the roster', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const token = await signInAs(page, request, 'trainer');
  const { recent_sessions: sessions } = await dashboard(request, token);

  // A started session with someone marked attended, to mark as a no-show and back.
  let pick: { index: number; session: RecentSession; entry: RosterEntry } | null = null;
  for (const [index, session] of sessions.entries()) {
    const entry = (await roster(request, token, session.class_id, session.date)).find(a => a.status === 'attended');
    if (entry) {
      pick = { index, session, entry };
      break;
    }
  }
  expect(pick, 'a recent session with an attended booking').toBeTruthy();
  const { index, session, entry } = pick!;

  await page.goto('/trainer');
  const dialog = await openRecentSession(page, index, session);
  const summary = dialog.locator('p', { hasText: 'not marked' }).first();
  await expect(summary).toContainText(`${session.booked} booked`);

  const group = dialog.getByRole('group', { name: `Attendance for ${entry.user_name}` });
  try {
    await group.getByRole('button', { name: 'No-show' }).click();
    await expect(group.getByRole('button', { name: 'No-show' })).toHaveAttribute('aria-pressed', 'true');
    await expect(summary).toContainText(`${session.booked} booked`);
    await expect(dialog.getByRole('group', { name: /^Attendance for / })).toHaveCount(session.booked);
  } finally {
    // Put the booking back as it was for the other tests.
    await request.patch(`/api/bookings/${entry.booking_id}/attendance`, { headers: auth(token), data: { status: 'attended' } });
  }
  expect(errors).toEqual([]);
});

const OPENS_BEFORE = 15 * 60_000;

/**
 * Opens, on a page whose clock can be moved, the roster of an upcoming session whose attendance
 * window is still at least five minutes away (whatever the hour). The roster needs someone on it to
 * show the buttons: when nobody has booked one of these yet, the all-access member books the first,
 * and cleanup() cancels it.
 */
async function openClosedRoster(page: Page, request: APIRequestContext) {
  const token = await signInAs(page, request, 'trainer');
  const { upcoming } = await dashboard(request, token);
  const closed = upcoming.filter(o => Date.parse(o.starts_at) - OPENS_BEFORE > Date.now() + 5 * 60_000);
  expect(closed.length, 'an upcoming session whose attendance window is still closed').toBeGreaterThan(0);

  let occurrence = closed.find(o => o.booked_count > 0);
  let added: { id: string; token: string } | null = null;
  if (!occurrence) {
    occurrence = closed[0];
    const vip = (await (await request.post('/api/auth/demo-login', { data: { role: 'vip' } })).json()).data.token as string;
    const booked = await request.post('/api/bookings', { headers: auth(vip), data: { class_id: occurrence.id, booking_date: occurrence.occurrence_date } });
    expect(booked.status(), 'the all-access member books the session').toBe(201);
    added = { id: (await booked.json()).data.id, token: vip };
  }
  const cleanup = async () => {
    if (added) await request.delete(`/api/bookings/${added.id}`, { headers: auth(added.token) });
  };
  const index = upcoming.indexOf(occurrence);

  try {
    // Page time runs from now and can be moved on; the server keeps real time.
    await page.clock.install({ time: new Date() });
    await page.goto('/trainer');
    await page
      .getByRole('region', { name: 'Next 7 days' })
      .getByRole('listitem')
      .nth(index)
      .getByRole('button', { name: new RegExp(`^Open roster: ${escapeRegExp(occurrence.title)} on `) })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: `${occurrence.title} roster` })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Attended' }).first()).toBeDisabled();
    await expect(dialog.getByText(/Attendance opens at/)).toBeVisible();
    return { dialog, opensAt: Date.parse(occurrence.starts_at) - OPENS_BEFORE, startsAt: Date.parse(occurrence.starts_at), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

test('the roster unlocks attendance by itself when the window opens', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const { dialog, opensAt, startsAt, cleanup } = await openClosedRoster(page, request);
  try {
    const attended = dialog.getByRole('button', { name: 'Attended' }).first();
    const summary = dialog.locator('p', { hasText: 'not marked' }).first();
    await expect(summary).toHaveText(/^\d+\/\d+ booked ·/);

    // Move the page past the opening time with the roster still open: no reload, no reopening.
    await page.clock.fastForward(opensAt - (await page.evaluate(() => Date.now())) + 2_000);
    await expect(attended).toBeEnabled();
    await expect(dialog.getByText(/Attendance opens at/)).toHaveCount(0);
    await expect(summary).toHaveText(/^\d+\/\d+ booked ·/);

    // Once the class starts, the capacity leaves the header by itself too.
    await page.clock.fastForward(startsAt - (await page.evaluate(() => Date.now())) + 2_000);
    await expect(summary).toHaveText(/^\d+ booked ·/);
    await expect(attended).toBeEnabled();
  } finally {
    await cleanup();
  }
  expect(errors).toEqual([]);
});

test('after the computer sleeps through the opening time, the roster catches up on waking', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const { dialog, opensAt, cleanup } = await openClosedRoster(page, request);
  try {
    const attended = dialog.getByRole('button', { name: 'Attended' }).first();

    // A sleep: the wall clock jumps past the opening time, but no timer fires meanwhile.
    await page.clock.setSystemTime(opensAt + 2_000);
    // Waking up shows the page again: the roster catches up at once.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(attended).toBeEnabled();
    await expect(dialog.getByText(/Attendance opens at/)).toHaveCount(0);
  } finally {
    await cleanup();
  }
  expect(errors).toEqual([]);
});

test('after a sleep with no wake-up event, the roster catches up within a minute', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const { dialog, opensAt, cleanup } = await openClosedRoster(page, request);
  try {
    const attended = dialog.getByRole('button', { name: 'Attended' }).first();

    // The wall clock jumps past the opening time while timers stand still; then one minute passes.
    await page.clock.setSystemTime(opensAt + 2_000);
    await page.clock.runFor(61_000);
    await expect(attended).toBeEnabled();
    await expect(dialog.getByText(/Attendance opens at/)).toHaveCount(0);
  } finally {
    await cleanup();
  }
  expect(errors).toEqual([]);
});

test('after saving a shared note, the next note starts private', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const token = await signInAs(page, request, 'trainer');
  const text = `Shared note check ${Date.now()}`;

  await page.goto('/trainer');
  await page.getByRole('tab', { name: 'Notes' }).click();
  const client = page.getByLabel('Client');
  const firstClient = await client.locator('option').nth(1).getAttribute('value');
  await client.selectOption(firstClient!);
  await page.getByLabel('Note', { exact: true }).fill(text);
  const shared = page.getByRole('checkbox', { name: /Let the member see this note/ });
  await shared.check();

  try {
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('');
    await expect(shared).not.toBeChecked();
  } finally {
    const notes = (await (await request.get('/api/trainer/notes', { headers: auth(token) })).json()).data as Array<{ id: string; note: string }>;
    for (const n of notes.filter(n => n.note === text)) await request.delete(`/api/trainer/notes/${n.id}`, { headers: auth(token) });
  }
  expect(errors).toEqual([]);
});

test('notes about an earlier client can still be shown on their own', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const admin = (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token as string;
  const token = await signInAs(page, request, 'trainer');
  const stamp = Date.now();
  const name = `Earlier Client ${stamp}`;
  const text = `Earlier client note ${stamp}`;

  // A new all-access member books one of the coach's sessions, gets a note, then cancels: they are
  // no longer a client. Deleting the member afterwards removes the booking and the note too.
  const created = await request.post('/api/members', {
    headers: auth(admin),
    data: { name, email: `earlier.client.${stamp}@example.com`, membership_tier: 'vip', expiry_months: 1 }
  });
  expect(created.status(), 'the admin adds a member').toBe(201);
  const { member, tempPassword } = (await created.json()).data as { member: { id: string; email: string }; tempPassword: string };
  try {
    const login = await request.post('/api/auth/login', { data: { email: member.email, password: tempPassword } });
    const memberToken = (await login.json()).data.token as string;
    const { upcoming } = await dashboard(request, token);
    let bookingId: string | null = null;
    for (const o of upcoming.filter(o => Date.parse(o.starts_at) > Date.now() + 10 * 60_000)) {
      const booked = await request.post('/api/bookings', { headers: auth(memberToken), data: { class_id: o.id, booking_date: o.occurrence_date } });
      if (booked.status() === 201) {
        bookingId = (await booked.json()).data.id;
        break;
      }
    }
    expect(bookingId, 'the new member books one of the coach’s sessions').toBeTruthy();
    const note = await request.post('/api/trainer/notes', { headers: auth(token), data: { member_id: member.id, category: 'progress', note: text, visible_to_member: false } });
    expect(note.status(), 'the coach writes a note about a client').toBe(201);
    expect((await request.delete(`/api/bookings/${bookingId}`, { headers: auth(memberToken) })).ok(), 'the member cancels').toBeTruthy();

    await page.goto('/trainer');
    await page.getByRole('tab', { name: 'Notes' }).click();
    // Not offered for a new note any more...
    await expect(page.getByLabel('Client').locator('option', { hasText: name })).toHaveCount(0);
    // ...but the notes about them can be shown on their own.
    const filter = page.getByLabel('Show notes about');
    await expect(filter.locator('optgroup[label="Earlier clients"] option', { hasText: name })).toHaveCount(1);
    await filter.selectOption({ label: name });
    const listed = page.getByRole('tabpanel').getByRole('listitem');
    await expect(listed).toHaveCount(1);
    await expect(listed.first()).toContainText(name);
    await expect(listed.first()).toContainText(text);
  } finally {
    await request.delete(`/api/members/${member.id}`, { headers: auth(admin) });
  }
  expect(errors).toEqual([]);
});
