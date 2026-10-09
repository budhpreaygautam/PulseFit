import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { DEMO_PERSONAS } from '../src/controllers/authController.js';
import { setRazorpayClientForTests } from '../src/controllers/paymentController.js';
import { freezeCredit, unfreezeMembership } from '../src/lib/billing.js';
import { displayDate } from '../src/lib/dates.js';
import { activityDays, currentStreak, recomputeStreak, recordActivity, runEndingOn } from '../src/lib/streak.js';
import { Booking, ClassCategory } from '../src/types/index.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

// Regressions for the membership lane of the v2.1 bug-fix round: freeze credit, bookings released
// by plan and membership changes, lapsed members in the admin form, streaks over closed Sundays,
// streak days taken back, readable dates in messages, and locked demo personas.

const NOW = '2026-10-07T04:30:00.000Z'; // Wednesday 10:00 IST
const at = (iso: string) => vi.setSystemTime(new Date(iso));
/** An instant given as gym time (IST, UTC+5:30). */
const ist = (date: string, time: string) => new Date(Date.parse(`${date}T${time}:00+05:30`)).toISOString();

const DEMO_MODE = config.demoMode;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(NOW);
  resetDb();
});

afterEach(() => {
  vi.useRealTimers();
  config.demoMode = DEMO_MODE;
});

const freeze = (email: string) => api().post('/api/membership/freeze').set(authHeader(email)).send({});
const unfreeze = (email: string) => api().post('/api/membership/unfreeze').set(authHeader(email)).send({});
const editMember = (id: string, body: Record<string, unknown>) => api().put(`/api/members/${id}`).set(authHeader(personas.admin)).send(body);

/** Confirmed bookings of a user whose class has not started at NOW (all seeded ones from 7 Oct 18:30 on). */
const upcoming = (userId: string) =>
  db.bookings.filter(b => {
    if (b.user_id !== userId || b.status !== 'confirmed') return false;
    const cls = db.classes.find(c => c.id === b.class_id)!;
    return ist(b.booking_date, cls.start_time) > NOW;
  });

let bookingSeq = 0;
/** Store a confirmed booking for the class of a category running on a date's weekday. */
function book(userId: string, category: ClassCategory, date: string): Booking {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const cls = db.classes.find(c => c.category === category && c.day_of_week === day)!;
  const booking: Booking = { id: `bk_fix_${++bookingSeq}`, class_id: cls.id, user_id: userId, booking_date: date, status: 'confirmed', created_at: NOW };
  db.bookings = [...db.bookings, booking];
  return booking;
}

const statusOf = (bookingId: string) => db.bookings.find(b => b.id === bookingId)!.status;

