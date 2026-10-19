import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import { z } from 'zod';
import config, { paymentProvider, razorpayConfigured, youpiConfigured } from '../config.js';
import db from '../db/database.js';
import { computeActivation, hmacMatches, nextInvoiceNumber, PaidTier, planPrice } from '../lib/billing.js';
import { displayDate, gymToday } from '../lib/dates.js';
import { releaseUnentitledBookings } from '../lib/bookingRules.js';
import { ApiError, asyncHandler, badRequest, conflict, forbidden, notFound, ok, parse, unavailable } from '../lib/http.js';
import { newId, toSafeUser } from '../lib/users.js';
import { isSafeCheckoutUrl, readSession, youpi, YOUPI_CLOSED, YoupiSession } from '../lib/youpi.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { BillingCycle, Payment, PaymentOrder, SafeUser } from '../types/index.js';

// Checkout flow: create-order fixes the plan, cycle and price on a server-side PaymentOrder;
// nothing about price or tier is read from the client.
// - Razorpay: verify (from the browser) and the webhook (from Razorpay) both activate that order,
//   and whichever arrives first wins.
// - YouPI: the member pays on YouPI's checkout page; YouPI's signed webhook, or a status lookup
//   this server makes when the member's page asks (confirm), activates the order.

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

/** Where YouPI sends the member back: PUBLIC_URL, else the website the request came from, else the first CLIENT_ORIGIN. */
function websiteOrigin(req: Request): string {
  if (config.publicUrl) return config.publicUrl;
  const origin = req.get('origin');
  if (origin && config.corsOrigins.includes(origin)) return origin;
  return config.corsOrigins[0] ?? '';
}

const providerError = () =>
  new ApiError(502, 'We could not reach the payment provider. Please try again in a moment.', 'PAYMENT_PROVIDER_ERROR');

export const createOrder = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const provider = paymentProvider();
  if (!provider) throw unavailable('Online payments are not configured on this server.', 'PAYMENTS_DISABLED');
  const { tier, billing_cycle } = parse(createOrderSchema, req.body);
  const user = req.user!;
  const plan = planFor(tier);
  const amountInr = planPrice(plan, billing_cycle);
  const summary = {
    amount: amountInr * 100,
    amount_inr: amountInr,
    currency: 'INR' as const,
    tier,
    billing_cycle,
    plan_name: plan.name,
    description: describePurchase(plan.name, billing_cycle)
  };
  const newOrder = (id: string): PaymentOrder => ({
    id,
    provider,
    user_id: user.id,
    tier,
    billing_cycle,
    amount_inr: amountInr,
    currency: 'INR',
    status: 'created',
    created_at: new Date().toISOString()
  });

  if (provider === 'youpi') {
    const orderId = newId('ypo');
    let session: YoupiSession;
    try {
      session = await youpi().createPayment({
        orderId,
        amountPaise: amountInr * 100,
        description: summary.description,
        returnUrl: `${websiteOrigin(req)}/payment-status?order=${orderId}`,
        metadata: { user_id: user.id, tier, billing_cycle }
      });
    } catch (err) {
      console.error('YouPI payment creation failed:', (err as Error).message);
      throw providerError();
    }
    // Only a session for exactly this order and amount, with a web checkout page, is handed on.
    if (session.orderId !== orderId || session.amountPaise !== amountInr * 100 || !session.checkoutUrl || !isSafeCheckoutUrl(session.checkoutUrl)) {
      console.error(`YouPI answered order ${orderId} with an unexpected session (order ${session.orderId}, ${session.amountPaise} paise).`);
      throw providerError();
    }
    db.payment_orders = [...db.payment_orders, { ...newOrder(orderId), provider_payment_id: session.paymentId }];
    return ok(res, { provider, orderId, checkoutUrl: session.checkoutUrl, ...summary });
  }

  const razorpay = getRazorpay();
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
    throw providerError();
  }

  db.payment_orders = [...db.payment_orders, newOrder(order.id)];
  ok(res, { provider, orderId: order.id, keyId: config.razorpay.keyId, ...summary });
});

type ActivationResult =
  | { outcome: 'activated'; payment: Payment; user: SafeUser; cancelledBookings: number }
  | { outcome: 'already_processed' | 'rejected' | 'skipped' };

/**
 * A paid order also keeps how many bookings its plan change cancelled, so a verify that arrives
 * after the webhook activated the order can still tell the member.
 */
type ActivatedOrder = PaymentOrder & { cancelled_bookings?: number };

/** What verify tells the member: the plan and its last day, and any bookings the plan change cancelled. */
function paymentMessage(payment: Payment, cancelled: number): string {
  let message = `Payment received. Your ${payment.plan_name} is active until ${displayDate(payment.period_end)}.`;
  if (cancelled > 0) {
    message += ` ${cancelled} upcoming class booking${cancelled === 1 ? ' was' : 's were'} cancelled because your new plan does not include ${cancelled === 1 ? 'that class' : 'those classes'}.`;
  }
  return message;
}

