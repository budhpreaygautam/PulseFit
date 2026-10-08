import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { setRazorpayClientForTests } from '../src/controllers/paymentController.js';
import { periodEnd } from '../src/lib/billing.js';
import { addDays, gymToday } from '../src/lib/dates.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

const KEY_ID = 'rzp_test_pulsefit';
const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';
// Wednesday 7 Oct 2026, noon at the gym.
const NOW = new Date('2026-10-07T06:30:00.000Z');

const original = { ...config.razorpay };
// Expected amounts come from the seeded plan catalogue, so a price change does not break these tests.
const plan = (tier: 'basic' | 'pro' | 'vip') => db.membership_plans.find(p => p.tier === tier)!;
const paise = (inr: number) => inr * 100;
let orderSeq = 0;
const createOrderMock = vi.fn(async (params: { amount: number; currency: string }) => ({
  id: `order_test_${++orderSeq}`,
  amount: params.amount,
  currency: params.currency
}));

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

async function createOrder(email: string, tier: string, billing_cycle: string) {
  const res = await api().post('/api/payment/create-order').set(authHeader(email)).send({ tier, billing_cycle });
  expect(res.status).toBe(200);
  return res.body.data.orderId as string;
}

function verify(email: string, orderId: string, paymentId = `pay_${orderId}`, extra: Record<string, unknown> = {}) {
  return api()
    .post('/api/payment/verify')
    .set(authHeader(email))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId), ...extra });
}

function webhook(event: unknown, signature?: string) {
  const raw = JSON.stringify(event);
  const sig = signature ?? crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(raw);
}

const capturedEvent = (orderId: string, paymentId: string, amountPaise: number) => ({
  entity: 'event',
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise, currency: 'INR', status: 'captured' } } }
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
  Object.assign(config.razorpay, { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
  createOrderMock.mockClear();
  setRazorpayClientForTests({ orders: { create: createOrderMock } });
});

afterEach(() => {
  Object.assign(config.razorpay, original);
  setRazorpayClientForTests(null);
  vi.useRealTimers();
});

describe('GET /plans', () => {
  it('lists the catalogue sorted by monthly price, without auth', async () => {
    const res = await api().get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.tier)).toEqual(['basic', 'pro', 'vip']);
    expect(res.body.data[0]).toMatchObject({ price_monthly: 699, price_annual: 7188, categories: ['Workout & Strength'] });
  });

  it('keeps the sort after an admin reprices a plan', async () => {
    await api().put('/api/plans/plan_vip').set(authHeader(personas.admin)).send({ price_monthly: plan('basic').price_monthly - 100 });
    const res = await api().get('/api/plans');
    expect(res.body.data.map((p: any) => p.tier)).toEqual(['vip', 'basic', 'pro']);
  });
});

