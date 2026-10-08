import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { AttendanceLog, Booking, GymClass, Payment, TrialPass, User } from '../src/types/index.js';

// Wednesday 2026-10-07, 10:00 at the gym (IST). This week runs Mon 5 Oct - Sun 11 Oct.
const NOW = new Date('2026-10-07T04:30:00.000Z');

const dashboard = () => api().get('/api/analytics/dashboard').set(authHeader(personas.admin));

function member(id: string, patch: Partial<User>): User {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    role: 'member',
    avatar_url: '',
    phone: '',
    membership_tier: 'basic',
    membership_status: 'active',
    membership_expiry: '2026-12-31',
    qr_code_token: `QR-${id}`,
    created_at: '2026-01-01T00:00:00.000Z',
    ...patch
  };
}

function payment(id: string, patch: Partial<Payment>): Payment {
  return {
    id,
    invoice_number: `PF-2026-${id}`,
    user_id: 'm_basic',
    user_name: 'x',
    user_email: 'x@example.com',
    order_id: `order_${id}`,
    razorpay_payment_id: `pay_${id}`,
    tier: 'basic',
    plan_name: 'Workout & Strength Pass',
    billing_cycle: 'monthly',
    amount_inr: 1199,
    currency: 'INR',
    status: 'paid',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    created_at: '2026-10-01T05:00:00.000Z',
    source: 'seed',
    ...patch
  };
}

const log = (id: string, user_id: string, check_in_time: string): AttendanceLog => ({ id, user_id, check_in_time, check_in_method: 'qr' });
const booking = (id: string, class_id: string, booking_date: string, status: Booking['status']): Booking => ({
  id, class_id, user_id: 'm_basic', booking_date, status, created_at: '2026-10-01T00:00:00.000Z'
});
const trial = (id: string, created_at: string): TrialPass => ({
  id, code: `PULSE-TRIAL-${id}`, name: 'T', email: `${id}@t.com`, phone: '1', interest: 'Zumba & Cardio', valid_on: '2026-10-08', status: 'issued', created_at
});

