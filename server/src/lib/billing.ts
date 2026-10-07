import crypto from 'crypto';
import { addDays, addMonths, daysBetween } from './dates.js';
import { effectiveStatus } from './membership.js';
import { BillingCycle, MembershipPlan, MembershipStatus, MembershipTier, User } from '../types/index.js';

// Membership maths for payments, kept free of database and clock access so every rule can be
// unit-tested with plain values. Dates are gym-local 'YYYY-MM-DD' strings; expiries are inclusive.

export type PaidTier = Exclude<MembershipTier, 'none'>;

export type MembershipState = Pick<User, 'membership_tier' | 'membership_status' | 'membership_expiry' | 'frozen_since'>;

export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, annual: 12 };

/** Price in whole rupees for one billing period of a plan. */
export function planPrice(plan: Pick<MembershipPlan, 'price_monthly' | 'price_annual'>, cycle: BillingCycle): number {
  return cycle === 'annual' ? plan.price_annual : plan.price_monthly;
}

/** Inclusive last day of a period of calendar months starting on `start`. */
export function periodEnd(start: string, cycle: BillingCycle): string {
  return addDays(addMonths(start, CYCLE_MONTHS[cycle]), -1);
}

/** Days of access lost while frozen: frozen on day F and back on day T gives T - F days. */
export function frozenDays(frozenSince: string | null | undefined, today: string): number {
  if (!frozenSince) return 0;
  return Math.max(0, daysBetween(frozenSince, today));
}

/** A frozen membership made active again, with the expiry pushed back by the days frozen. */
export function unfreezeMembership<T extends MembershipState>(state: T, today: string): T & { unfrozen_days: number } {
  if (state.membership_status !== 'frozen') return { ...state, unfrozen_days: 0 };
  const days = frozenDays(state.frozen_since, today);
  return {
    ...state,
    membership_status: 'active' as MembershipStatus,
    membership_expiry: state.membership_expiry ? addDays(state.membership_expiry, days) : state.membership_expiry,
    frozen_since: null,
    unfrozen_days: days
  };
}

/** Days still paid for on an active membership, counting today (the new plan replaces it today). */
export function remainingDays(expiry: string | null, today: string): number {
  if (!expiry || expiry < today) return 0;
  return daysBetween(today, expiry) + 1;
}

/** Unused days of the old plan converted into days of the new plan at the new plan's price. */
export function creditDays(remaining: number, oldPriceMonthly: number, newPriceMonthly: number): number {
  if (remaining <= 0 || oldPriceMonthly <= 0 || newPriceMonthly <= 0) return 0;
  return Math.floor((remaining * oldPriceMonthly) / newPriceMonthly);
}

export interface Activation {
  membership_tier: PaidTier;
  membership_status: 'active';
  membership_expiry: string;
  frozen_since: null;
  period_start: string;
  period_end: string; // inclusive, includes any credit days
  credit_days: number;
  unfrozen_days: number;
}

/**
 * The membership a member ends up with after paying for `purchase` today.
 * - A frozen member is unfrozen first.
 * - Same tier, still active: the new period starts the day after the current expiry.
 * - Otherwise it starts today, plus pro-rata credit for unused days of a different active plan.
 */
export function computeActivation(
  current: MembershipState,
  purchase: { tier: PaidTier; billing_cycle: BillingCycle },
  plans: Pick<MembershipPlan, 'tier' | 'price_monthly'>[],
  today: string
): Activation {
  const state = unfreezeMembership(current, today);
  const active = effectiveStatus(state, today) === 'active';

  let periodStart: string;
  let credit = 0;
  if (active && state.membership_tier === purchase.tier && state.membership_expiry) {
    periodStart = addDays(state.membership_expiry, 1);
  } else {
    periodStart = today;
    if (active && state.membership_tier !== 'none') {
      const oldPlan = plans.find(p => p.tier === state.membership_tier);
      const newPlan = plans.find(p => p.tier === purchase.tier);
      if (oldPlan && newPlan) {
        credit = creditDays(remainingDays(state.membership_expiry, today), oldPlan.price_monthly, newPlan.price_monthly);
      }
    }
  }

  const end = addDays(periodEnd(periodStart, purchase.billing_cycle), credit);
  return {
    membership_tier: purchase.tier,
    membership_status: 'active',
    membership_expiry: end,
    frozen_since: null,
    period_start: periodStart,
    period_end: end,
    credit_days: credit,
    unfrozen_days: state.unfrozen_days
  };
}

/** Next invoice number: PF-<year>-<6-digit sequence>, the sequence running on across years. */
export function nextInvoiceNumber(existing: string[], year: number | string): string {
  let max = 0;
  for (const inv of existing) {
    const m = /^PF-\d{4}-(\d+)$/.exec(inv);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PF-${year}-${String(max + 1).padStart(6, '0')}`;
}

/** HMAC-SHA256 (hex) of `payload`, compared with `signature` in constant time. */
export function hmacMatches(payload: string | Buffer, signature: unknown, secret: string): boolean {
  if (typeof signature !== 'string' || !secret) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex'), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