describe('PUT /plans/:id', () => {
  it('lets an admin edit a plan', async () => {
    const res = await api()
      .put('/api/plans/plan_pro')
      .set(authHeader(personas.admin))
      .send({ name: 'Cardio Pass', price_monthly: 1599, price_annual: 15000, features: ['Zumba'], categories: ['Zumba & Cardio', 'Zumba & Cardio'], is_popular: true, badge: 'NEW' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'plan_pro', tier: 'pro', name: 'Cardio Pass', price_monthly: 1599, price_annual: 15000, categories: ['Zumba & Cardio'], badge: 'NEW' });
    expect(db.membership_plans.find(p => p.id === 'plan_pro')!.price_monthly).toBe(1599);
  });

  it('removes the badge when it is set to an empty string', async () => {
    const res = await api().put('/api/plans/plan_vip').set(authHeader(personas.admin)).send({ badge: '' });
    expect(res.status).toBe(200);
    expect(res.body.data.badge).toBeUndefined();
  });

  it('charges the new price on later orders', async () => {
    await api().put('/api/plans/plan_basic').set(authHeader(personas.admin)).send({ price_monthly: 1299 });
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.basic)).send({ tier: 'basic', billing_cycle: 'monthly' });
    expect(res.body.data).toMatchObject({ amount: 129900, amount_inr: 1299 });
  });

  it.each([
    [{ price_monthly: 0 }],
    [{ price_monthly: 100001 }],
    [{ price_monthly: 12.5 }],
    [{ price_annual: '11988' }],
    [{ categories: ['Yoga'] }],
    [{ tier: 'vip' }],
    [{ id: 'plan_x' }]
  ])('rejects %j with 400 VALIDATION_ERROR', async body => {
    const before = plan('basic').price_monthly;
    const res = await api().put('/api/plans/plan_basic').set(authHeader(personas.admin)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(db.membership_plans.find(p => p.id === 'plan_basic')!.price_monthly).toBe(before);
  });

  it('answers 404 for an unknown plan', async () => {
    const res = await api().put('/api/plans/plan_gold').set(authHeader(personas.admin)).send({ price_monthly: 100 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('is admin only', async () => {
    expect((await api().put('/api/plans/plan_basic').send({ price_monthly: 1 })).status).toBe(401);
    expect((await api().put('/api/plans/plan_basic').set(authHeader(personas.member)).send({ price_monthly: 1 })).status).toBe(403);
    expect((await api().put('/api/plans/plan_basic').set(authHeader(personas.trainer)).send({ price_monthly: 1 })).status).toBe(403);
  });
});

describe('POST /payment/create-order', () => {
  it('prices a monthly order from the plan and stores it server-side', async () => {
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.member)).send({ tier: 'pro', billing_cycle: 'monthly' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      orderId: 'order_test_' + orderSeq,
      amount: paise(plan('pro').price_monthly),
      amount_inr: plan('pro').price_monthly,
      currency: 'INR',
      keyId: KEY_ID,
      tier: 'pro',
      billing_cycle: 'monthly',
      plan_name: 'Zumba & Cardio Pass',
      description: expect.stringContaining('Zumba & Cardio Pass')
    });
    expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({ amount: paise(plan('pro').price_monthly), currency: 'INR' }));
    const stored = db.payment_orders.find(o => o.id === res.body.data.orderId)!;
    expect(stored).toMatchObject({ user_id: userByEmail(personas.member).id, tier: 'pro', billing_cycle: 'monthly', amount_inr: plan('pro').price_monthly, status: 'created' });
  });

  it('charges the yearly total for annual (regression: annual charged one month)', async () => {
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.vip)).send({ tier: 'vip', billing_cycle: 'annual' });
    expect(res.body.data).toMatchObject({ amount: paise(plan('vip').price_annual), amount_inr: plan('vip').price_annual });
    expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({ amount: paise(plan('vip').price_annual) }));
  });

  it('ignores an amount or currency sent by the client (regression: VIP for ₹69)', async () => {
    const res = await api()
      .post('/api/payment/create-order')
      .set(authHeader(personas.member))
      .send({ tier: 'vip', billing_cycle: 'monthly', amount: 69, currency: 'USD', notes: { tier: 'vip' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ amount: paise(plan('vip').price_monthly), amount_inr: plan('vip').price_monthly, currency: 'INR' });
    expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({ amount: paise(plan('vip').price_monthly), currency: 'INR' }));
  });

  it.each([[{}], [{ tier: 'none', billing_cycle: 'monthly' }], [{ tier: 'pro', billing_cycle: 'weekly' }], [{ billing_cycle: 'monthly' }]])(
    'rejects %j with 400',
    async body => {
      const res = await api().post('/api/payment/create-order').set(authHeader(personas.member)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(createOrderMock).not.toHaveBeenCalled();
    }
  );

  it('answers 503 PAYMENTS_DISABLED without Razorpay keys', async () => {
    config.razorpay.keySecret = '';
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.member)).send({ tier: 'pro', billing_cycle: 'monthly' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
  });

  it('requires a signed-in user', async () => {
    expect((await api().post('/api/payment/create-order').send({ tier: 'pro', billing_cycle: 'monthly' })).status).toBe(401);
  });

  it('reports a Razorpay outage as 502 and stores nothing', async () => {
    createOrderMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.member)).send({ tier: 'pro', billing_cycle: 'monthly' });
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect(db.payment_orders).toHaveLength(db.payments.length); // only the seeded, paid orders
  });
});