describe('GET /analytics/dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('is for admins only', async () => {
    expect((await api().get('/api/analytics/dashboard')).status).toBe(401);
    expect((await api().get('/api/analytics/dashboard').set(authHeader(personas.member))).status).toBe(403);
    expect((await api().get('/api/analytics/dashboard').set(authHeader(personas.trainer))).status).toBe(403);
    const res = await dashboard();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['definitions', 'generatedAt', 'hourlyPeakCurve', 'kpis', 'revenueByMonth', 'tierDistribution', 'topClasses', 'weeklyAttendanceChart']
    );
  });

  it('shows zeros and no invented figures when nothing is stored (regression: hardcoded baselines)', async () => {
    db.users = [userByEmail(personas.admin)];
    db.payments = [];
    db.payment_orders = [];
    db.attendance_logs = [];
    db.bookings = [];
    db.trial_passes = [];
    db.classes = [];
    db.trainers = [];

    const { data } = (await dashboard()).body;
    expect(data.kpis).toEqual({
      totalMembers: 0, activeMembers: 0, frozenMembers: 0, expiredMembers: 0, pendingMembers: 0,
      monthlyRevenue: 0, revenueThisMonth: 0, todayCheckIns: 0, avgFillRate: 0, retentionRate: null,
      totalTrainers: 0, classesScheduled: 0, trialsThisMonth: 0
    });
    expect(data.weeklyAttendanceChart).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, visits: 0 })));
    expect(data.hourlyPeakCurve).toHaveLength(17);
    expect(data.hourlyPeakCurve[0]).toEqual({ hour: '06:00', checkIns: 0 });
    expect(data.hourlyPeakCurve[16]).toEqual({ hour: '22:00', checkIns: 0 });
    expect(data.hourlyPeakCurve.every((h: any) => h.checkIns === 0)).toBe(true);
    // No phantom member per tier.
    expect(data.tierDistribution.map((t: any) => [t.tier, t.count, t.revenue])).toEqual([['basic', 0, 0], ['pro', 0, 0], ['vip', 0, 0]]);
    expect(data.topClasses).toEqual([]);
    expect(data.revenueByMonth).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(month => ({ month, revenue: 0 })));
    expect(data.generatedAt).toBe(NOW.toISOString());
  });

  it('derives every figure from stored records in gym time', async () => {
    const admin = userByEmail(personas.admin);
    db.users = [
      admin,
      member('m_basic', { membership_tier: 'basic' }),
      member('m_vip', { membership_tier: 'vip' }),
      member('m_pro', { membership_tier: 'pro' }), // no payment: priced from the plan
      member('m_frozen', { membership_tier: 'pro', membership_status: 'frozen', frozen_since: '2026-10-01' }),
      member('m_lapsed', { membership_tier: 'basic', membership_status: 'active', membership_expiry: '2026-09-10' }), // stored active, effectively expired
      member('m_pending', { membership_tier: 'none', membership_status: 'pending', membership_expiry: null }),
      member('m_trainer', { role: 'trainer', membership_tier: 'vip' })
    ];
    db.membership_plans = db.membership_plans.map(p => (p.tier === 'pro' ? { ...p, price_monthly: 850 } : p));
    db.payments = [
      // m_basic renewed: an earlier period ended 20 days ago, then a new payment.
      payment('p1', { user_id: 'm_basic', period_start: '2026-08-18', period_end: '2026-09-17', created_at: '2026-08-18T05:00:00.000Z' }),
      payment('p2', { user_id: 'm_basic', amount_inr: 1199, period_start: '2026-09-18', period_end: '2026-10-17', created_at: '2026-09-18T05:00:00.000Z' }),
      // m_vip on an annual plan: 19188 / 12 = 1599 a month. Paid 00:30 IST on 1 Oct (still 30 Sep in UTC).
      payment('p3', { user_id: 'm_vip', tier: 'vip', billing_cycle: 'annual', amount_inr: 19188, period_start: '2026-10-01', period_end: '2027-09-30', created_at: '2026-09-30T19:00:00.000Z' }),
      // Refunds are not revenue.
      payment('p4', { user_id: 'm_pro', tier: 'pro', amount_inr: 999, status: 'refunded', created_at: '2026-10-02T05:00:00.000Z' }),
      // A payment for a member who has since been deleted; it still counts as revenue.
      payment('p5', { user_id: 'm_gone', amount_inr: 500, period_start: '2026-05-01', period_end: '2026-05-31', created_at: '2026-05-01T05:00:00.000Z' })
    ];
    db.attendance_logs = [
      log('a1', 'm_basic', '2026-10-07T01:00:00.000Z'), // 06:30 IST Wed (today)
      log('a2', 'm_vip', '2026-10-06T18:45:00.000Z'), // 00:15 IST Wed: today at the gym, though UTC says Tuesday
      log('a3', 'm_basic', '2026-10-05T13:00:00.000Z'), // 18:30 IST Mon
      log('a4', 'trial_x', '2026-09-12T13:10:00.000Z'), // 18:40 IST Sat, 25 days ago: weekly and hourly
      log('a5', 'm_basic', '2026-09-09T13:10:00.000Z'), // Wed 28 days ago: hourly only (the 28-day window starts 10 Sep)
      log('a6', 'm_vip', '2026-09-07T13:10:00.000Z') // 30 days ago: outside both windows
    ];
    const cls = (id: string, title: string, day_of_week: number, capacity: number, trainer_id = 'trn_vikram'): GymClass => ({
      id, title, category: 'Workout & Strength', trainer_id, trainer_name: 'Stale Name', day_of_week, start_time: '18:00',
      duration_minutes: 60, room: 'A', capacity, intensity: 'High', description: '', image_url: '', calories_burn_est: 300
    });
    db.classes = [cls('c_wed', 'Wednesday Lift', 3, 10), cls('c_mon', 'Monday Lift', 1, 10), cls('c_sun', 'Sunday Stretch', 0, 20)];
    db.bookings = [
      booking('b1', 'c_wed', '2026-10-07', 'confirmed'),
      booking('b2', 'c_wed', '2026-10-07', 'confirmed'),
      booking('b3', 'c_wed', '2026-10-07', 'attended'),
      booking('b4', 'c_wed', '2026-10-07', 'cancelled'),
      booking('b5', 'c_wed', '2026-10-07', 'no_show'),
      booking('b6', 'c_wed', '2026-10-14', 'confirmed'), // next week
      booking('b7', 'c_mon', '2026-10-05', 'attended'),
      booking('b8', 'c_sun', '2026-10-04', 'confirmed'), // last Sunday: last week
      booking('b9', 'c_sun', '2026-10-11', 'confirmed') // this Sunday
    ];
    db.trial_passes = [trial('t1', '2026-10-03T05:00:00.000Z'), trial('t2', '2026-09-30T19:30:00.000Z'), trial('t3', '2026-09-20T05:00:00.000Z')];
    const trainerName = db.trainers.find(t => t.id === 'trn_vikram')!.name;

    const { data } = (await dashboard()).body;

    expect(data.kpis).toEqual({
      totalMembers: 6,
      activeMembers: 3,
      frozenMembers: 1,
      expiredMembers: 1,
      pendingMembers: 1,
      monthlyRevenue: 1199 + 1599 + 850,
      revenueThisMonth: 19188,
      todayCheckIns: 2,
      avgFillRate: 12.5, // (3 + 1 + 1) / (10 + 10 + 20)
      // Ended in the last 90 days: p1 (renewed by p2) and m_lapsed's expiry (not renewed).
      retentionRate: 50,
      totalTrainers: db.trainers.length,
      classesScheduled: 3,
      trialsThisMonth: 2
    });

    const visits = Object.fromEntries(data.weeklyAttendanceChart.map((d: any) => [d.day, d.visits]));
    expect(visits).toEqual({ Mon: 1, Tue: 0, Wed: 2, Thu: 0, Fri: 0, Sat: 1, Sun: 0 });

    const hours = Object.fromEntries(data.hourlyPeakCurve.map((h: any) => [h.hour, h.checkIns]));
    expect(hours['06:00']).toBe(1);
    expect(hours['18:00']).toBe(3);
    expect(data.hourlyPeakCurve.reduce((s: number, h: any) => s + h.checkIns, 0)).toBe(4); // the 00:15 visit is outside opening hours

    expect(data.tierDistribution).toEqual([
      { name: expect.any(String), tier: 'basic', count: 1, revenue: 1199, color: expect.any(String) },
      { name: expect.any(String), tier: 'pro', count: 1, revenue: 850, color: expect.any(String) },
      { name: expect.any(String), tier: 'vip', count: 1, revenue: 1599, color: expect.any(String) }
    ]);

    expect(data.topClasses[0]).toEqual({
      id: 'c_wed', title: 'Wednesday Lift', category: 'Workout & Strength', trainer: trainerName, booked: 3, capacity: 10, occupancy: 30
    });
    expect(data.topClasses.map((c: any) => c.id)).toEqual(['c_wed', 'c_mon', 'c_sun']);

    expect(data.revenueByMonth).toEqual([
      { month: '2026-05', revenue: 500 },
      { month: '2026-06', revenue: 0 },
      { month: '2026-07', revenue: 0 },
      { month: '2026-08', revenue: 1199 },
      { month: '2026-09', revenue: 1199 },
      { month: '2026-10', revenue: 19188 }
    ]);

    for (const key of ['monthlyRevenue', 'avgFillRate', 'retentionRate']) {
      expect(typeof data.definitions[key]).toBe('string');
      expect(data.definitions[key].length).toBeGreaterThan(20);
    }
  });

  it('prices an active member from their latest payment, monthly equivalent', async () => {
    db.users = [
      userByEmail(personas.admin),
      member('m1', { membership_tier: 'pro' })
    ];
    db.payments = [
      payment('old', { user_id: 'm1', tier: 'basic', amount_inr: 1199, created_at: '2026-01-01T00:00:00.000Z', period_end: '2026-01-31' }),
      payment('new', { user_id: 'm1', tier: 'pro', billing_cycle: 'annual', amount_inr: 14388, created_at: '2026-02-01T00:00:00.000Z', period_end: '2027-01-31' })
    ];
    const { data } = (await dashboard()).body;
    expect(data.kpis.monthlyRevenue).toBe(1199);
    expect(data.kpis.retentionRate).toBeNull(); // nothing ended in the last 90 days
  });

  it('counts a membership whose period ended without a renewal as lost', async () => {
    db.users = [userByEmail(personas.admin), member('m1', { membership_status: 'expired', membership_expiry: '2026-09-17' })];
    db.payments = [payment('only', { user_id: 'm1', period_end: '2026-09-17', created_at: '2026-08-18T00:00:00.000Z' })];
    const { data } = (await dashboard()).body;
    expect(data.kpis.retentionRate).toBe(0);
    expect(data.kpis.expiredMembers).toBe(1);
    expect(data.kpis.monthlyRevenue).toBe(0);
  });
});
