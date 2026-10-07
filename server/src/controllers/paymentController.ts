import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import { z } from 'zod';
import config, { paymentsEnabled } from '../config.js';
import db from '../db/database.js';
import { computeActivation, hmacMatches, nextInvoiceNumber, PaidTier, planPrice } from '../lib/billing.js';
import { gymToday } from '../lib/dates.js';
import { ApiError, asyncHandler, badRequest, conflict, forbidden, notFound, ok, parse, unavailable } from '../lib/http.js';
import { newId, toSafeUser } from '../lib/users.js';
import { AuthenticatedRequest, generateToken } from '../middleware/auth.js';
import { BillingCycle, Payment, PaymentOrder, SafeUser } from '../types/index.js';

// Checkout flow: create-order fixes the plan, cycle and price on a server-side PaymentOrder;
// verify (from the browser) and the webhook (from Razorpay) both activate that order, and
// whichever arrives first wins. Nothing about price or tier is read from the client.

/** The part of the Razorpay SDK this controller uses, so tests can substitute a fake. */
export interface RazorpayOrdersClient {
  orders: {
    create(params: {
      amount: number;
      currency: string;
      receipt: string;
      notes: Record<string, string>;
    }): Promise<{ id: string; amount: number | string; currency: string }>;
  };
}

let testClient: RazorpayOrdersClient | null = null;
let sdkClient: { client: RazorpayOrdersClient; keyId: string; keySecret: string } | null = null;

/** Replace the Razorpay client in tests; pass null to go back to the real SDK. */
export function setRazorpayClientForTests(client: RazorpayOrdersClient | null): void {
  testClient = client;
}

function getRazorpay(): RazorpayOrdersClient {
  if (!paymentsEnabled()) {
    throw unavailable('Online payments are not configured on this server.', 'PAYMENTS_DISABLED');
  }
  if (testClient) return testClient;
  const { keyId, keySecret } = config.razorpay;
  if (!sdkClient || sdkClient.keyId !== keyId || sdkClient.keySecret !== keySecret) {
    sdkClient = { client: new Razorpay({ key_id: keyId, key_secret: keySecret }), keyId, keySecret };
  }
  return sdkClient.client;
}

function planFor(tier: PaidTier) {
  const plan = db.membership_plans.find(p => p.tier === tier);
  if (!plan) throw notFound('That membership plan is not available.', 'PLAN_NOT_FOUND');
  return plan;
}

function describePurchase(planName: string, cycle: BillingCycle): string {
  return `${planName} (${cycle === 'annual' ? '12 months, billed once' : '1 month'})`;
}

const createOrderSchema = z.object({
  tier: z.enum(['basic', 'pro', 'vip']),
  billing_cycle: z.enum(['monthly', 'annual'])
});

export const createOrder = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const razorpay = getRazorpay();
  const { tier, billing_cycle } = parse(createOrderSchema, req.body);
  const user = req.user!;
  const plan = planFor(tier);
  const amountInr = planPrice(plan, billing_cycle);

  let order: Awaited<ReturnType<RazorpayOrdersClient['orders']['create']>>;
  try {
    order = await razorpay.orders.create({
      amount: amountInr * 100,
      currency: 'INR',
      receipt: newId('rcpt'),
      notes: { user_id: user.id, tier, billing_cycle }
    });
  } catch (err) {
    console.error('Razorpay order creation failed:', err);
    throw new ApiError(502, 'We could not reach the payment provider. Please try again in a moment.', 'PAYMENT_PROVIDER_ERROR');
  }

  const record: PaymentOrder = {
    id: order.id,
    user_id: user.id,
    tier,
    billing_cycle,
    amount_inr: amountInr,
    currency: 'INR',
    status: 'created',
    created_at: new Date().toISOString()
  };
  db.payment_orders = [...db.payment_orders, record];

  ok(res, {
    orderId: order.id,
    amount: amountInr * 100,
    amount_inr: amountInr,
    currency: 'INR',
    keyId: config.razorpay.keyId,
    tier,
    billing_cycle,
    plan_name: plan.name,
    description: describePurchase(plan.name, billing_cycle)
  });
});

/**
 * Apply a paid order to its member: extend or change the membership and store the invoice.
 * Returns null when the order (or this payment id) has already been applied.
 */
