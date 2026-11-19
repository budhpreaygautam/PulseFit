import db from '../db/database.js';
import { PaidTier, planPrice } from './billing.js';
import { displayDate, gymToday } from './dates.js';
import { badRequest, notFound } from './http.js';
import { BillingCycle, Coupon, Offer, PaymentOrder } from '../types/index.js';

// What a plan costs a member right now: the list price less the best single discount, the live
// sale or a valid coupon (never both), and never below ₹1. createOrder charges exactly this, so
// the browser never sends a price.

export type AppliedDiscount = { type: 'offer'; id: string; label: string } | { type: 'coupon'; code: string; label: string };

export interface Quote {
  tier: PaidTier;
  billing_cycle: BillingCycle;
  base: number;
  discount: number;
  total: number;
  applied: AppliedDiscount | null;
  offer_ends_at?: string;
}

const COUPON_CODE = /^[A-Z0-9]{4,16}$/;

/** How long an order keeps its price: a sale or coupon that ends meanwhile still holds for an order paid within this time. */
const PRICE_HOLD_MS = 30 * 60 * 1000;

export function planFor(tier: PaidTier) {
  const plan = db.membership_plans.find(p => p.tier === tier);
  if (!plan) throw notFound('That membership plan is not available.', 'PLAN_NOT_FOUND');
  return plan;
}

/** Whole rupees off: percentages round down, a flat amount never exceeds the price. */
export function discountOf(base: number, d: { percent_off: number | null; amount_off: number | null }): number {
  return d.percent_off !== null ? Math.floor((base * d.percent_off) / 100) : Math.min(d.amount_off ?? 0, base);
}

const effect = (d: { percent_off: number | null; amount_off: number | null }) =>
  d.percent_off !== null ? `${d.percent_off}% off` : `₹${(d.amount_off ?? 0).toLocaleString('en-IN')} off`;

// An empty list of tiers or cycles means all of them.
const covers = (d: Pick<Offer, 'tiers' | 'billing_cycles'>, tier: PaidTier, cycle: BillingCycle) =>
  (d.tiers.length === 0 || d.tiers.includes(tier)) && (d.billing_cycles.length === 0 || d.billing_cycles.includes(cycle));

/** Active sales running at that instant (starts_at inclusive, ends_at exclusive). */
export function liveOffers(now = new Date()): Offer[] {
  const t = now.getTime();
  return db.offers.filter(o => o.active && Date.parse(o.starts_at) <= t && t < Date.parse(o.ends_at));
}

export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase();
}

/** The coupon a member typed, or the 400 that says what is wrong with it. */
function usableCoupon(userId: string, input: string, tier: PaidTier, cycle: BillingCycle, today: string): Coupon {
  const code = normalizeCouponCode(input);
  const coupon = COUPON_CODE.test(code) ? db.coupons.find(c => c.code === code) : undefined;
  if (!coupon || !coupon.active || today < coupon.valid_from) {
    throw badRequest('That coupon code is not valid. Check it and try again.', 'COUPON_INVALID');
  }
  if (today > coupon.valid_until) throw badRequest(`Coupon ${code} expired on ${displayDate(coupon.valid_until)}.`, 'COUPON_EXPIRED');
  if (!covers(coupon, tier, cycle)) {
    throw badRequest(`Coupon ${code} does not apply to the ${planFor(tier).name} ${cycle} plan.`, 'COUPON_NOT_FOR_PLAN');
  }
  if (coupon.max_uses !== null && coupon.uses >= coupon.max_uses) throw badRequest(`Coupon ${code} has been used up.`, 'COUPON_USED_UP');
  if (paidUses(userId, code) >= coupon.per_member_limit) throw badRequest(`You have already used coupon ${code}.`, 'COUPON_USED_UP');
  return coupon;
}

const paidUses = (userId: string, code: string) => db.payments.filter(p => p.user_id === userId && p.status === 'paid' && p.coupon_code === code).length;

/**
 * Whether the discount an order was priced with still holds when its money arrives. The member's own
 * coupon limit always counts, since every open order passed it while nothing was paid; a sale that
 * ended, or a coupon that expired or was switched off, holds only for an order paid within
 * PRICE_HOLD_MS. A coupon that ran out of uses meanwhile is still honoured.
 */
export function discountHolds(order: PaymentOrder, now = new Date()): boolean {
  if (!order.discount_inr) return true;
  const fresh = now.getTime() - Date.parse(order.created_at) <= PRICE_HOLD_MS;
  if (order.coupon_code) {
    const coupon = db.coupons.find(c => c.code === order.coupon_code);
    if (coupon && paidUses(order.user_id, coupon.code) >= coupon.per_member_limit) return false;
    const today = gymToday(now);
    return fresh || (!!coupon && coupon.active && coupon.valid_from <= today && today <= coupon.valid_until);
  }
  return fresh || liveOffers(now).some(o => o.id === order.offer_id);
}

/** The price of a plan for this member now. A coupon code (already trimmed; undefined = none) that does not work throws 400 COUPON_*. */
export function quoteFor(userId: string, tier: PaidTier, cycle: BillingCycle, couponCode?: string, now = new Date()): Quote {
  const base = planPrice(planFor(tier), cycle);
  const offer = liveOffers(now)
    .filter(o => covers(o, tier, cycle))
    .reduce<Offer | undefined>((best, o) => (!best || discountOf(base, o) > discountOf(base, best) ? o : best), undefined);
  const coupon = couponCode === undefined ? undefined : usableCoupon(userId, couponCode, tier, cycle, gymToday(now));

  const offerOff = offer ? discountOf(base, offer) : 0;
  const couponOff = coupon ? discountOf(base, coupon) : 0;
  // A tie goes to the offer.
  const useOffer = offer !== undefined && offerOff >= couponOff;
  const total = Math.max(1, base - (useOffer ? offerOff : couponOff));
  const discount = base - total;
  let applied: AppliedDiscount | null = null;
  if (discount > 0 && useOffer) applied = { type: 'offer', id: offer.id, label: effect(offer) };
  else if (discount > 0 && coupon) applied = { type: 'coupon', code: coupon.code, label: `${coupon.code}: ${effect(coupon)}` };

  return { tier, billing_cycle: cycle, base, discount, total, applied, ...(applied?.type === 'offer' ? { offer_ends_at: offer!.ends_at } : {}) };
}

/** What guests may see of a sale: the headline and its end, never codes or targeting ids. */
export function guestSale(o: Offer): { title: string; banner_text: string; percent_off: number | null; amount_off: number | null; ends_at: string } {
  return { title: o.title, banner_text: o.banner_text, percent_off: o.percent_off, amount_off: o.amount_off, ends_at: o.ends_at };
}
