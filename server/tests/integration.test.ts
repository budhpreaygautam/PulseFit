import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import config from '../src/config.js';
import { migrate, DatabaseSchema } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { toGymDate } from '../src/lib/dates.js';
import { Payment, User } from '../src/types/index.js';

// Rules that span more than one domain (found by the cross-domain review of v2.1).

const NOW = new Date('2026-10-07T04:30:00.000Z'); // Wednesday 10:00 IST

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
});
afterEach(() => {
  vi.useRealTimers();
});

const upcomingConfirmed = (userId: string) =>
  db.bookings.filter(b => b.user_id === userId && b.status === 'confirmed' && b.booking_date >= '2026-10-07');

describe('first start without demo mode', () => {
  it('loads the catalogue only: no accounts, so no published password works', () => {
    seedDatabase({ demo: false });
    expect(db.users).toHaveLength(0);
    expect(db.membership_plans.map(p => p.tier).sort()).toEqual(['basic', 'pro', 'vip']);
    expect(db.classes.length).toBeGreaterThan(0);
    expect(db.exercises.length).toBeGreaterThan(0);
    expect(db.trainers.length).toBeGreaterThan(0);
    expect(db.trainers.every(t => t.user_id === undefined)).toBe(true);
    for (const rows of [db.bookings, db.payments, db.payment_orders, db.attendance_logs, db.time_sessions, db.trial_passes, db.trainer_notes]) {
      expect(rows).toHaveLength(0);
    }
  });
});

describe('loading a v2.0 database', () => {
  it('fills in plan entitlements, null expiries, and drops untrustworthy streaks and stored counters', () => {
    const legacy = {
      membership_plans: [{ id: 'plan_basic', tier: 'basic', name: 'Strength', price_monthly: 1, price_annual: 1, description: '', features: [] }],
      users: [{ ...userByEmail(personas.member), membership_expiry: '', streak_days: 14, last_active_date: undefined }],
      classes: [{ ...db.classes[0], booked_count: 18 }]
    } as unknown as DatabaseSchema;
    const migrated = migrate({ ...emptyLike(), ...legacy });
    expect(migrated.membership_plans[0].categories).toEqual(['Workout & Strength']);
    expect(migrated.users[0]).toMatchObject({ membership_expiry: null, streak_days: 0, last_active_date: null });
    expect('booked_count' in migrated.classes[0]).toBe(false);
    // Idempotent: already-migrated data is left as it is.
    expect(migrate(migrated)).toEqual(migrated);
  });
});

function emptyLike(): DatabaseSchema {
  return {
    users: [], trainers: [], classes: [], bookings: [], attendance_logs: [], exercises: [], workouts: [], workout_sets: [],
    membership_plans: [], time_sessions: [], payment_orders: [], payments: [], trial_passes: [], trainer_notes: [], password_resets: []
  };
}

describe('uploaded profile photos', () => {
  it('are not copied into floor sessions or the staff floor list', async () => {
    db.time_sessions = db.time_sessions.filter(s => s.status !== 'active');
    const photo = `data:image/png;base64,${Buffer.alloc(30_000).toString('base64')}`;
    expect((await api().put('/api/auth/profile').set(authHeader(personas.member)).send({ avatar_url: photo })).status).toBe(200);

    const clockIn = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send({ category: 'Zumba & Cardio' });
    expect(clockIn.status).toBe(201);
    expect(db.time_sessions.find(s => s.id === clockIn.body.data.id)!.user_avatar).toBe('');

    const floor = await api().get('/api/time-tracking/active-floor').set(authHeader(personas.admin));
    const people = [...(floor.body.data.workoutUsers ?? []), ...(floor.body.data.zumbaUsers ?? [])];
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((p: { user_avatar: string }) => !p.user_avatar.startsWith('data:'))).toBe(true);
  });
});