describe('freeze credit counts open days missed (regression: freeze-overnight-free-days)', () => {
  it('gives nothing back for a freeze from 21:00 to 06:30 the next morning, however often it is repeated', async () => {
    const rohan = userByEmail(personas.basic);
    expect(rohan.membership_expiry).toBe('2026-10-31');
    for (const [night, morning] of [
      ['2026-10-07', '2026-10-08'],
      ['2026-10-08', '2026-10-09'],
      ['2026-10-09', '2026-10-10'],
      ['2026-10-12', '2026-10-13'],
      ['2026-10-13', '2026-10-14']
    ]) {
      at(ist(night, '21:00'));
      expect((await freeze(personas.basic)).status).toBe(200);
      at(ist(morning, '06:30'));
      const res = await unfreeze(personas.basic);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-10-31', frozen_since: null });
      expect(res.body.message).toBe(
        'Welcome back! Your membership is active again. You did not miss any open gym days, so your end date stays 31 Oct 2026.'
      );
    }
    expect(userByEmail(personas.basic).membership_expiry).toBe('2026-10-31');
  });

  it('gives nothing back from Saturday evening to Monday morning: Sunday is closed', async () => {
    at(ist('2026-10-10', '20:00'));
    await freeze(personas.basic);
    at(ist('2026-10-12', '07:00'));
    const res = await unfreeze(personas.basic);
    expect(res.body.data.membership_expiry).toBe('2026-10-31');
    expect(res.body.message).not.toMatch(/0 /);
  });

  it('gives back the open days strictly between the freeze and the return, stepping over Sundays', async () => {
    await freeze(personas.basic); // Wed 7 Oct
    at(ist('2026-10-14', '09:00'));
    const res = await unfreeze(personas.basic);
    // Missed Thu 8, Fri 9, Sat 10, Mon 12, Tue 13 => Sat 31 Oct + 5 open days = Fri 6 Nov.
    expect(res.body.data.membership_expiry).toBe('2026-11-06');
    expect(res.body.message).toBe('Welcome back! 5 gym days added to your membership, so it now runs until 6 Nov 2026.');
  });

  it('applies the same rule when an admin moves a member from frozen to active', async () => {
    const rohan = userByEmail(personas.basic);
    at(ist('2026-10-08', '21:00'));
    await freeze(personas.basic);
    at(ist('2026-10-09', '07:00'));
    const overnight = await editMember(rohan.id, { membership_status: 'active' });
    expect(overnight.status).toBe(200);
    expect(overnight.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-10-31', frozen_since: null });

    await freeze(personas.basic); // Fri 9 Oct
    at(ist('2026-10-14', '07:00'));
    const week = await editMember(rohan.id, { membership_status: 'active' });
    // Missed Sat 10, Mon 12, Tue 13 => Sat 31 Oct + 3 open days = Wed 4 Nov.
    expect(week.body.data.membership_expiry).toBe('2026-11-04');
    expect(unfreezeMembership({ ...rohan, membership_status: 'frozen', frozen_since: '2026-10-09' }, '2026-10-14').membership_expiry).toBe(
      '2026-11-04'
    );
  });

  it('counts open days in billing, never the day of the freeze or of the return', () => {
    expect(freezeCredit('2026-10-08', '2026-10-09')).toBe(0); // overnight
    expect(freezeCredit('2026-10-10', '2026-10-12')).toBe(0); // Saturday to Monday
    expect(freezeCredit('2026-10-09', '2026-10-12')).toBe(1); // Saturday missed
    expect(freezeCredit('2026-10-07', '2026-10-14')).toBe(5);
  });

  it('says plainly when the plan ended while it was frozen', async () => {
    at(ist('2026-10-31', '10:00')); // the last paid day
    expect((await freeze(personas.basic)).status).toBe(200);
    at(ist('2026-11-03', '10:00'));
    const res = await unfreeze(personas.basic);
    // Mon 2 Nov was the only open day missed, so the plan ran until then.
    expect(res.body.data).toMatchObject({ membership_status: 'expired', membership_expiry: '2026-11-02' });
    expect(res.body.message).toBe('Your membership is unfrozen, but it ended on 2 Nov 2026. Renew your plan to keep coming in.');
  });
});

describe('freeze message (regression: count of cancelled bookings and the ended floor session)', () => {
  it('says how many bookings were cancelled and that the floor session was ended', async () => {
    const aarav = userByEmail(personas.member);
    const held = upcoming(aarav.id).length;
    expect(held).toBeGreaterThan(1);
    db.time_sessions = db.time_sessions.filter(s => !(s.user_id === aarav.id && s.status === 'active'));
    expect((await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send({ category: 'Zumba & Cardio' })).status).toBe(201);

    const res = await freeze(personas.member);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(`Membership frozen. ${held} upcoming class bookings were cancelled. Your gym-floor session was ended.`);
    expect(upcoming(aarav.id)).toHaveLength(0);
  });

  it('is just "Membership frozen." when nothing else changed', async () => {
    const aarav = userByEmail(personas.member);
    db.bookings = db.bookings.filter(b => b.user_id !== aarav.id);
    db.time_sessions = db.time_sessions.filter(s => !(s.user_id === aarav.id && s.status === 'active'));
    expect((await freeze(personas.member)).body.message).toBe('Membership frozen.');
  });
});

describe('a plan change through checkout releases bookings the new plan does not cover (regression)', () => {
  const KEY_SECRET = 'test-key-secret';
  const WEBHOOK_SECRET = 'test-webhook-secret';
  const original = { ...config.razorpay };
  let orderSeq = 0;
  const plan = (tier: string) => db.membership_plans.find(p => p.tier === tier)!;

  beforeEach(() => {
    Object.assign(config.razorpay, { keyId: 'rzp_test_fix', keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
    setRazorpayClientForTests({
      orders: { create: async params => ({ id: `order_fix_${++orderSeq}`, amount: params.amount, currency: params.currency }) }
    });
  });

  afterEach(() => {
    Object.assign(config.razorpay, original);
    setRazorpayClientForTests(null);
  });

  async function createOrder(email: string, tier: string) {
    const res = await api().post('/api/payment/create-order').set(authHeader(email)).send({ tier, billing_cycle: 'monthly' });
    expect(res.status).toBe(200);
    return res.body.data.orderId as string;
  }

  function verify(email: string, orderId: string) {
    const paymentId = `pay_${orderId}`;
    const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    return api()
      .post('/api/payment/verify')
      .set(authHeader(email))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
  }

  const categoryOf = (b: Booking) => db.classes.find(c => c.id === b.class_id)!.category;

  it('verify: cancels the upcoming classes outside the new plan and says how many', async () => {
    const ananya = userByEmail(personas.vip);
    const aaravBefore = upcoming(userByEmail(personas.member).id).map(b => b.id);
    const strength = upcoming(ananya.id).filter(b => categoryOf(b) === 'Workout & Strength');
    const zumba = upcoming(ananya.id).filter(b => categoryOf(b) === 'Zumba & Cardio');
    expect(strength.length).toBeGreaterThan(1);
    expect(zumba.length).toBeGreaterThan(0);

    const res = await verify(personas.vip, await createOrder(personas.vip, 'pro'));
    expect(res.status).toBe(200);
    const end = displayDate(res.body.data.payment.period_end);
    const message = `Payment received. Your ${plan('pro').name} is active until ${end}. ${strength.length} upcoming class bookings were cancelled because your new plan does not include those classes.`;
    expect(res.body.message).toBe(message);
    expect(res.body.data).toMatchObject({ message, cancelled_bookings: strength.length });
    for (const b of strength) expect(statusOf(b.id)).toBe('cancelled');
    for (const b of zumba) expect(statusOf(b.id)).toBe('confirmed');
    // Nobody else's bookings are touched.
    expect(upcoming(userByEmail(personas.member).id).map(b => b.id)).toEqual(aaravBefore);
  });

  function webhook(orderId: string, tier: string) {
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: `pay_wh_${orderId}`, order_id: orderId, amount: plan(tier).price_monthly * 100, currency: 'INR' } } }
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    return api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).send(raw);
  }

  it('webhook: the same release when Razorpay reports the payment first', async () => {
    const ananya = userByEmail(personas.vip);
    const zumba = upcoming(ananya.id).filter(b => categoryOf(b) === 'Zumba & Cardio');
    const strength = upcoming(ananya.id).filter(b => categoryOf(b) === 'Workout & Strength');
    const orderId = await createOrder(personas.vip, 'basic');
    const res = await webhook(orderId, 'basic');
    expect(res.status).toBe(200);
    expect(userByEmail(personas.vip).membership_tier).toBe('basic');
    for (const b of zumba) expect(statusOf(b.id)).toBe('cancelled');
    for (const b of strength) expect(statusOf(b.id)).toBe('confirmed');
  });

  it('verify after the webhook still tells the member how many bookings the plan change cancelled', async () => {
    const ananya = userByEmail(personas.vip);
    book(ananya.id, 'Zumba & Cardio', '2026-10-17'); // so there are at least two
    const zumba = upcoming(ananya.id).filter(b => categoryOf(b) === 'Zumba & Cardio');
    expect(zumba.length).toBeGreaterThan(1);
    const orderId = await createOrder(personas.vip, 'basic');
    expect((await webhook(orderId, 'basic')).status).toBe(200);

    const end = displayDate(db.payments.find(p => p.order_id === orderId)!.period_end);
    const message = `Payment received. Your ${plan('basic').name} is active until ${end}. ${zumba.length} upcoming class bookings were cancelled because your new plan does not include those classes.`;
    // The browser's verify arrives second, and a double-submitted one third: both say the same.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await verify(personas.vip, orderId);
      expect(res.status, `attempt ${attempt}`).toBe(409);
      expect(res.body.code).toBe('ALREADY_PROCESSED');
      expect(res.body.data).toMatchObject({ cancelled_bookings: zumba.length, message });
      expect(res.body.data.user).toMatchObject({ email: personas.vip, membership_tier: 'basic' });
    }
  });

  it('verify after the webhook of a same-plan renewal reports nothing cancelled', async () => {
    const orderId = await createOrder(personas.basic, 'basic');
    expect((await webhook(orderId, 'basic')).status).toBe(200);
    const res = await verify(personas.basic, orderId);
    expect(res.status).toBe(409);
    expect(res.body.data).toMatchObject({
      cancelled_bookings: 0,
      message: `Payment received. Your ${plan('basic').name} is active until 30 Nov 2026.`
    });
  });

  it('a renewal of the same plan cancels nothing', async () => {
    const rohan = userByEmail(personas.basic);
    const held = upcoming(rohan.id).length;
    const res = await verify(personas.basic, await createOrder(personas.basic, 'basic'));
    expect(res.status).toBe(200);
    expect(res.body.data.cancelled_bookings).toBe(0);
    expect(res.body.message).toBe(`Payment received. Your ${plan('basic').name} is active until 30 Nov 2026.`);
    expect(upcoming(rohan.id)).toHaveLength(held);
  });
});

