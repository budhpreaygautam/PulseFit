import { Request, Response } from 'express';
import db from '../db/database.js';
import { asyncHandler, ok } from '../lib/http.js';
import { addDays, addMonths, dayOfWeek, gymHour, gymToday, startOfWeek, toGymDate } from '../lib/dates.js';
import { effectiveStatus } from '../lib/membership.js';
import { MembershipTier, Payment, User } from '../types/index.js';

// Admin dashboard. Every figure is derived from stored records at request time; when there is
// no data the figure is 0 (or null where a rate has no denominator), never a placeholder.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const OPEN_HOUR = 6;
const CLOSE_HOUR = 22;
const TIER_COLORS: Record<string, string> = { basic: '#38bdf8', pro: '#84cc16', vip: '#f59e0b' };

const DEFINITIONS = {
  monthlyRevenue:
    'Monthly recurring revenue: for every member with an active membership, the monthly equivalent of their latest payment (annual plans divided by 12), or their plan\'s monthly price if they have no payment on record.',
  avgFillRate:
    'Spots booked (confirmed or attended) as a share of total capacity across this week\'s class occurrences, Monday to Sunday.',
  retentionRate:
    'Of the membership periods that ended in the last 90 days, the share whose member paid for another period; empty when no period ended in that window.'
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);

/** Monday-first index (0 = Mon … 6 = Sun) of a gym-local date. */
const mondayIndex = (date: string) => (dayOfWeek(date) + 6) % 7;

