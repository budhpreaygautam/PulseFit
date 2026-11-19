import { expect, type Page } from '@playwright/test';
import { auth, freshMember, signInAs, test, useAppMode, useSession } from './helpers';

// The app's Home tab: the member header, the streak card, quick actions, upcoming classes and the
// newest coach note, on real data.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

/** GET /auth/me answered by the server, with `patch` merged into data and the `drop` keys removed. */
async function mockMe(page: Page, patch: Record<string, unknown>, drop: string[] = []): Promise<void> {
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const data = { ...body.data, ...patch };
    for (const key of drop) delete data[key];
    await route.fulfill({ response, json: { ...body, data } });
  });
}

test('Home shows the header, streak, quick actions, upcoming classes and the newest coach note', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const get = async (path: string) => (await (await request.get(path, { headers: auth(token) })).json()).data;
  const [me, upcoming, notes] = [await get('/api/auth/me'), await get('/api/bookings/my?scope=upcoming'), await get('/api/notes/my')];
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: `Hi, ${me.name.split(' ')[0]}` })).toBeVisible();
  await expect(page.getByText(/^Valid through /)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Sessions this week' })).toContainText(String(me.streak_days));
  await expect(page.getByText("Sundays don't break it.", { exact: false })).toBeVisible();
  for (const b of upcoming.slice(0, 3)) await expect(page.getByRole('region', { name: 'Upcoming classes' }).getByText(b.class_title).first()).toBeVisible();
  if (notes.length) await expect(page.getByText(notes[0].note)).toBeVisible();
});

test('quick actions open Pass, Me and Train, and Timetable opens Classes', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  for (const [name, url] of [['Pass', /\/pass$/], ['ID card', /\/profile$/], ['Log workout', /\/log-workout$/], ['Timetable', /\/schedule$/]] as const) {
    await page.goto('/dashboard');
    await page.getByRole('main').getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
  }
});

test('a new member sees the empty upcoming line and no coach-note card', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `home new ${testInfo.project.name}`);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  await expect(page.getByText('No upcoming classes. Book a spot from the timetable.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Note from your coach' })).toHaveCount(0);
});

test('an expired member sees the Expired pill and the renew notice', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `home expired ${testInfo.project.name}`);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const put = await request.put(`/api/members/${m.id}`, { headers: auth(m.adminToken), data: { membership_status: 'expired', membership_expiry: yesterday } });
  expect(put.ok(), await put.text()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  await expect(page.getByText('Expired', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Renew membership' }).click();
  await expect(page).toHaveURL(/\/pricing/);
});

test('the streak card shows the real numbers from GET /auth/me', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/dashboard');
  await expect(page.getByText(`${me.active_days_this_week} of 5 sessions this week`)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Sessions this week' })).toHaveAttribute('aria-valuenow', String(Math.min(me.active_days_this_week, 5)));
  await expect(page.getByText(/beat your best/)).toHaveCount(me.longest_streak_days > me.streak_days ? 1 : 0);
});

test('the streak card follows the numbers GET /auth/me gives', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  const ring = page.getByRole('progressbar', { name: 'Sessions this week' });
  const cases = [
    { patch: { streak_days: 12, active_days_this_week: 4, longest_streak_days: 14 }, drop: [], now: '4', sessions: '4 of 5 sessions this week', best: '3 more days to beat your best.' },
    { patch: { streak_days: 12, active_days_this_week: 6, longest_streak_days: 12 }, drop: [], now: '5', sessions: '6 of 5 sessions this week', best: null },
    { patch: { streak_days: 0, active_days_this_week: 0, longest_streak_days: 1 }, drop: [], now: '0', sessions: '0 of 5 sessions this week', best: '2 more days to beat your best.' },
    { patch: {}, drop: ['active_days_this_week', 'longest_streak_days'], now: '0', sessions: null, best: null }
  ];
  for (const c of cases) {
    await page.unrouteAll();
    await mockMe(page, c.patch, c.drop);
    await page.goto('/dashboard');
    await expect(ring).toHaveAttribute('aria-valuenow', c.now);
    if (c.sessions) await expect(page.getByText(c.sessions)).toBeVisible();
    else await expect(page.getByText(/of 5 sessions/)).toHaveCount(0);
    if (c.best) await expect(page.getByText(c.best, { exact: false })).toBeVisible();
    else await expect(page.getByText(/beat your best/)).toHaveCount(0);
  }
});