describe('POST /payment/verify', () => {
  it('activates the order, stores an invoice and returns user, token and payment', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    const before = db.payments.length;
    const res = await verify(personas.expired, orderId, 'pay_dev_1');
    expect(res.status).toBe(200);
    const { user, token, payment, message } = res.body.data;
    expect(user).toMatchObject({ email: personas.expired, membership_tier: 'basic', membership_status: 'active', membership_expiry: '2026-11-06' });
    expect(user.password_hash).toBeUndefined();
    expect(typeof token).toBe('string');
    expect(message).toMatch(/active/);
    expect(payment).toMatchObject({
      user_id: user.id,
      order_id: orderId,
      razorpay_payment_id: 'pay_dev_1',
      tier: 'basic',
      billing_cycle: 'monthly',
      amount_inr: plan('basic').price_monthly,
      currency: 'INR',
      status: 'paid',
      period_start: '2026-10-07',
      period_end: '2026-11-06',
      source: 'checkout'
    });
    expect(payment.invoice_number).toMatch(/^PF-2026-\d{6}$/);
    expect(db.payments).toHaveLength(before + 1);
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('paid');
    // The returned token works.
    expect((await api().get('/api/payments/my').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  it('takes tier and cycle from the order, not the request body (regression)', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    const res = await verify(personas.expired, orderId, 'pay_x', { tier: 'vip', billing_cycle: 'annual', amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ membership_tier: 'basic', membership_expiry: '2026-11-06' });
    expect(res.body.data.payment).toMatchObject({ tier: 'basic', billing_cycle: 'monthly', amount_inr: plan('basic').price_monthly });
  });

  it('extends the same active tier from the day after the current expiry (regression: reset from today)', async () => {
    expect(userByEmail(personas.basic).membership_expiry).toBe('2026-10-31');
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    const res = await verify(personas.basic, orderId);
    expect(res.body.data.payment).toMatchObject({ period_start: '2026-11-01', period_end: '2026-11-30' });
    expect(res.body.data.user.membership_expiry).toBe('2026-11-30');
  });

  it('grants 12 calendar months for annual (regression: 360 days)', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'annual');
    const res = await verify(personas.expired, orderId);
    expect(res.body.data.user.membership_expiry).toBe('2027-10-06');
    expect(res.body.data.payment.amount_inr).toBe(plan('basic').price_annual);
  });

  it('credits unused days when changing to a different plan', async () => {
    const maya = 'maya.patel@example.com';
    expect(userByEmail(maya)).toMatchObject({ membership_tier: 'pro', membership_expiry: '2026-10-24' });
    const orderId = await createOrder(maya, 'vip', 'monthly');
    const res = await verify(maya, orderId);
    // 18 days of pro left are worth floor(18 * pro / vip) days of vip, added to the month ending 11-06.
    const end = addDays('2026-11-06', Math.floor((18 * plan('pro').price_monthly) / plan('vip').price_monthly));
    expect(res.body.data.user).toMatchObject({ membership_tier: 'vip', membership_expiry: end });
    expect(res.body.data.payment).toMatchObject({ period_start: '2026-10-07', period_end: end });
  });

  it('unfreezes a frozen member before extending', async () => {
    vi.setSystemTime(new Date('2026-10-02T06:30:00.000Z'));
    expect((await api().post('/api/membership/freeze').set(authHeader(personas.basic))).status).toBe(200);
    vi.setSystemTime(NOW);
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    const res = await verify(personas.basic, orderId);
    // 5 frozen days push 10-31 to 11-05; the new month runs 11-06 .. 12-05
    expect(res.body.data.user).toMatchObject({ membership_status: 'active', membership_expiry: '2026-12-05', frozen_since: null });
  });

  it('activates an order only once (409 ALREADY_PROCESSED with the current user)', async () => {
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    expect((await verify(personas.basic, orderId)).status).toBe(200);
    const count = db.payments.length;
    const replay = await verify(personas.basic, orderId);
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('ALREADY_PROCESSED');
    expect(replay.body.data.user).toMatchObject({ email: personas.basic, membership_expiry: '2026-11-30' });
    expect(replay.body.data.user.password_hash).toBeUndefined();
    expect(db.payments).toHaveLength(count);
    expect(userByEmail(personas.basic).membership_expiry).toBe('2026-11-30');
  });

  it('refuses a payment id that already paid another order', async () => {
    const first = await createOrder(personas.basic, 'basic', 'monthly');
    const second = await createOrder(personas.basic, 'vip', 'annual');
    expect((await verify(personas.basic, first, 'pay_shared')).status).toBe(200);
    const res = await verify(personas.basic, second, 'pay_shared');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_PROCESSED');
    expect(userByEmail(personas.basic).membership_tier).toBe('basic');
  });

  it('rejects a bad signature with 400 INVALID_SIGNATURE and changes nothing', async () => {
    const orderId = await createOrder(personas.expired, 'vip', 'annual');
    const res = await api()
      .post('/api/payment/verify')
      .set(authHeader(personas.expired))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: sign(orderId, 'pay_2') });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
  });

  it('rejects a signature made with another secret', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    const forged = crypto.createHmac('sha256', 'guess').update(`${orderId}|pay_1`).digest('hex');
    const res = await api()
      .post('/api/payment/verify')
      .set(authHeader(personas.expired))
      .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: forged });
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('answers 404 ORDER_NOT_FOUND for an order the server never created', async () => {
    const res = await verify(personas.expired, 'order_made_up');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it("answers 403 ORDER_NOT_YOURS for someone else's order", async () => {
    const orderId = await createOrder(personas.member, 'vip', 'annual');
    const res = await verify(personas.expired, orderId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORDER_NOT_YOURS');
    expect(userByEmail(personas.expired).membership_tier).toBe('basic');
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('created');
  });

  it('validates the body', async () => {
    const res = await api().post('/api/payment/verify').set(authHeader(personas.member)).send({ razorpay_order_id: 'order_1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('requires a signed-in user', async () => {
    expect((await api().post('/api/payment/verify').send({})).status).toBe(401);
  });

  it('answers 503 when payments are off, so an empty secret can never verify', async () => {
    Object.assign(config.razorpay, { keyId: '', keySecret: '' });
    const sig = crypto.createHmac('sha256', '').update('order_1|pay_1').digest('hex');
    const res = await api()
      .post('/api/payment/verify')
      .set(authHeader(personas.member))
      .send({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
  });
});

describe('POST /payment/webhook', () => {
  it('activates an order on payment.captured without a user token', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    const res = await webhook(capturedEvent(orderId, 'pay_wh_1', paise(plan('basic').price_monthly)));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true });
    expect(userByEmail(personas.expired)).toMatchObject({ membership_status: 'active', membership_expiry: '2026-11-06' });
    expect(db.payments.find(p => p.order_id === orderId)).toMatchObject({ source: 'webhook', razorpay_payment_id: 'pay_wh_1' });
  });

  it('activates on order.paid', async () => {
    const orderId = await createOrder(personas.expired, 'pro', 'monthly');
    const res = await webhook({
      event: 'order.paid',
      payload: {
        order: { entity: { id: orderId, amount_paid: paise(plan('pro').price_monthly), status: 'paid' } },
        payment: { entity: { id: 'pay_op', order_id: orderId, amount: paise(plan('pro').price_monthly), currency: 'INR', status: 'captured' } }
      }
    });
    expect(res.status).toBe(200);
    expect(userByEmail(personas.expired).membership_tier).toBe('pro');
  });

  it('is idempotent with checkout: webhook first, then verify answers 409', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    await webhook(capturedEvent(orderId, 'pay_1', paise(plan('basic').price_monthly)));
    const res = await verify(personas.expired, orderId, 'pay_1');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_PROCESSED');
    expect(res.body.data.user.membership_expiry).toBe('2026-11-06');
    expect(db.payments.filter(p => p.order_id === orderId)).toHaveLength(1);
  });

  it('is idempotent with checkout: verify first, then the webhook changes nothing', async () => {
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    await verify(personas.basic, orderId, 'pay_1');
    const res = await webhook(capturedEvent(orderId, 'pay_1', paise(plan('basic').price_monthly)));
    const again = await webhook({ ...capturedEvent(orderId, 'pay_1', paise(plan('basic').price_monthly)), event: 'order.paid' });
    expect(res.status).toBe(200);
    expect(again.status).toBe(200);
    expect(db.payments.filter(p => p.order_id === orderId)).toHaveLength(1);
    expect(userByEmail(personas.basic).membership_expiry).toBe('2026-11-30');
  });

  it('marks the order failed on payment.failed; a later successful payment still activates it', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    const res = await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_bad', order_id: orderId, status: 'failed' } } } });
    expect(res.status).toBe(200);
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('failed');
    expect(userByEmail(personas.expired).membership_status).toBe('expired');

    expect((await verify(personas.expired, orderId, 'pay_good')).status).toBe(200);
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('paid');
  });

  it('does not mark a paid order failed', async () => {
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    await verify(personas.basic, orderId, 'pay_ok');
    await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_retry', order_id: orderId } } } });
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('paid');
  });

  it('rejects an order whose captured amount differs, and verify refuses it too (review: check was webhook-only)', async () => {
    const orderId = await createOrder(personas.expired, 'vip', 'annual');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await webhook(capturedEvent(orderId, 'pay_cheap', 6900));
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('rejected');

    const viaCheckout = await verify(personas.expired, orderId, 'pay_cheap');
    expect(viaCheckout.status).toBe(409);
    expect(viaCheckout.body.code).toBe('ORDER_REJECTED');
    // Neither a later correct capture nor another verify can activate a rejected order.
    await webhook(capturedEvent(orderId, 'pay_full', paise(plan('vip').price_annual)));
    expect((await verify(personas.expired, orderId, 'pay_other')).body.code).toBe('ORDER_REJECTED');
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
    expect(db.payments.some(p => p.order_id === orderId)).toBe(false);
  });

  it('rejects a capture in another currency or without an amount', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const usd = await createOrder(personas.expired, 'basic', 'monthly');
    const usdEvent = capturedEvent(usd, 'pay_usd', paise(plan('basic').price_monthly));
    usdEvent.payload.payment.entity.currency = 'USD';
    expect((await webhook(usdEvent)).status).toBe(200);
    const noAmount = await createOrder(personas.expired, 'basic', 'monthly');
    const noAmountEvent = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_na', order_id: noAmount, currency: 'INR' } } } };
    expect((await webhook(noAmountEvent)).status).toBe(200);
    spy.mockRestore();
    expect(db.payment_orders.find(o => o.id === usd)!.status).toBe('rejected');
    expect(db.payment_orders.find(o => o.id === noAmount)!.status).toBe('rejected');
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
  });

  it('leaves a paid order paid when a mismatched event arrives for it later', async () => {
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    await verify(personas.basic, orderId, 'pay_ok');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await webhook(capturedEvent(orderId, 'pay_odd', 100));
    spy.mockRestore();
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('paid');
  });

  it('acknowledges events for unknown orders and other event types', async () => {
    const count = db.payments.length;
    expect((await webhook(capturedEvent('order_elsewhere', 'pay_9', 100))).status).toBe(200);
    expect((await webhook({ event: 'refund.created', payload: {} })).status).toBe(200);
    expect(db.payments).toHaveLength(count);
  });

  it('rejects a bad or missing signature with 400', async () => {
    const orderId = await createOrder(personas.expired, 'basic', 'monthly');
    const bad = await webhook(capturedEvent(orderId, 'pay_1', paise(plan('basic').price_monthly)), 'deadbeef');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_SIGNATURE');
    const missing = await api()
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(capturedEvent(orderId, 'pay_1', paise(plan('basic').price_monthly))));
    expect(missing.status).toBe(400);
    // A signature over the parsed-and-reserialised body would not match the raw bytes Razorpay signed.
    const raw = JSON.stringify(capturedEvent(orderId, 'pay_1', paise(plan('basic').price_monthly)), null, 2);
    const sigOverCompact = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(JSON.parse(raw))).digest('hex');
    const reserialised = await api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sigOverCompact).send(raw);
    expect(reserialised.status).toBe(400);
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
  });

  it('rejects a non-JSON body with 400 BAD_PAYLOAD, signed or not (review: one case said BAD_JSON)', async () => {
    const res = await api().post('/api/payment/webhook').set('Content-Type', 'text/plain').set('X-Razorpay-Signature', 'x').send('hello');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_PAYLOAD');
    const raw = '{"event": "payment.captured", ';
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const broken = await api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(raw);
    expect(broken.status).toBe(400);
    expect(broken.body.code).toBe('BAD_PAYLOAD');
  });

  it('answers 503 when no webhook secret is configured', async () => {
    config.razorpay.webhookSecret = '';
    const res = await webhook({ event: 'payment.captured' }, 'whatever');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('WEBHOOK_DISABLED');
  });
});