function activateOrder(
  orderId: string,
  paymentId: string,
  source: Payment['source']
): { payment: Payment; user: SafeUser; token: string } | null {
  const order = db.payment_orders.find(o => o.id === orderId);
  if (!order) return null;
  if (order.status === 'paid' || db.payments.some(p => p.order_id === orderId || p.razorpay_payment_id === paymentId)) {
    return null;
  }
  const user = db.users.find(u => u.id === order.user_id);
  if (!user) return null;

  const today = gymToday();
  const activation = computeActivation(user, order, db.membership_plans, today);
  const plan = db.membership_plans.find(p => p.tier === order.tier);
  const now = new Date().toISOString();

  const payment: Payment = {
    id: newId('pmt'),
    invoice_number: nextInvoiceNumber(db.payments.map(p => p.invoice_number), today.slice(0, 4)),
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    order_id: order.id,
    razorpay_payment_id: paymentId,
    tier: order.tier,
    plan_name: plan?.name ?? order.tier,
    billing_cycle: order.billing_cycle,
    amount_inr: order.amount_inr,
    currency: 'INR',
    status: 'paid',
    period_start: activation.period_start,
    period_end: activation.period_end,
    created_at: now,
    source
  };

  const updatedUser = {
    ...user,
    membership_tier: activation.membership_tier,
    membership_status: activation.membership_status,
    membership_expiry: activation.membership_expiry,
    frozen_since: activation.frozen_since
  };

  db.users = db.users.map(u => (u.id === user.id ? updatedUser : u));
  db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? { ...o, status: 'paid' as const, paid_at: now } : o));
  db.payments = [...db.payments, payment];

  return { payment, user: toSafeUser(updatedUser), token: generateToken(updatedUser) };
}

const verifySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(100),
  razorpay_payment_id: z.string().trim().min(1).max(100),
  razorpay_signature: z.string().trim().min(1).max(200)
});

export const verifyPayment = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  if (!paymentsEnabled()) {
    throw unavailable('Online payments are not configured on this server.', 'PAYMENTS_DISABLED');
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parse(verifySchema, req.body);

  if (!hmacMatches(`${razorpay_order_id}|${razorpay_payment_id}`, razorpay_signature, config.razorpay.keySecret)) {
    throw badRequest('We could not confirm this payment with Razorpay. If you were charged, contact the front desk.', 'INVALID_SIGNATURE');
  }

  const order = db.payment_orders.find(o => o.id === razorpay_order_id);
  if (!order) throw notFound('We have no record of this order.', 'ORDER_NOT_FOUND');
  if (order.user_id !== req.user!.id) throw forbidden('This order belongs to another account.', 'ORDER_NOT_YOURS');

  const result = activateOrder(order.id, razorpay_payment_id, 'checkout');
  if (!result) {
    const current = db.users.find(u => u.id === req.user!.id)!;
    throw conflict('This payment has already been applied to your membership.', 'ALREADY_PROCESSED', {
      user: toSafeUser(current)
    });
  }

  const message = `Payment received. Your ${result.payment.plan_name} is active until ${result.payment.period_end}.`;
  ok(res, { user: result.user, token: result.token, payment: result.payment, message }, message);
});

interface WebhookEvent {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string } };
    order?: { entity?: { id?: string; amount_paid?: number } };
  };
}

/** Razorpay server-to-server notifications. Mounted behind express.raw, so req.body is a Buffer. */
export const paymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const secret = config.razorpay.webhookSecret;
  if (!secret) throw unavailable('Payment webhooks are not configured on this server.', 'WEBHOOK_DISABLED');
  if (!Buffer.isBuffer(req.body)) throw badRequest('Expected a JSON webhook body.', 'BAD_PAYLOAD');

  if (!hmacMatches(req.body, req.header('x-razorpay-signature'), secret)) {
    throw badRequest('Webhook signature does not match.', 'INVALID_SIGNATURE');
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    throw badRequest('The webhook body is not valid JSON.', 'BAD_JSON');
  }

  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;
  const order = orderId ? db.payment_orders.find(o => o.id === orderId) : undefined;

  // Unknown orders (not membership checkouts) and repeats are acknowledged, so Razorpay stops retrying.
  if (order && payment?.id) {
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      if (payment.amount !== undefined && payment.amount !== order.amount_inr * 100) {
        console.warn(`Webhook ${event.event} for ${order.id}: paid ${payment.amount} paise, expected ${order.amount_inr * 100}; not activated.`);
      } else {
        activateOrder(order.id, payment.id, 'webhook');
      }
    } else if (event.event === 'payment.failed' && order.status === 'created') {
      db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? { ...o, status: 'failed' as const } : o));
    }
  }

  ok(res, { received: true });
});

export const getMyPayments = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  ok(res, newestFirst(db.payments.filter(p => p.user_id === req.user!.id)));
});

const listPaymentsSchema = z.object({ user_id: z.string().trim().min(1).max(100).optional() });

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const { user_id } = parse(listPaymentsSchema, req.query);
  ok(res, newestFirst(user_id ? db.payments.filter(p => p.user_id === user_id) : db.payments));
});

function newestFirst(payments: Payment[]): Payment[] {
  return [...payments].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.invoice_number.localeCompare(a.invoice_number)
  );
}