/**
 * Apply a paid order to its member: extend or change the membership and store the invoice.
 * A change of plan cancels the member's upcoming bookings the new plan does not cover, as an
 * admin's tier change does. An order activates at most once, and never after the webhook
 * rejected it for a wrong amount.
 */
function activateOrder(orderId: string, paymentId: string, source: Payment['source'], utr?: string): ActivationResult {
  const order = db.payment_orders.find(o => o.id === orderId);
  if (!order) return { outcome: 'skipped' };
  const provider = order.provider ?? 'razorpay';
  if (order.status === 'paid' || db.payments.some(p => p.order_id === orderId || p.razorpay_payment_id === paymentId)) {
    return { outcome: 'already_processed' };
  }
  if (order.status === 'rejected') return { outcome: 'rejected' };
  const user = db.users.find(u => u.id === order.user_id);
  if (!user) {
    // The member was deleted between checkout and capture. Keep a record so the money can be
    // found and refunded instead of silently disappearing.
    db.payment_orders = db.payment_orders.map(o =>
      o.id === orderId ? { ...o, status: 'orphaned' as const, paid_at: new Date().toISOString(), razorpay_payment_id: paymentId } : o
    );
    db.saveSync();
    console.error(
      `⚠️  Payment ${paymentId} for order ${orderId} was captured after its member was deleted; refund it ${provider === 'youpi' ? `by UPI${utr ? ` (UTR ${utr})` : ''}` : 'in the Razorpay dashboard'}.`
    );
    return { outcome: 'skipped' };
  }

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
    provider,
    ...(utr ? { utr } : {}),
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
  const cancelledBookings =
    updatedUser.membership_tier !== user.membership_tier ? releaseUnentitledBookings({ userId: user.id }) : 0;
  const paidOrder: ActivatedOrder = { ...order, status: 'paid', paid_at: now, cancelled_bookings: cancelledBookings };
  db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? paidOrder : o));
  db.payments = [...db.payments, payment];
  // Money has moved: make the activation durable before anyone is told it succeeded.
  db.saveSync();

  return { outcome: 'activated', payment, user: toSafeUser(updatedUser), cancelledBookings };
}

const verifySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(100),
  razorpay_payment_id: z.string().trim().min(1).max(100),
  razorpay_signature: z.string().trim().min(1).max(200)
});

/** What an already-paid order did, for a page that asks after the activation happened. */
function paidOrderSummary(orderId: string, userId: string) {
  const current = db.users.find(u => u.id === userId)!;
  const applied = db.payments.find(p => p.order_id === orderId);
  const cancelled = (db.payment_orders.find(o => o.id === orderId) as ActivatedOrder | undefined)?.cancelled_bookings ?? 0;
  return {
    user: toSafeUser(current),
    cancelled_bookings: cancelled,
    ...(applied ? { payment: applied, message: paymentMessage(applied, cancelled) } : {})
  };
}

export const verifyPayment = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  if (!razorpayConfigured()) {
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
  if (result.outcome === 'rejected') {
    throw conflict(
      'Razorpay reported a payment that does not match this order, so it was not applied. Please contact the front desk.',
      'ORDER_REJECTED'
    );
  }
  if (result.outcome !== 'activated') {
    // Usually the webhook got here first: say what that activation did, as verify would have.
    const { user, cancelled_bookings, message } = paidOrderSummary(order.id, req.user!.id);
    throw conflict('This payment has already been applied to your membership.', 'ALREADY_PROCESSED', {
      user,
      cancelled_bookings,
      ...(message ? { message } : {})
    });
  }

  const cancelled = result.cancelledBookings;
  const message = paymentMessage(result.payment, cancelled);
  ok(res, { user: result.user, payment: result.payment, message, cancelled_bookings: cancelled }, message);
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
    throw badRequest('The webhook body is not valid JSON.', 'BAD_PAYLOAD');
  }

  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;
  const order = orderId ? db.payment_orders.find(o => o.id === orderId) : undefined;

  // Unknown orders (not membership checkouts) and repeats are acknowledged, so Razorpay stops retrying.
  if (order && payment?.id) {
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      if (payment.amount !== order.amount_inr * 100 || payment.currency !== 'INR') {
        // Recorded on the order so verify refuses it as well; a paid order is left alone.
        console.warn(
          `Webhook ${event.event} for ${order.id}: paid ${payment.amount ?? '?'} ${payment.currency ?? '?'}, expected ${order.amount_inr * 100} INR; order rejected.`
        );
        if (order.status !== 'paid') {
          db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? { ...o, status: 'rejected' as const } : o));
        }
      } else {
        activateOrder(order.id, payment.id, 'webhook');
      }
    } else if (event.event === 'payment.failed' && order.status === 'created') {
      db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? { ...o, status: 'failed' as const } : o));
    }
  }

  ok(res, { received: true });
});

/**
 * Apply what YouPI reports about one of our orders. SUCCESS for the exact amount activates it
 * (once); a different amount rejects it; FAILED, EXPIRED or CANCELLED closes it ('closed').
 * A report for another session of the same order id is 'ignored'.
 */