describe('GET /payments/my and GET /payments', () => {
  it("returns only the caller's invoices, newest first", async () => {
    const res = await api().get('/api/payments/my').set(authHeader(personas.vip));
    expect(res.status).toBe(200);
    const ananya = userByEmail(personas.vip).id;
    expect(res.body.data.length).toBe(7);
    expect(res.body.data.every((p: any) => p.user_id === ananya)).toBe(true);
    const dates = res.body.data.map((p: any) => p.created_at);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(res.body.data[0]).toMatchObject({ tier: 'vip', billing_cycle: 'annual', amount_inr: plan('vip').price_annual });
  });

  it('puts a new payment at the top', async () => {
    const orderId = await createOrder(personas.basic, 'basic', 'monthly');
    await verify(personas.basic, orderId, 'pay_new');
    const res = await api().get('/api/payments/my').set(authHeader(personas.basic));
    expect(res.body.data[0]).toMatchObject({ razorpay_payment_id: 'pay_new' });
  });

  it('returns an empty list for staff without payments', async () => {
    const res = await api().get('/api/payments/my').set(authHeader(personas.trainer));
    expect(res.body.data).toEqual([]);
  });

  it('lets an admin list every payment, optionally for one member', async () => {
    const all = await api().get('/api/payments').set(authHeader(personas.admin));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(db.payments.length);
    const dates = all.body.data.map((p: any) => p.created_at);
    expect(dates).toEqual([...dates].sort().reverse());

    const rohan = userByEmail(personas.basic).id;
    const one = await api().get('/api/payments').query({ user_id: rohan }).set(authHeader(personas.admin));
    expect(one.body.data.length).toBeGreaterThan(0);
    expect(one.body.data.every((p: any) => p.user_id === rohan)).toBe(true);
  });

  it('requires auth, and admin for the full list', async () => {
    expect((await api().get('/api/payments/my')).status).toBe(401);
    expect((await api().get('/api/payments')).status).toBe(401);
    expect((await api().get('/api/payments').set(authHeader(personas.member))).status).toBe(403);
    expect((await api().get('/api/payments').set(authHeader(personas.trainer))).status).toBe(403);
  });

  it('numbers new invoices uniquely and in increasing order', async () => {
    const numbers: string[] = [];
    for (const [i, email] of [personas.basic, personas.expired, personas.member].entries()) {
      const orderId = await createOrder(email, 'basic', 'monthly');
      const res = await verify(email, orderId, `pay_seq_${i}`);
      numbers.push(res.body.data.payment.invoice_number);
    }
    const all = db.payments.map(p => p.invoice_number);
    expect(new Set(all).size).toBe(all.length);
    const seqs = numbers.map(n => Number(n.slice(-6)));
    expect(seqs[1]).toBe(seqs[0] + 1);
    expect(seqs[2]).toBe(seqs[1] + 1);
    expect(seqs[0]).toBeGreaterThan(Math.max(...all.filter(n => !numbers.includes(n)).map(n => Number(n.slice(-6)))));
  });
});