export const getDashboardKPIs = asyncHandler((_req: Request, res: Response) => {
  const now = new Date();
  const today = gymToday(now);
  const monthPrefix = today.slice(0, 7);

  const members = db.users.filter(u => u.role === 'member');
  const statusOf = new Map(members.map(m => [m.id, effectiveStatus(m, today)]));
  const countStatus = (s: string) => members.filter(m => statusOf.get(m.id) === s).length;
  const activeMembers = members.filter(m => statusOf.get(m.id) === 'active');

  const paidPayments = db.payments.filter(p => p.status === 'paid');
  const paymentsByUser = new Map<string, Payment[]>();
  for (const p of paidPayments) {
    paymentsByUser.set(p.user_id, [...(paymentsByUser.get(p.user_id) || []), p]);
  }
  const latestPayment = (userId: string) =>
    (paymentsByUser.get(userId) || []).reduce<Payment | undefined>(
      (latest, p) => (!latest || p.created_at > latest.created_at ? p : latest),
      undefined
    );

  // ---- MRR ----
  const planFor = (tier: MembershipTier) => db.membership_plans.find(p => p.tier === tier);
  const monthlyValue = (member: User): number => {
    const payment = latestPayment(member.id);
    if (payment) return payment.billing_cycle === 'annual' ? payment.amount_inr / 12 : payment.amount_inr;
    return planFor(member.membership_tier)?.price_monthly ?? 0;
  };
  const monthlyRevenue = Math.round(activeMembers.reduce((sum, m) => sum + monthlyValue(m), 0));

  const revenueThisMonth = paidPayments
    .filter(p => toGymDate(p.created_at).startsWith(monthPrefix))
    .reduce((sum, p) => sum + p.amount_inr, 0);

  // ---- Check-ins ----
  const checkInDates = db.attendance_logs.map(log => ({ date: toGymDate(log.check_in_time), hour: gymHour(log.check_in_time) }));
  const todayCheckIns = checkInDates.filter(c => c.date === today).length;

  const since28 = addDays(today, -27);
  const visitsByDay = WEEKDAYS.map(() => 0);
  for (const c of checkInDates) {
    if (c.date >= since28 && c.date <= today) visitsByDay[mondayIndex(c.date)] += 1;
  }
  const weeklyAttendanceChart = WEEKDAYS.map((day, i) => ({ day, visits: visitsByDay[i] }));

  const since30 = addDays(today, -29);
  const hourly = new Map<number, number>();
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) hourly.set(h, 0);
  for (const c of checkInDates) {
    if (c.date >= since30 && c.date <= today && hourly.has(c.hour)) hourly.set(c.hour, hourly.get(c.hour)! + 1);
  }
  const hourlyPeakCurve = [...hourly].map(([h, checkIns]) => ({ hour: `${String(h).padStart(2, '0')}:00`, checkIns }));

  // ---- This week's class occurrences ----
  const weekStart = startOfWeek(today);
  const occurrences = db.classes.map(c => {
    const date = addDays(weekStart, (c.day_of_week + 6) % 7);
    const booked = db.bookings.filter(
      b => b.class_id === c.id && b.booking_date === date && (b.status === 'confirmed' || b.status === 'attended')
    ).length;
    return { cls: c, date, booked, capacity: Math.max(0, c.capacity || 0) };
  });
  const totalBooked = occurrences.reduce((sum, o) => sum + o.booked, 0);
  const totalCapacity = occurrences.reduce((sum, o) => sum + o.capacity, 0);

  const trainerName = (id: string) => db.trainers.find(t => t.id === id)?.name ?? null;
  const topClasses = [...occurrences]
    .sort((a, b) => b.booked - a.booked || percent(b.booked, b.capacity) - percent(a.booked, a.capacity) || a.cls.title.localeCompare(b.cls.title))
    .slice(0, 5)
    .map(o => ({
      id: o.cls.id,
      title: o.cls.title,
      category: o.cls.category,
      trainer: trainerName(o.cls.trainer_id),
      booked: o.booked,
      capacity: o.capacity,
      occupancy: o.capacity > 0 ? Math.round((o.booked / o.capacity) * 100) : 0
    }));

  // ---- Retention ----
  // A period is a paid payment, or a member's stored expiry when no payment covers it
  // (members created by an admin). It is renewed when the same member paid again later.
  const windowStart = addDays(today, -90);
  const inWindow = (end: string) => end >= windowStart && end < today;
  let periodsEnded = 0;
  let periodsRenewed = 0;
  for (const p of paidPayments) {
    if (!inWindow(p.period_end)) continue;
    periodsEnded++;
    if ((paymentsByUser.get(p.user_id) || []).some(other => other.id !== p.id && other.created_at > p.created_at)) {
      periodsRenewed++;
    }
  }
  for (const m of members) {
    if (!m.membership_expiry || statusOf.get(m.id) === 'frozen' || !inWindow(m.membership_expiry)) continue;
    if ((paymentsByUser.get(m.id) || []).some(p => p.period_end === m.membership_expiry)) continue;
    periodsEnded++;
  }
  const retentionRate = periodsEnded > 0 ? round1((periodsRenewed / periodsEnded) * 100) : null;

  // ---- Tiers ----
  const tierDistribution = [...db.membership_plans]
    .sort((a, b) => a.price_monthly - b.price_monthly)
    .map(plan => {
      const onTier = activeMembers.filter(m => m.membership_tier === plan.tier);
      return {
        name: plan.name,
        tier: plan.tier,
        count: onTier.length,
        revenue: Math.round(onTier.reduce((sum, m) => sum + monthlyValue(m), 0)),
        color: TIER_COLORS[plan.tier] ?? '#94a3b8'
      };
    });

  // ---- Revenue by month (last 6, oldest first) ----
  const firstOfMonth = `${monthPrefix}-01`;
  const revenueByMonth = [5, 4, 3, 2, 1, 0].map(back => {
    const month = addMonths(firstOfMonth, -back).slice(0, 7);
    const revenue = paidPayments
      .filter(p => toGymDate(p.created_at).startsWith(month))
      .reduce((sum, p) => sum + p.amount_inr, 0);
    return { month, revenue };
  });

  const trialsThisMonth = db.trial_passes.filter(t => toGymDate(t.created_at).startsWith(monthPrefix)).length;

  return ok(res, {
    kpis: {
      totalMembers: members.length,
      activeMembers: activeMembers.length,
      frozenMembers: countStatus('frozen'),
      expiredMembers: countStatus('expired'),
      pendingMembers: countStatus('pending'),
      monthlyRevenue,
      revenueThisMonth,
      todayCheckIns,
      avgFillRate: percent(totalBooked, totalCapacity),
      retentionRate,
      totalTrainers: db.trainers.length,
      classesScheduled: db.classes.length,
      trialsThisMonth
    },
    weeklyAttendanceChart,
    hourlyPeakCurve,
    tierDistribution,
    topClasses,
    revenueByMonth,
    definitions: DEFINITIONS,
    generatedAt: now.toISOString()
  });
});