describe('freezing a membership', () => {
  it('releases the member\'s upcoming class spots and closes their floor session', async () => {
    const aarav = userByEmail(personas.member);
    expect(upcomingConfirmed(aarav.id).length).toBeGreaterThan(0);
    db.time_sessions = db.time_sessions.filter(s => !(s.user_id === aarav.id && s.status === 'active'));
    await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send({ category: 'Zumba & Cardio' });

    const res = await api().post('/api/membership/freeze').set(authHeader(personas.member));
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cancelled/);
    expect(upcomingConfirmed(aarav.id)).toHaveLength(0);
    expect(db.time_sessions.some(s => s.user_id === aarav.id && s.status === 'active')).toBe(false);
  });

  it('does the same when an admin freezes the member', async () => {
    const ananya = userByEmail(personas.vip);
    expect(upcomingConfirmed(ananya.id).length).toBeGreaterThan(0);
    const res = await api().put(`/api/members/${ananya.id}`).set(authHeader(personas.admin)).send({ membership_status: 'frozen' });
    expect(res.status).toBe(200);
    expect(upcomingConfirmed(ananya.id)).toHaveLength(0);
  });
});

describe('bookings and the paid period', () => {
  it('refuses a class after the membership ends', async () => {
    db.users = db.users.map(u => (u.email === personas.member ? { ...u, membership_expiry: '2026-10-08' } : u));
    const classes = (await api().get('/api/classes').set(authHeader(personas.member))).body.data as Array<{ id: string; category: string; occurrence_date: string }>;
    const later = classes.find(c => c.category === 'Zumba & Cardio' && c.occurrence_date > '2026-10-08')!;
    const res = await api().post('/api/bookings').set(authHeader(personas.member)).send({ class_id: later.id, booking_date: later.occurrence_date });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBERSHIP_ENDS_BEFORE_CLASS');
  });

  it('cancels bookings a class category change puts outside the member\'s plan', async () => {
    const aarav = userByEmail(personas.member);
    const booking = upcomingConfirmed(aarav.id)[0];
    const res = await api().put(`/api/classes/${booking.class_id}`).set(authHeader(personas.admin)).send({ category: 'Workout & Strength' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not in those members/);
    expect(db.bookings.find(b => b.id === booking.id)!.status).toBe('cancelled');
  });

  it('cancels bookings a narrower plan no longer covers', async () => {
    const aarav = userByEmail(personas.member);
    expect(upcomingConfirmed(aarav.id).length).toBeGreaterThan(0);
    const res = await api().put('/api/plans/plan_pro').set(authHeader(personas.admin)).send({ categories: ['Workout & Strength'] });
    expect(res.status).toBe(200);
    expect(upcomingConfirmed(aarav.id)).toHaveLength(0);
  });

  it('lets a class move to another day with a smaller capacity (its bookings are cancelled by the move)', async () => {
    const aarav = userByEmail(personas.member);
    const booking = upcomingConfirmed(aarav.id)[0];
    const cls = db.classes.find(c => c.id === booking.class_id)!;
    const res = await api()
      .put(`/api/classes/${cls.id}`)
      .set(authHeader(personas.admin))
      .send({ day_of_week: (cls.day_of_week % 6) + 1, capacity: 1 });
    expect(res.status).toBe(200);
  });
});

describe('member records', () => {
  it('refuse an active membership without a plan', async () => {
    const aarav = userByEmail(personas.member);
    const res = await api().put(`/api/members/${aarav.id}`).set(authHeader(personas.admin)).send({ membership_tier: 'none' });
    expect(res.status).toBe(400);
    expect(res.body.data.issues[0].path).toBe('membership_tier');
  });
});

describe('streaks from back-dated attendance', () => {
  it('a class marked attended later still bridges the run', async () => {
    const rohan = userByEmail(personas.basic);
    const tuesdayClass = db.classes.find(c => c.category === 'Workout & Strength' && c.day_of_week === 2)!;
    const log = (date: string) => ({
      id: `att_${date}`, user_id: rohan.id, user_name: rohan.name, check_in_time: `${date}T03:00:00.000Z`, check_in_method: 'qr' as const
    });
    db.attendance_logs = [...db.attendance_logs.filter(l => l.user_id !== rohan.id), log('2026-10-05'), log('2026-10-07')];
    db.bookings = [
      ...db.bookings,
      { id: 'bk_backdated', class_id: tuesdayClass.id, user_id: rohan.id, booking_date: '2026-10-06', status: 'confirmed', created_at: '2026-10-01T00:00:00.000Z' }
    ];
    db.users = db.users.map(u => (u.id === rohan.id ? { ...u, streak_days: 1, last_active_date: '2026-10-07' } : u));

    const res = await api().patch('/api/bookings/bk_backdated/attendance').set(authHeader(personas.admin)).send({ status: 'attended' });
    expect(res.status).toBe(200);
    expect(userByEmail(personas.basic).streak_days).toBeGreaterThanOrEqual(3);
  });
});

describe('retention on the admin dashboard', () => {
  it('counts each member once, ignores freezes and extensions, and only counts real lapses', async () => {
    const template = userByEmail(personas.member);
    const member = (id: string, extra: Partial<User>): User => ({
      ...template, id, email: `${id}@example.com`, qr_code_token: `QR-${id}`, membership_tier: 'pro', ...extra
    });
    const payment = (userId: string, n: number, start: string, end: string, createdAt: string): Payment => ({
      id: `pmt_${userId}_${n}`, invoice_number: `PF-2026-9${userId.length}${n}`, user_id: userId, user_name: userId, user_email: `${userId}@example.com`,
      order_id: `order_${userId}_${n}`, razorpay_payment_id: `pay_${userId}_${n}`, tier: 'pro', plan_name: 'Zumba & Cardio Pass',
      billing_cycle: 'monthly', amount_inr: 1499, currency: 'INR', status: 'paid', period_start: start, period_end: end, created_at: createdAt, source: 'seed'
    });

    db.users = [
      ...db.users.filter(u => u.role !== 'member'),
      member('renewed', { membership_status: 'active', membership_expiry: '2026-11-15' }),
      member('lapsed', { membership_status: 'active', membership_expiry: '2026-09-15' }),
      member('frozen', { membership_status: 'frozen', frozen_since: '2026-09-10', membership_expiry: '2026-09-15' }),
      member('extended', { membership_status: 'active', membership_expiry: '2026-10-30' })
    ];
    db.payments = [
      payment('renewed', 1, '2026-08-16', '2026-09-15', '2026-08-16T05:00:00.000Z'),
      payment('renewed', 2, '2026-09-16', '2026-11-15', '2026-09-14T05:00:00.000Z'),
      payment('lapsed', 1, '2026-08-16', '2026-09-15', '2026-08-16T05:00:00.000Z'),
      payment('frozen', 1, '2026-08-16', '2026-09-15', '2026-08-16T05:00:00.000Z'),
      payment('extended', 1, '2026-08-16', '2026-09-15', '2026-08-16T05:00:00.000Z')
    ];

    const res = await api().get('/api/analytics/dashboard').set(authHeader(personas.admin));
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.retentionRate).toBe(50);
  });
});

