import { test, expect, APIRequestContext } from '@playwright/test';
import { signInAs, trackConsoleErrors } from './helpers';

// The journeys that matter most, driven through the UI against the real API.

interface Occurrence {
  id: string;
  title: string;
  category: string;
  day_of_week: number;
  occurrence_date: string;
  starts_at: string;
  is_full: boolean;
  my_booking_id: string | null;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

async function bookableZumbaClass(request: APIRequestContext, token: string): Promise<Occurrence> {
  const res = await request.get('/api/classes', { headers: auth(token) });
  const classes = (await res.json()).data as Occurrence[];
  const soon = Date.now() + 60 * 60_000;
  const pick = classes.find(c => c.category === 'Zumba & Cardio' && !c.my_booking_id && !c.is_full && Date.parse(c.starts_at) > soon);
  expect(pick, 'a Zumba class the demo member can book').toBeTruthy();
  return pick!;
}

test('a member books a class from the timetable and cancels it from My bookings', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const token = await signInAs(page, request, 'member');
  const cls = await bookableZumbaClass(request, token);

  await page.goto(`/schedule?week=${mondayOf(cls.occurrence_date)}&day=${cls.day_of_week}`);
  await page.getByRole('button', { name: new RegExp(`Book this class.*${cls.title}`) }).click();
  await expect(page.getByText('Booked').first()).toBeVisible();

  const mine = await (await request.get('/api/bookings/my', { headers: auth(token) })).json();
  const booking = (mine.data as Array<{ id: string; class_id: string; booking_date: string }>).find(
    b => b.class_id === cls.id && b.booking_date === cls.occurrence_date
  );
  expect(booking, 'the booking exists on the server').toBeTruthy();

  await page.goto('/bookings');
  await page.getByRole('button', { name: new RegExp(`Cancel booking for ${cls.title}`) }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText('Booking cancelled').first()).toBeVisible();

  const after = await (await request.get('/api/bookings/my?scope=all', { headers: auth(token) })).json();
  expect((after.data as Array<{ id: string; status: string }>).find(b => b.id === booking!.id)?.status).toBe('cancelled');
  expect(errors).toEqual([]);
});

test('the front desk lets an active member in and turns an expired one away', async ({ page, request }) => {
  const adminToken = await signInAs(page, request, 'admin');
  const memberLogin = await request.post('/api/auth/demo-login', { data: { role: 'member' } });
  const member = (await memberLogin.json()).data.user as { qr_code_token: string; name: string };
  const search = await request.get('/api/members?search=dev.kapoor', { headers: auth(adminToken) });
  const expired = ((await search.json()).data as Array<{ qr_code_token: string; membership_status: string }>)[0];
  expect(expired.membership_status).toBe('expired');

  await page.goto('/admin/check-in');
  await page.locator('#checkin-code').fill(member.qr_code_token);
  await page.getByRole('button', { name: /^Check in$/ }).click();
  await expect(page.getByText('Access granted').first()).toBeVisible();
  await expect(page.getByText(member.name).first()).toBeVisible();

  await page.locator('#checkin-code').fill(expired.qr_code_token);
  await page.getByRole('button', { name: /^Check in$/ }).click();
  await expect(page.getByText(/Access denied/).first()).toBeVisible();
});

test('pricing shows the plan catalogue from the server', async ({ page, request }) => {
  const plans = (await (await request.get('/api/plans')).json()).data as Array<{ name: string; price_monthly: number }>;
  await page.goto('/pricing');
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  for (const plan of plans) {
    await expect(page.getByText(plan.name).first()).toBeVisible();
    await expect(page.getByText(inr.format(plan.price_monthly)).first()).toBeVisible();
  }
});