function applyYoupiSession(order: PaymentOrder, session: YoupiSession, source: Payment['source']): 'paid' | 'rejected' | 'closed' | 'pending' | 'ignored' {
  if (session.orderId !== order.id || session.paymentId !== order.provider_payment_id) return 'ignored';
  if (session.status === 'SUCCESS') {
    if (session.amountPaise !== order.amount_inr * 100 || session.currency !== 'INR') {
      console.warn(`YouPI reported ${session.amountPaise} ${session.currency} for ${order.id}, expected ${order.amount_inr * 100} INR; order rejected.`);
      if (order.status === 'paid') return 'paid';
      db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? { ...o, status: 'rejected' as const } : o));
      return 'rejected';
    }
    const result = activateOrder(order.id, session.paymentId, source, session.utr);
    if (result.outcome === 'rejected') return 'rejected';
    return result.outcome === 'skipped' ? 'ignored' : 'paid';
  }
  if (YOUPI_CLOSED.includes(session.status)) {
    // A late SUCCESS can still activate a closed order: the money is what counts.
    if (order.status === 'created') {
      db.payment_orders = db.payment_orders.map(o => (o.id === order.id ? { ...o, status: 'failed' as const } : o));
    }
    return 'closed';
  }
  return 'pending';
}

const ORDER_REJECTED_MESSAGE =
  'The payment gateway reported a payment that does not match this order, so it was not applied. Please contact the front desk.';

const confirmSchema = z.object({ order_id: z.string().trim().min(1).max(100) });

/**
 * The member's payment page asks whether a YouPI order is paid yet. The answer comes from YouPI
 * itself (a status lookup authenticated with the merchant key), never from the browser.
 */
export const confirmYoupiPayment = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const { order_id } = parse(confirmSchema, req.body);
  const order = db.payment_orders.find(o => o.id === order_id && o.provider === 'youpi');
  if (!order) throw notFound('We have no record of this order.', 'ORDER_NOT_FOUND');
  if (order.user_id !== req.user!.id) throw forbidden('This order belongs to another account.', 'ORDER_NOT_YOURS');

  if (order.status === 'paid') return ok(res, { status: 'paid', ...paidOrderSummary(order.id, order.user_id) });
  if (order.status === 'rejected' || order.status === 'orphaned') throw conflict(ORDER_REJECTED_MESSAGE, 'ORDER_REJECTED');
  if (!youpiConfigured() || !order.provider_payment_id) {
    throw unavailable('Online payments are not configured on this server.', 'PAYMENTS_DISABLED');
  }

  let session: YoupiSession;
  try {
    session = await youpi().getPayment(order.provider_payment_id);
  } catch (err) {
    console.error(`YouPI status lookup for ${order.id} failed:`, (err as Error).message);
    throw providerError();
  }

  const outcome = applyYoupiSession(order, session, 'checkout');
  if (outcome === 'ignored') {
    console.error(`YouPI answered the status of ${order.id} with another session (order ${session.orderId}).`);
    throw providerError();
  }
  if (outcome === 'rejected') throw conflict(ORDER_REJECTED_MESSAGE, 'ORDER_REJECTED');
  if (outcome === 'paid') {
    const summary = paidOrderSummary(order.id, order.user_id);
    return ok(res, { status: 'paid', ...summary }, summary.message);
  }
  ok(res, outcome === 'closed' ? { status: 'failed', reason: session.status } : { status: 'pending' });
});

/**
 * YouPI's server-to-server notifications (SUCCESS, FAILED, EXPIRED, CANCELLED), signed with the
 * merchant's webhook secret over the exact body: X-Gateway-Signature: sha256=<hex>. Mounted behind
 * express.raw, so req.body is a Buffer. A replayed delivery is harmless: an order activates once.
 */
export const youpiWebhook = asyncHandler(async (req: Request, res: Response) => {
  const secret = config.youpi.webhookSecret;
  if (!secret) throw unavailable('Payment webhooks are not configured on this server.', 'WEBHOOK_DISABLED');
  if (!Buffer.isBuffer(req.body)) throw badRequest('Expected a JSON webhook body.', 'BAD_PAYLOAD');

  const header = req.header('x-gateway-signature') ?? '';
  const signature = header.startsWith('sha256=') ? header.slice('sha256='.length) : '';
  if (!hmacMatches(req.body, signature, secret)) throw badRequest('Webhook signature does not match.', 'INVALID_SIGNATURE');

  let body: unknown;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    throw badRequest('The webhook body is not valid JSON.', 'BAD_PAYLOAD');
  }

  // Unknown orders (not membership checkouts) and repeats are acknowledged, so YouPI stops retrying.
  const session = readSession(body);
  const order = session ? db.payment_orders.find(o => o.id === session.orderId && o.provider === 'youpi') : undefined;
  if (session && order) applyYoupiSession(order, session, 'webhook');

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