describe('admin membership edits release bookings that are no longer valid (regression: admin-membership-edit-keeps-bookings)', () => {
  it('cancels bookings dated after a shortened expiry and keeps the rest', async () => {
    const ananya = userByEmail(personas.vip);
    const before = upcoming(ananya.id);
    const after10 = before.filter(b => b.booking_date > '2026-10-10');
    const upTo10 = before.filter(b => b.booking_date <= '2026-10-10');
    expect(after10.length).toBeGreaterThan(1);
    expect(upTo10.length).toBeGreaterThan(0);

    const res = await editMember(ananya.id, { membership_expiry: '2026-10-10' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(`Member updated. ${after10.length} upcoming bookings were cancelled.`);
    for (const b of after10) expect(statusOf(b.id)).toBe('cancelled');
    for (const b of upTo10) expect(statusOf(b.id)).toBe('confirmed');
  });

  it.each([
    ['expired', { membership_status: 'expired' }],
    ['pending', { membership_status: 'pending' }],
    ['made a trainer', { role: 'trainer' }],
    ['made an admin', { role: 'admin' }]
  ])('cancels every upcoming booking of a member %s', async (_label, body) => {
    // On a public demo the personas' roles are locked (see the demo personas tests below).
    if ('role' in body) config.demoMode = false;
    const aarav = userByEmail(personas.member);
    const held = upcoming(aarav.id).length;
    expect(held).toBeGreaterThan(1);
    const res = await editMember(aarav.id, body);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(`Member updated. ${held} upcoming bookings were cancelled.`);
    expect(upcoming(aarav.id)).toHaveLength(0);
  });

  it('says "was" for one booking and leaves bookings alone on a name or phone change', async () => {
    const aarav = userByEmail(personas.member);
    db.bookings = db.bookings.filter(b => b.user_id !== aarav.id);
    const only = book(aarav.id, 'Zumba & Cardio', '2026-10-09');
    const rename = await editMember(aarav.id, { name: 'Aarav S', phone: '+91 90000 11111' });
    expect(rename.body.message).toBeUndefined();
    expect(statusOf(only.id)).toBe('confirmed');
    const res = await editMember(aarav.id, { membership_status: 'expired' });
    expect(res.body.message).toBe('Member updated. 1 upcoming booking was cancelled.');
  });

  it('cancels only the edited member\'s bookings outside a new tier', async () => {
    const ananya = userByEmail(personas.vip);
    const aaravBefore = upcoming(userByEmail(personas.member).id).map(b => b.id);
    const res = await editMember(ananya.id, { membership_tier: 'basic' });
    expect(res.status).toBe(200);
    expect(upcoming(ananya.id).every(b => db.classes.find(c => c.id === b.class_id)!.category === 'Workout & Strength')).toBe(true);
    expect(upcoming(userByEmail(personas.member).id).map(b => b.id)).toEqual(aaravBefore);
  });

  /** Start a fresh floor session for a seeded account (any live seeded one is dropped first). */
  async function clockIn(email: string, category: ClassCategory) {
    const id = userByEmail(email).id;
    db.time_sessions = db.time_sessions.filter(s => !(s.user_id === id && s.status === 'active'));
    expect((await api().post('/api/time-tracking/clock-in').set(authHeader(email)).send({ category })).status).toBe(201);
    return id;
  }
  const onFloor = (userId: string) => db.time_sessions.some(s => s.user_id === userId && s.status === 'active');

  it.each(['expired', 'pending', 'frozen'])('ends the floor session of a member set to %s, as clock-in would now refuse them', async status => {
    const id = await clockIn(personas.member, 'Zumba & Cardio');
    const res = await editMember(id, { membership_status: status });
    expect(res.status).toBe(200);
    expect(onFloor(id)).toBe(false);
    expect(db.time_sessions.find(s => s.user_id === id && s.clock_out_time === new Date(NOW).toISOString())).toMatchObject({ status: 'completed' });
  });

  it('leaves the floor session alone while the membership stays active, and for staff', async () => {
    const aarav = await clockIn(personas.member, 'Zumba & Cardio');
    expect((await editMember(aarav, { membership_tier: 'vip', name: 'Aarav S' })).status).toBe(200);
    expect(onFloor(aarav)).toBe(true);

    // Staff skip the membership check at clock-in, so a trainer's session survives any status.
    const trainer = await clockIn(personas.trainer, 'Workout & Strength');
    expect((await editMember(trainer, { membership_status: 'expired' })).status).toBe(200);
    expect(onFloor(trainer)).toBe(true);
  });
});

describe('lapsed members in the admin form (regression: lapsed-member-tier-change-rejected)', () => {
  function lapse() {
    db.users = db.users.map(u => (u.email === personas.basic ? { ...u, membership_status: 'active' as const, membership_expiry: '2026-10-01' } : u));
    return userByEmail(personas.basic);
  }

  it('changes only the plan of a member whose paid period ran out, and keeps them lapsed', async () => {
    const rohan = lapse();
    const shown = await api().get(`/api/members/${rohan.id}`).set(authHeader(personas.admin));
    expect(shown.body.data.membership_status).toBe('expired');

    const res = await editMember(rohan.id, { membership_tier: 'pro' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ membership_tier: 'pro', membership_status: 'expired', membership_expiry: '2026-10-01' });
    expect((await editMember(rohan.id, { membership_tier: 'none' })).status).toBe(200);
  });

  it('accepts the form sending the status it shows ("expired") with the changed plan', async () => {
    const rohan = lapse();
    const res = await editMember(rohan.id, { membership_status: 'expired', membership_tier: 'vip', membership_expiry: '2026-10-01' });
    expect(res.status).toBe(200);
    expect(userByEmail(personas.basic)).toMatchObject({ membership_status: 'expired', membership_tier: 'vip' });
  });

  it('still refuses a request that asks for an active membership without a current expiry', async () => {
    const rohan = lapse();
    const res = await editMember(rohan.id, { membership_status: 'active', membership_tier: 'pro' });
    expect(res.status).toBe(400);
    expect(res.body.data.issues[0].path).toBe('membership_expiry');
    const past = await editMember(userByEmail(personas.member).id, { membership_expiry: '2026-10-01' });
    expect(past.status).toBe(400);
    expect(past.body.data.issues[0].path).toBe('membership_expiry');
  });

  it('accepts the status the form shows sent unchanged with a plan change, for active and frozen members', async () => {
    const aarav = userByEmail(personas.member);
    const active = await editMember(aarav.id, { membership_tier: 'vip', membership_status: 'active' });
    expect(active.status).toBe(200);
    expect(active.body.data).toMatchObject({ membership_tier: 'vip', membership_status: 'active', membership_expiry: aarav.membership_expiry });

    at(ist('2026-10-05', '10:00'));
    expect((await freeze(personas.basic)).status).toBe(200);
    at(NOW);
    const rohan = userByEmail(personas.basic);
    const frozen = await editMember(rohan.id, { membership_tier: 'pro', membership_status: 'frozen' });
    expect(frozen.status).toBe(200);
    expect(userByEmail(personas.basic)).toMatchObject({ membership_tier: 'pro', membership_status: 'frozen', frozen_since: '2026-10-05' });
  });

  it('reactivates a lapsed member when a new expiry is sent', async () => {
    const rohan = lapse();
    const res = await editMember(rohan.id, { membership_expiry: '2026-12-31' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ membership_status: 'active', membership_expiry: '2026-12-31' });
  });
});

describe('streaks step over closed Sundays (regression: streak-breaks-on-closed-sunday)', () => {
  function fresh() {
    db.users = db.users.map(u => (u.email === personas.basic ? { ...u, streak_days: 0, last_active_date: null } : u));
    return userByEmail(personas.basic).id;
  }
  const stored = (id: string) => db.users.find(u => u.id === id)!;

  it('carries a Monday-to-Saturday run over Sunday into the next week', () => {
    const id = fresh();
    const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
    expect(week.map(d => recordActivity(id, d))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(currentStreak(stored(id), '2026-10-11')).toBe(6); // Sunday, closed
    expect(currentStreak(stored(id), '2026-10-12')).toBe(6); // Monday morning, before the visit
    expect(recordActivity(id, '2026-10-12')).toBe(7);
    expect(currentStreak(stored(id), '2026-10-13')).toBe(7);
    expect(currentStreak(stored(id), '2026-10-14')).toBe(0); // Tuesday went by without a visit
  });

  it('still breaks on a missed open day, and counts activity on a Sunday', () => {
    const id = fresh();
    recordActivity(id, '2026-10-09'); // Friday
    expect(currentStreak(stored(id), '2026-10-12')).toBe(0); // Saturday was missed
    expect(recordActivity(id, '2026-10-12')).toBe(1);

    const other = userByEmail(personas.member).id;
    db.users = db.users.map(u => (u.id === other ? { ...u, streak_days: 0, last_active_date: null } : u));
    expect(['2026-10-10', '2026-10-11', '2026-10-12'].map(d => recordActivity(other, d))).toEqual([1, 2, 3]);
  });

  it('builds runs from history by the same rule', () => {
    expect(runEndingOn(new Set(['2026-10-09', '2026-10-10', '2026-10-12']), '2026-10-12')).toBe(3);
    expect(runEndingOn(new Set(['2026-10-10', '2026-10-11', '2026-10-12']), '2026-10-12')).toBe(3);
    expect(runEndingOn(new Set(['2026-10-09', '2026-10-12']), '2026-10-12')).toBe(1);
    expect(runEndingOn(new Set(['2026-10-12']), '2026-10-13')).toBe(0);
  });

  it('shows a Saturday streak on Monday and grows it at the Monday check-in', async () => {
    at(ist('2026-10-12', '10:00'));
    const rohan = userByEmail(personas.basic);
    db.users = db.users.map(u => (u.id === rohan.id ? { ...u, streak_days: 4, last_active_date: '2026-10-10' } : u));
    expect((await api().get('/api/auth/me').set(authHeader(personas.basic))).body.data.streak_days).toBe(4);
    const res = await api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send({ code: rohan.qr_code_token });
    expect(res.status).toBe(200);
    expect(res.body.data.member.streak_days).toBe(5);
  });
});

describe('a counted day is taken back when it is withdrawn (regression: attendance-correction-keeps-streak)', () => {
  async function newMember() {
    const res = await api()
      .post('/api/members')
      .set(authHeader(personas.admin))
      .send({ name: 'Streak Probe', email: 'streak.probe@example.com', membership_tier: 'vip', expiry_months: 1 });
    expect(res.status).toBe(201);
    return res.body.data.member.id as string;
  }
  const user = (id: string) => db.users.find(u => u.id === id)!;
  const mark = (bookingId: string, status: string) =>
    api().patch(`/api/bookings/${bookingId}/attendance`).set(authHeader(personas.admin)).send({ status });
  const checkIn = (userId: string, date: string) => {
    db.attendance_logs = [
      ...db.attendance_logs,
      { id: `att_fix_${date}`, user_id: userId, user_name: 'Streak Probe', check_in_time: ist(date, '07:00'), check_in_method: 'qr' as const }
    ];
  };

  it.each(['no_show', 'confirmed'])('attended -> %s removes the day when nothing else counted it', async status => {
    const id = await newMember();
    const booking = book(id, 'Zumba & Cardio', '2026-10-07'); // Wednesday 07:30, already started
    expect((await mark(booking.id, 'attended')).status).toBe(200);
    expect(user(id)).toMatchObject({ streak_days: 1, last_active_date: '2026-10-07' });

    expect((await mark(booking.id, status)).status).toBe(200);
    expect(user(id)).toMatchObject({ streak_days: 0, last_active_date: null });
    const me = await api().get('/api/members/' + id).set(authHeader(personas.admin));
    expect(me.body.data.streak_days).toBe(0);
  });

  it('goes back to the previous day of the run, and keeps a day a check-in also counted', async () => {
    const id = await newMember();
    checkIn(id, '2026-10-06');
    recordActivity(id, '2026-10-06');
    const booking = book(id, 'Zumba & Cardio', '2026-10-07');
    await mark(booking.id, 'attended');
    expect(user(id)).toMatchObject({ streak_days: 2, last_active_date: '2026-10-07' });
    await mark(booking.id, 'no_show');
    expect(user(id)).toMatchObject({ streak_days: 1, last_active_date: '2026-10-06' });

    checkIn(id, '2026-10-07');
    await mark(booking.id, 'attended');
    await mark(booking.id, 'no_show');
    expect(user(id)).toMatchObject({ streak_days: 2, last_active_date: '2026-10-07' });
  });

  it('counts a forgotten floor session from yesterday when it rebuilds after a correction', async () => {
    const id = await newMember();
    db.time_sessions = [
      ...db.time_sessions,
      {
        id: 'ts_fix_forgotten',
        user_id: id,
        user_name: 'Streak Probe',
        user_email: 'streak.probe@example.com',
        user_tier: 'vip',
        category: 'Workout & Strength',
        clock_in_time: ist('2026-10-06', '18:00'),
        clock_out_time: null,
        duration_minutes: 0,
        status: 'active'
      }
    ];
    const booking = book(id, 'Zumba & Cardio', '2026-10-07');
    await mark(booking.id, 'attended');
    await mark(booking.id, 'no_show');
    // The session open since yesterday evening was closed (4 hours after clock-in) and kept its day.
    expect(db.time_sessions.find(s => s.id === 'ts_fix_forgotten')).toMatchObject({ status: 'completed', auto_closed: true });
    expect(user(id)).toMatchObject({ streak_days: 1, last_active_date: '2026-10-06' });
  });

  it('deleting the workout logged for today takes the day back; a back-dated one changes nothing', async () => {
    const id = await newMember();
    const header = authHeader('streak.probe@example.com');
    const workout = (date: string) => ({ title: 'Legs', date, duration_minutes: 30, sets: [{ exercise_id: 'ex_barbell_squat', set_number: 1, weight_kg: 40, reps: 8 }] });

    const old = await api().post('/api/workouts').set(header).send(workout('2026-10-05'));
    const today = await api().post('/api/workouts').set(header).send(workout('2026-10-07'));
    expect(user(id)).toMatchObject({ streak_days: 1, last_active_date: '2026-10-07' });

    expect((await api().delete(`/api/workouts/${old.body.data.id}`).set(header)).status).toBe(200);
    expect(user(id)).toMatchObject({ streak_days: 1, last_active_date: '2026-10-07' });
    expect((await api().delete(`/api/workouts/${today.body.data.id}`).set(header)).status).toBe(200);
    expect(user(id)).toMatchObject({ streak_days: 0, last_active_date: null });
  });

  it('agrees with replaying the whole history through recordActivity, for every seeded member', () => {
    at(ist('2026-10-12', '12:00')); // a Monday, so runs cross a Sunday
    for (const member of db.users.filter(u => u.role === 'member')) {
      const days = [...activityDays(member.id)].filter(d => d <= '2026-10-12').sort();
      db.users = db.users.map(u => (u.id === member.id ? { ...u, streak_days: 0, last_active_date: null } : u));
      for (const d of days) recordActivity(member.id, d);
      const replayed = db.users.find(u => u.id === member.id)!;
      const rebuilt = recomputeStreak(member.id, '2026-10-12');
      expect(rebuilt, member.name).toBe(replayed.streak_days);
      expect(db.users.find(u => u.id === member.id)!.last_active_date, member.name).toBe(replayed.last_active_date);
    }
    // Some seeded runs now cross the closed Sunday.
    expect(db.users.some(u => (u.streak_days || 0) > 6)).toBe(true);
  });
});

describe('dates in messages are readable (regression: raw ISO dates)', () => {
  it('MEMBERSHIP_ENDS_BEFORE_CLASS names the last day as people read it, with the ISO date in data', async () => {
    db.users = db.users.map(u => (u.email === personas.member ? { ...u, membership_expiry: '2026-10-08' } : u));
    const res = await api().post('/api/bookings').set(authHeader(personas.member)).send({ class_id: 'cls_zumba_sat', booking_date: '2026-10-10' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'MEMBERSHIP_ENDS_BEFORE_CLASS',
      error: 'Your membership ends on 8 Oct 2026, before this class. Renew your plan to book it.',
      data: { membership_expiry: '2026-10-08' }
    });
  });
});

describe('demo personas cannot be locked out by an admin reset (regression)', () => {
  it('refuses to reset the four shared demo accounts in demo mode', async () => {
    expect(config.demoMode).toBe(true);
    for (const email of Object.values(DEMO_PERSONAS)) {
      const id = userByEmail(email).id;
      const hash = userByEmail(email).password_hash;
      const res = await api().post(`/api/members/${id}/reset-password`).set(authHeader(personas.admin));
      expect(res.status, email).toBe(403);
      expect(res.body.code).toBe('DEMO_ACCOUNT_LOCKED');
      expect(res.body.error).toMatch(/shared demo accounts/);
      expect(userByEmail(email).password_hash).toBe(hash);
    }
    expect((await api().post('/api/auth/login').send({ email: personas.vip, password: 'pulse123' })).status).toBe(200);
  });

  it('resets them normally when demo mode is off', async () => {
    config.demoMode = false;
    const res = await api().post(`/api/members/${userByEmail(personas.vip).id}/reset-password`).set(authHeader(personas.admin));
    expect(res.status).toBe(200);
  });
});

describe('demo personas cannot be deleted or given another role on a public demo (regression: decision-I-demo-personas-reset)', () => {
  /** A second admin, so admin@ itself can be the target without tripping the self checks. */
  async function otherAdmin() {
    const res = await api()
      .post('/api/members')
      .set(authHeader(personas.admin))
      .send({ name: 'Second Admin', email: 'second.admin@example.com', role: 'admin' });
    expect(res.status).toBe(201);
    return authHeader('second.admin@example.com');
  }

  it('refuses to delete any of the four, and demo-login keeps working for every visitor', async () => {
    const admin = await otherAdmin();
    for (const email of Object.values(DEMO_PERSONAS)) {
      const res = await api().delete(`/api/members/${userByEmail(email).id}`).set(admin);
      expect(res.status, email).toBe(403);
      expect(res.body).toMatchObject({ code: 'DEMO_ACCOUNT_LOCKED' });
      expect(res.body.error).toBe('This is one of the shared demo accounts that every visitor uses, so it cannot be deleted. Try it on another member.');
    }
    for (const role of ['member', 'vip', 'trainer', 'admin']) {
      const login = await api().post('/api/auth/demo-login').send({ role });
      expect(login.status, role).toBe(200);
      expect(login.body.data.user.email).toBe(DEMO_PERSONAS[role as keyof typeof DEMO_PERSONAS]);
    }
    // Other members can still be deleted.
    expect((await api().delete(`/api/members/${userByEmail(personas.basic).id}`).set(admin)).status).toBe(200);
  });

  it('refuses a role change, but not other edits or the same role sent again', async () => {
    const admin = await otherAdmin();
    for (const [email, role] of [
      [personas.member, 'admin'],
      [personas.vip, 'trainer'],
      [personas.trainer, 'member'],
      [personas.admin, 'member']
    ] as const) {
      const before = userByEmail(email).role;
      const res = await api().put(`/api/members/${userByEmail(email).id}`).set(admin).send({ role, name: 'Renamed' });
      expect(res.status, email).toBe(403);
      expect(res.body.code).toBe('DEMO_ACCOUNT_LOCKED');
      expect(res.body.error).toMatch(/so its role cannot be changed/);
      expect(userByEmail(email)).toMatchObject({ role: before });
      expect(userByEmail(email).name).not.toBe('Renamed');
    }
    const vip = userByEmail(personas.vip);
    const edit = await api().put(`/api/members/${vip.id}`).set(admin).send({ role: 'member', name: 'Ananya G', membership_status: 'frozen' });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({ role: 'member', name: 'Ananya G', membership_status: 'frozen' });
    // The checks that protect the admin's own account still answer first.
    const self = await api().put(`/api/members/${userByEmail(personas.admin).id}`).set(authHeader(personas.admin)).send({ role: 'member' });
    expect(self.body.code).toBe('CANNOT_CHANGE_OWN_ROLE');
    expect((await api().delete(`/api/members/${userByEmail(personas.admin).id}`).set(authHeader(personas.admin))).body.code).toBe('CANNOT_DELETE_SELF');
  });

  it('lets an admin delete and re-role them when demo mode is off', async () => {
    config.demoMode = false;
    const trainer = userByEmail(personas.trainer);
    expect((await editMember(trainer.id, { role: 'admin' })).status).toBe(200);
    expect((await api().delete(`/api/members/${userByEmail(personas.member).id}`).set(authHeader(personas.admin))).status).toBe(200);
  });
});