describe('payments captured after the member was deleted', () => {
  const secret = 'integration-webhook-secret';
  afterEach(() => {
    config.razorpay.webhookSecret = '';
  });

  it('are kept on the order for a refund instead of disappearing', async () => {
    config.razorpay.webhookSecret = secret;
    db.payment_orders = [
      ...db.payment_orders,
      { id: 'order_gone', user_id: 'usr_deleted', tier: 'pro', billing_cycle: 'monthly', amount_inr: 1499, currency: 'INR', status: 'created', created_at: NOW.toISOString() }
    ];
    const raw = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_gone', order_id: 'order_gone', amount: 149900, currency: 'INR', status: 'captured' } } }
    });
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(raw);
    expect(res.status).toBe(200);
    expect(db.payment_orders.find(o => o.id === 'order_gone')).toMatchObject({ status: 'orphaned', razorpay_payment_id: 'pay_gone' });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('seeded demo data', () => {
  it('has a turnstile check-in on every day a member attended a class or used the floor', () => {
    const checkedIn = new Set(db.attendance_logs.map(l => `${l.user_id}|${toGymDate(l.check_in_time)}`));
    for (const b of db.bookings.filter(b => b.status === 'attended')) {
      expect(checkedIn.has(`${b.user_id}|${b.booking_date}`), `${b.user_id} ${b.booking_date}`).toBe(true);
    }
    for (const s of db.time_sessions) {
      expect(checkedIn.has(`${s.user_id}|${toGymDate(s.clock_in_time)}`), `${s.user_id} ${s.clock_in_time}`).toBe(true);
    }
  });
});
