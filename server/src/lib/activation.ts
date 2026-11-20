import db from '../db/database.js';
import { computeActivation, nextInvoiceNumber, PaidTier } from './billing.js';
import { releaseUnentitledBookings } from './bookingRules.js';
import { gymToday } from './dates.js';
import { onPaidActivation } from './rewardEvents.js';
import { newId } from './users.js';
import { BillingCycle, GiftClaim, Payment, User } from '../types/index.js';

/** What the caller knows about the money: the gateway's ids for an online order, or the desk's record of a sale. */
export type PaymentDetails = Pick<Payment, 'order_id' | 'razorpay_payment_id' | 'amount_inr' | 'source'> &
  Partial<Pick<Payment, 'provider' | 'utr' | 'base_amount_inr' | 'discount_inr' | 'offer_id' | 'coupon_code' | 'desk_method' | 'recorded_by'>>;

/**
 * One paid activation, online (activateOrder) or a front-desk sale: extend or change the membership,
 * store the invoice, cancel upcoming bookings a new plan does not cover (as an admin's tier change
 * does) and grant the joining gifts. Never saves: the caller does, once it has written its own records.
 */
export function applyPaidActivation(
  user: User,
  purchase: { tier: PaidTier; billing_cycle: BillingCycle },
  details: PaymentDetails,
  today = gymToday()
): { payment: Payment; user: User; cancelledBookings: number; gifts: GiftClaim[] } {
  // Periods of the current plan bought at a sale or coupon price: a plan change credits them at what they cost.
  const discounted = db.payments.filter(p => p.user_id === user.id && p.status === 'paid' && p.tier === user.membership_tier && (p.discount_inr ?? 0) > 0);
  const activation = computeActivation(user, purchase, db.membership_plans, today, discounted);
  const plan = db.membership_plans.find(p => p.tier === purchase.tier);
  const { order_id, razorpay_payment_id, amount_inr, source, ...extra } = details;

  const payment: Payment = {
    id: newId('pmt'),
    invoice_number: nextInvoiceNumber(db.payments.map(p => p.invoice_number), today.slice(0, 4)),
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    order_id,
    razorpay_payment_id,
    ...extra,
    tier: purchase.tier,
    plan_name: plan?.name ?? purchase.tier,
    billing_cycle: purchase.billing_cycle,
    amount_inr,
    currency: 'INR',
    status: 'paid',
    period_start: activation.period_start,
    period_end: activation.period_end,
    created_at: new Date().toISOString(),
    source
  };

  const updatedUser: User = {
    ...user,
    membership_tier: activation.membership_tier,
    membership_status: activation.membership_status,
    membership_expiry: activation.membership_expiry,
    frozen_since: activation.frozen_since
  };

  db.users = db.users.map(u => (u.id === user.id ? updatedUser : u));
  const cancelledBookings =
    updatedUser.membership_tier !== user.membership_tier ? releaseUnentitledBookings({ userId: user.id }) : 0;
  db.payments = [...db.payments, payment];
  return { payment, user: updatedUser, cancelledBookings, gifts: onPaidActivation(updatedUser, payment) };
}