describe('seeded payment history', () => {
  it('agrees with each member: tier, expiry and status come from the latest payment', () => {
    for (const email of [personas.member, personas.vip, personas.basic, 'maya.patel@example.com', personas.expired]) {
      const user = userByEmail(email);
      const mine = db.payments.filter(p => p.user_id === user.id).sort((a, b) => a.period_start.localeCompare(b.period_start));
      expect(mine.length).toBeGreaterThan(0);
      const latest = mine[mine.length - 1];
      expect(user.membership_tier).toBe(latest.tier);
      expect(user.membership_expiry).toBe(latest.period_end);
      // Each period is exactly what an activation would bill, and they join up day to day.
      for (const p of mine) expect(p.period_end).toBe(periodEnd(p.period_start, p.billing_cycle));
      for (let i = 1; i < mine.length; i++) {
        const prevEnd = new Date(`${mine[i - 1].period_end}T00:00:00Z`);
        prevEnd.setUTCDate(prevEnd.getUTCDate() + 1);
        expect(mine[i].period_start).toBe(prevEnd.toISOString().slice(0, 10));
      }
      for (const p of mine) {
        const plan = db.membership_plans.find(pl => pl.tier === p.tier)!;
        expect(p.amount_inr).toBe(p.billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly);
        expect(db.payment_orders.find(o => o.id === p.order_id)).toMatchObject({ status: 'paid', amount_inr: p.amount_inr });
      }
    }
    expect(userByEmail(personas.member)).toMatchObject({ membership_tier: 'pro', membership_status: 'active' });
    expect(userByEmail(personas.vip)).toMatchObject({ membership_tier: 'vip', membership_status: 'active', membership_expiry: '2027-08-15' });
    expect(userByEmail(personas.basic)).toMatchObject({ membership_tier: 'basic', membership_status: 'active' });
    expect(userByEmail(personas.expired)).toMatchObject({ membership_tier: 'basic', membership_status: 'expired', membership_expiry: '2026-08-01' });
  });

  it('has unique invoice numbers that increase with the payment date', () => {
    const sorted = [...db.payments].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const seqs = sorted.map(p => Number(p.invoice_number.slice(-6)));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(sorted.every(p => /^PF-\d{4}-\d{6}$/.test(p.invoice_number) && p.created_at < NOW.toISOString())).toBe(true);
  });

  it('stays current whenever it is run', () => {
    vi.setSystemTime(new Date('2027-05-20T06:30:00.000Z'));
    resetDb();
    for (const email of [personas.member, personas.vip, personas.basic, 'maya.patel@example.com']) {
      const user = userByEmail(email);
      expect(user.membership_status).toBe('active');
      expect(user.membership_expiry! >= '2027-05-20').toBe(true);
    }
    expect(userByEmail(personas.expired).membership_status).toBe('expired');
  });

  it.each([
    '2027-03-31T06:30:00.000Z',
    '2027-03-29T06:30:00.000Z',
    '2027-05-02T06:30:00.000Z',
    '2028-02-29T06:30:00.000Z',
    '2028-03-05T06:30:00.000Z',
    '2027-01-30T20:00:00.000Z'
  ])('bills every seeded period exactly as an activation would, near month ends (clock %s)', iso => {
    vi.setSystemTime(new Date(iso));
    resetDb();
    const today = gymToday();
    for (const email of [personas.member, personas.vip, personas.basic, 'maya.patel@example.com', personas.expired]) {
      const user = userByEmail(email);
      const mine = db.payments.filter(p => p.user_id === user.id).sort((a, b) => a.period_start.localeCompare(b.period_start));
      for (const p of mine) {
        expect(p.period_end).toBe(periodEnd(p.period_start, p.billing_cycle));
        expect(p.created_at < new Date(iso).toISOString()).toBe(true);
      }
      for (let i = 1; i < mine.length; i++) expect(mine[i].period_start).toBe(addDays(mine[i - 1].period_end, 1));
      const latest = mine[mine.length - 1];
      expect(user.membership_expiry).toBe(latest.period_end);
      if (email === personas.expired) {
        expect(user.membership_status).toBe('expired');
        expect(latest.period_end < today).toBe(true);
      } else {
        expect(user.membership_status).toBe('active');
        expect(latest.period_start <= today && latest.period_end >= today).toBe(true);
      }
    }
  });
});
