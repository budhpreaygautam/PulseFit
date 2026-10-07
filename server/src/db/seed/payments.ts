import db from '../database.js';
import { CYCLE_MONTHS, PaidTier, periodEnd, planPrice } from '../../lib/billing.js';
import { addDays, addMonths, gymDateTime, gymToday, toGymDate } from '../../lib/dates.js';
import { newId } from '../../lib/users.js';
import { BillingCycle, MembershipStatus, Payment, PaymentOrder } from '../../types/index.js';

// Demo data owned by the payments domain. Called by seedDatabase() after the base data
// (users, trainers, classes, exercises, plans) has been written.
//
// Each seeded member gets an unbroken run of paid periods ending with their current one, and
// their membership_* fields are set from that history so invoices, expiry and status agree.
// Dates are relative to today so the demo always looks current.

interface History {
  userId: string;
  // Oldest first; the last entry is the current (or, for a lapsed member, the final) period.
  periods: { tier: PaidTier; cycle: BillingCycle }[];
  // The last period either started `lastStartDaysAgo` days ago or ended on `lastEnd`.
  lastStartDaysAgo?: number;
  lastEnd?: string;
  status: MembershipStatus;
}

const monthly = (tier: PaidTier, count: number) => Array.from({ length: count }, () => ({ tier, cycle: 'monthly' as const }));

export function seedPayments(): void {
  const today = gymToday();
  // Dev's last basic month ran out on 2026-08-01; on an earlier clock keep him lapsed a month.
  const devLastEnd = addDays(today, -30) < '2026-08-01' ? addDays(today, -30) : '2026-08-01';

  const histories: History[] = [
    // Aarav: three months of Zumba & Cardio, then switched to the annual pass.
    { userId: 'usr_member_1', periods: [...monthly('pro', 3), { tier: 'pro', cycle: 'annual' }], lastStartDaysAgo: 40, status: 'active' },
    // Ananya: six months of All-Access, then the annual plan.
    { userId: 'usr_member_2', periods: [...monthly('vip', 6), { tier: 'vip', cycle: 'annual' }], lastStartDaysAgo: 52, status: 'active' },
    { userId: 'usr_member_3', periods: monthly('basic', 6), lastStartDaysAgo: 6, status: 'active' },
    { userId: 'usr_member_4', periods: monthly('pro', 7), lastStartDaysAgo: 12, status: 'active' },
    { userId: 'usr_member_5', periods: monthly('basic', 10), lastEnd: devLastEnd, status: 'expired' }
  ];

  const orders: PaymentOrder[] = [];
  const payments: Omit<Payment, 'invoice_number'>[] = [];
  const memberships = new Map<string, { tier: PaidTier; expiry: string; status: MembershipStatus }>();

  for (const h of histories) {
    const user = db.users.find(u => u.id === h.userId);
    if (!user) continue;

    // Build the periods backwards from the last one so they join up day to day.
    const last = h.periods[h.periods.length - 1];
    let start = h.lastEnd ? addMonths(addDays(h.lastEnd, 1), -CYCLE_MONTHS[last.cycle]) : addDays(today, -(h.lastStartDaysAgo ?? 0));
    let end = h.lastEnd ?? periodEnd(start, last.cycle);
    const spans: { start: string; end: string }[] = [{ start, end }];
    for (let i = h.periods.length - 2; i >= 0; i--) {
      end = addDays(start, -1);
      start = addMonths(start, -CYCLE_MONTHS[h.periods[i].cycle]);
      spans.unshift({ start, end });
    }

    h.periods.forEach((p, i) => {
      const plan = db.membership_plans.find(pl => pl.tier === p.tier)!;
      // The first purchase is made on the day it starts; renewals a couple of days early.
      const paidOn = i === 0 ? spans[i].start : addDays(spans[i].start, -2);
      const paidAt = gymDateTime(paidOn, `${String(9 + ((i * 3) % 10)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}`).toISOString();
      const orderId = newId('order');
      const amount = planPrice(plan, p.cycle);
      orders.push({
        id: orderId,
        user_id: user.id,
        tier: p.tier,
        billing_cycle: p.cycle,
        amount_inr: amount,
        currency: 'INR',
        status: 'paid',
        created_at: paidAt,
        paid_at: paidAt
      });
      payments.push({
        id: newId('pmt'),
        user_id: user.id,
        user_name: user.name,
        user_email: user.email,
        order_id: orderId,
        razorpay_payment_id: newId('pay'),
        tier: p.tier,
        plan_name: plan.name,
        billing_cycle: p.cycle,
        amount_inr: amount,
        currency: 'INR',
        status: 'paid',
        period_start: spans[i].start,
        period_end: spans[i].end,
        created_at: paidAt,
        source: 'seed'
      });
    });

    memberships.set(user.id, { tier: last.tier, expiry: spans[spans.length - 1].end, status: h.status });
  }

  payments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  db.payment_orders = orders;
  db.payments = payments.map((p, i) => ({
    ...p,
    invoice_number: `PF-${toGymDate(p.created_at).slice(0, 4)}-${String(i + 1).padStart(6, '0')}`
  }));

  db.users = db.users.map(u => {
    const m = memberships.get(u.id);
    if (!m) return u;
    return { ...u, membership_tier: m.tier, membership_status: m.status, membership_expiry: m.expiry, frozen_since: null };
  });
}
