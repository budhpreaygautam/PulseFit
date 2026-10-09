import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

// What the admin screens rely on from the server, checked against the real rules (the e2e tests
// stub these answers, because the shared e2e database cannot be narrowed or backdated safely).
// The screens strip the leading "<Thing> updated." and show the rest as a warning, so the count of
// cancelled bookings must follow it.

const NOW = new Date('2026-10-07T04:30:00.000Z'); // Wednesday 10:00 IST
const TODAY = '2026-10-07';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
});
afterEach(() => {
  vi.useRealTimers();
});

const admin = () => authHeader(personas.admin);
const confirmedIds = () => new Set(db.bookings.filter(b => b.status === 'confirmed').map(b => b.id));
/** Bookings confirmed before `run` and cancelled by it. */
async function cancelledBy<T>(run: () => Promise<T>): Promise<{ result: T; cancelled: number }> {
  const before = confirmedIds();
  const result = await run();
  const cancelled = db.bookings.filter(b => before.has(b.id) && b.status === 'cancelled').length;
  return { result, cancelled };
}
const countIn = (message: string, pattern: RegExp) => Number(message.match(pattern)?.[1]);

describe('messages after edits that cancel bookings', () => {
  it('a narrower plan says how many bookings it cancelled, after "Plan updated."', async () => {
    const vip = db.membership_plans.find(p => p.tier === 'vip')!;
    expect(vip.categories).toEqual([]);
    // Drop whichever category the seeded All-Access members have upcoming bookings in.
    const vipIds = new Set(db.users.filter(u => u.membership_tier === 'vip').map(u => u.id));
    const booked = db.bookings.find(b => b.status === 'confirmed' && b.booking_date >= TODAY && vipIds.has(b.user_id))!;
    expect(booked).toBeDefined();
    const dropped = db.classes.find(c => c.id === booked.class_id)!.category;
    const kept = dropped === 'Zumba & Cardio' ? 'Workout & Strength' : 'Zumba & Cardio';

    const { result: res, cancelled } = await cancelledBy(() => api().put(`/api/plans/${vip.id}`).set(admin()).send({ categories: [kept] }));
    expect(res.status).toBe(200);
    const pattern = /^Plan updated\. (\d+) upcoming bookings? (?:was|were) cancelled because the plan no longer covers those classes\.$/;
    expect(res.body.message).toMatch(pattern);
    expect(cancelled).toBeGreaterThan(0);
    expect(countIn(res.body.message, pattern)).toBe(cancelled);
  });

  it('a plan edit that cancels nothing says only "Plan updated.", so the page shows a plain saved message', async () => {
    const basic = db.membership_plans.find(p => p.tier === 'basic')!;
    const res = await api().put(`/api/plans/${basic.id}`).set(admin()).send({ description: basic.description });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Plan updated.');
  });

  it('an admin freeze says how many bookings it cancelled, after "Member updated."', async () => {
    const ananya = userByEmail(personas.vip);
    const { result: res, cancelled } = await cancelledBy(() => api().put(`/api/members/${ananya.id}`).set(admin()).send({ membership_status: 'frozen' }));
    expect(res.status).toBe(200);
    const pattern = /^Member updated\. (\d+) upcoming bookings? (?:was|were) cancelled\.$/;
    expect(res.body.message).toMatch(pattern);
    expect(cancelled).toBeGreaterThan(0);
    expect(countIn(res.body.message, pattern)).toBe(cancelled);
  });

  it('a class category change says how many bookings it cancelled and why, after "Class updated."', async () => {
    const aarav = userByEmail(personas.member); // Zumba & Cardio pass
    const booking = db.bookings.find(b => b.user_id === aarav.id && b.status === 'confirmed' && b.booking_date >= TODAY)!;
    expect(booking).toBeDefined();
    const { result: res, cancelled } = await cancelledBy(() => api().put(`/api/classes/${booking.class_id}`).set(admin()).send({ category: 'Workout & Strength' }));
    expect(res.status).toBe(200);
    const pattern = /^Class updated\. (\d+) upcoming bookings? (?:was|were) cancelled \(.+\)\.$/;
    expect(res.body.message).toMatch(pattern);
    expect(countIn(res.body.message, pattern)).toBe(cancelled);
  });

  it('deleting a class returns the number of bookings it cancelled', async () => {
    const booking = db.bookings.find(b => b.status === 'confirmed' && b.booking_date > TODAY)!;
    const { result: res, cancelled } = await cancelledBy(() => api().delete(`/api/classes/${booking.class_id}`).set(admin()));
    expect(res.status).toBe(200);
    expect(cancelled).toBeGreaterThan(0);
    expect(res.body.data.cancelled_bookings).toBe(cancelled);
  });
});

describe('what the edit member form sends', () => {
  // A plan that ran out is stored as active with a past expiry; the form shows it as Expired.
  const lapse = () => {
    const rohan = userByEmail(personas.basic);
    db.users = db.users.map(u => (u.id === rohan.id ? { ...u, membership_status: 'active' as const, membership_expiry: '2026-10-01', frozen_since: null } : u));
    return rohan.id;
  };

  it('a lapsed member shown Expired can change plan when the form sends the status shown', async () => {
    const id = lapse();
    expect((await api().get(`/api/members/${id}`).set(admin())).body.data.membership_status).toBe('expired');
    const res = await api().put(`/api/members/${id}`).set(admin()).send({ membership_tier: 'pro', membership_status: 'expired' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ membership_tier: 'pro', membership_status: 'expired', membership_expiry: '2026-10-01' });
  });

  it('a new date with the status left on Expired keeps the member out; setting Active lets them in', async () => {
    const id = lapse();
    const dateOnly = await api().put(`/api/members/${id}`).set(admin()).send({ membership_expiry: '2026-12-31', membership_status: 'expired' });
    expect(dateOnly.status).toBe(200);
    // This is the case the form now warns about before saving, and reports after.
    expect(dateOnly.body.data).toMatchObject({ membership_status: 'expired', membership_expiry: '2026-12-31' });
    const activated = await api().put(`/api/members/${id}`).set(admin()).send({ membership_status: 'active' });
    expect(activated.status).toBe(200);
    expect(activated.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-12-31' });
  });

  it('unfreezing with an expiry that passed during the freeze is accepted, and the new expiry is not in the past', async () => {
    const rohan = userByEmail(personas.basic);
    db.users = db.users.map(u => (u.id === rohan.id ? { ...u, membership_status: 'frozen' as const, frozen_since: '2026-08-01', membership_expiry: '2026-08-31' } : u));
    const res = await api().put(`/api/members/${rohan.id}`).set(admin()).send({ membership_status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.data.membership_status).toBe('active');
    expect(res.body.data.membership_expiry >= TODAY).toBe(true);
  });

  it('unfreezing that still ends in the past is refused on membership_expiry, where the form shows it', async () => {
    const rohan = userByEmail(personas.basic);
    db.users = db.users.map(u => (u.id === rohan.id ? { ...u, membership_status: 'frozen' as const, frozen_since: '2026-10-05', membership_expiry: '2026-01-31' } : u));
    const res = await api().put(`/api/members/${rohan.id}`).set(admin()).send({ membership_status: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.issues.map((i: { path: string }) => i.path)).toEqual(['membership_expiry']);
  });
});
