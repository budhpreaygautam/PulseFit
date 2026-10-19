import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import config, { youpiConfigured } from '../src/config.js';
import { rupeesString } from '../src/lib/youpi.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

// A stand-in for YouPI's Payment API on a local port, so the real HTTP client is exercised.
const MERCHANT_ID = 'merchant-test-0001';
const WEBHOOK_SECRET = 'youpi-test-webhook-secret';

interface FakeSession {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: string;
  utr?: string;
}

const sessions = new Map<string, FakeSession>();
const requests: { method: string; url: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
let failCreate = false;
let createAmountOverride: number | null = null;
let baseUrl = '';

const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => (raw += chunk));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method!, url: req.url!, headers: req.headers, body });
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'POST' && req.url === '/api/v1/payments') {
      if (failCreate) return send(503, { error: 'Observer offline' });
      const paymentId = crypto.randomUUID();
      const amountPaise = createAmountOverride ?? Math.round(Number(body.amount) * 100);
      sessions.set(paymentId, { paymentId, orderId: body.orderId, amountPaise, currency: 'INR', status: 'INITIATED' });
      return send(201, {
        paymentId,
        orderId: body.orderId,
        amount: body.amount,
        amountPaise,
        currency: 'INR',
        status: 'INITIATED',
        queuePosition: 0,
        checkoutUrl: `${baseUrl}/checkout/${paymentId}`
      });
    }
    const match = req.url!.match(/^\/api\/v1\/payments\/([\w-]+)$/);
    if (req.method === 'GET' && match) {
      const session = sessions.get(match[1]);
      // Without the merchant key YouPI only shows public fields; here it simply refuses.
      if (!session || req.headers['x-merchant-key'] !== WEBHOOK_SECRET) return send(404, { error: 'Not found' });
      return send(200, { ...session, amount: rupeesString(session.amountPaise), method: 'UPI' });
    }
    send(404, { error: 'Not found' });
  });
});

const original = { youpi: { ...config.youpi }, razorpay: { ...config.razorpay }, provider: config.paymentProvider, isProduction: config.isProduction };

beforeAll(async () => {
  await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(resolve => fake.close(resolve));
});

beforeEach(() => {
  resetDb();
  sessions.clear();
  requests.length = 0;
  failCreate = false;
  createAmountOverride = null;
  Object.assign(config.razorpay, { keyId: '', keySecret: '', webhookSecret: '' });
  Object.assign(config.youpi, { apiUrl: baseUrl, merchantId: MERCHANT_ID, webhookSecret: WEBHOOK_SECRET });
  config.paymentProvider = '';
});

afterEach(() => {
  Object.assign(config.youpi, original.youpi);
  Object.assign(config.razorpay, original.razorpay);
  config.paymentProvider = original.provider;
  config.isProduction = original.isProduction;
});

const plan = (tier: 'basic' | 'pro' | 'vip') => db.membership_plans.find(p => p.tier === tier)!;

async function createOrder(email: string = personas.basic, tier = 'pro', billing_cycle = 'monthly') {
  const res = await api()
    .post('/api/payment/create-order')
    .set(authHeader(email))
    .set('Origin', 'http://localhost:5173')
    .send({ tier, billing_cycle });
  expect(res.status).toBe(200);
  return res.body.data as { provider: string; orderId: string; checkoutUrl: string; amount: number };
}

const sessionFor = (orderId: string) => [...sessions.values()].find(s => s.orderId === orderId)!;
const confirm = (orderId: string, email: string = personas.basic) =>
  api().post('/api/payment/youpi/confirm').set(authHeader(email)).send({ order_id: orderId });

function webhook(payload: Record<string, unknown>, signature?: string) {
  const raw = JSON.stringify(payload);
  const sig = signature ?? `sha256=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`;
  return api()
    .post('/api/payment/youpi/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Gateway-Event', String(payload.event))
    .set('X-Gateway-Signature', sig)
    .send(raw);
}

const successEvent = (s: FakeSession, overrides: Record<string, unknown> = {}) => ({
  event: 'SUCCESS',
  paymentId: s.paymentId,
  orderId: s.orderId,
  amount: rupeesString(s.amountPaise),
  amountPaise: s.amountPaise,
  currency: 'INR',
  method: 'UPI',
  completedAt: new Date().toISOString(),
  metadata: {},
  ...overrides
});

describe('choosing the gateway', () => {
  it('uses YouPI when it is the only gateway configured, and tells the client', async () => {
    const res = await api().get('/api/config');
    expect(res.body.data.payments).toEqual({ enabled: true, provider: 'youpi', keyId: null });
  });

  it('prefers Razorpay when both are configured, unless PAYMENT_PROVIDER says youpi', async () => {
    Object.assign(config.razorpay, { keyId: 'rzp_test_x', keySecret: 'secret' });
    expect((await api().get('/api/config')).body.data.payments).toMatchObject({ provider: 'razorpay', keyId: 'rzp_test_x' });
    config.paymentProvider = 'youpi';
    expect((await api().get('/api/config')).body.data.payments).toEqual({ enabled: true, provider: 'youpi', keyId: null });
  });

  it('turns payments off when the chosen gateway is incomplete', async () => {
    config.youpi.merchantId = '';
    config.paymentProvider = 'youpi';
    expect((await api().get('/api/config')).body.data.payments).toEqual({ enabled: false, provider: null, keyId: null });
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.basic)).send({ tier: 'pro', billing_cycle: 'monthly' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
  });

  it('refuses a plain-HTTP YouPI address on another machine in production, where the merchant key would travel in clear', () => {
    config.isProduction = true;
    config.youpi.apiUrl = 'http://192.168.1.20:6100';
    expect(youpiConfigured()).toBe(false);
    config.youpi.apiUrl = 'http://localhost:6100';
    expect(youpiConfigured()).toBe(true);
    config.youpi.apiUrl = 'https://pay.example.com';
    expect(youpiConfigured()).toBe(true);
  });
});

describe('POST /payment/create-order with YouPI', () => {
  it('opens a YouPI session for the plan price and returns its checkout page', async () => {
    const order = await createOrder();
    const price = plan('pro').price_monthly;
    expect(order).toMatchObject({ provider: 'youpi', amount: price * 100 });
    expect(order.orderId).toMatch(/^ypo_/);
    expect(order.checkoutUrl).toBe(`${baseUrl}/checkout/${sessionFor(order.orderId).paymentId}`);
    expect(order).not.toHaveProperty('keyId');

    const sent = requests.find(r => r.method === 'POST')!;
    expect(sent.headers['x-merchant-id']).toBe(MERCHANT_ID);
    expect(sent.headers['idempotency-key']).toBe(order.orderId);
    expect(sent.body).toMatchObject({
      orderId: order.orderId,
      amount: `${price}.00`,
      currency: 'INR',
      returnUrl: `http://localhost:5173/payment-status?order=${order.orderId}`,
      metadata: { user_id: userByEmail(personas.basic).id, tier: 'pro', billing_cycle: 'monthly' }
    });
    // No personal details go to the gateway.
    expect(JSON.stringify(sent.body)).not.toContain(personas.basic);

    expect(db.payment_orders.find(o => o.id === order.orderId)).toMatchObject({
      provider: 'youpi',
      provider_payment_id: sessionFor(order.orderId).paymentId,
      status: 'created',
      amount_inr: price
    });
  });

  it('answers 502 and keeps no order when YouPI is down', async () => {
    failCreate = true;
    const before = db.payment_orders.length;
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.basic)).send({ tier: 'pro', billing_cycle: 'monthly' });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect(db.payment_orders.length).toBe(before);
  });

  it('answers 502 when YouPI opens a session for a different amount', async () => {
    createAmountOverride = 100;
    const res = await api().post('/api/payment/create-order').set(authHeader(personas.basic)).send({ tier: 'pro', billing_cycle: 'monthly' });
    expect(res.status).toBe(502);
  });
});

describe('POST /payment/youpi/confirm', () => {
  it('reports pending until YouPI sees the money, asking YouPI with the merchant key', async () => {
    const { orderId } = await createOrder();
    const res = await confirm(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'pending' });
    expect(userByEmail(personas.basic).membership_tier).toBe('basic');
    expect(requests.find(r => r.method === 'GET')!.headers['x-merchant-key']).toBe(WEBHOOK_SECRET);
  });

  it('activates the plan once YouPI reports SUCCESS for the exact amount, keeping the UTR', async () => {
    const { orderId } = await createOrder();
    Object.assign(sessionFor(orderId), { status: 'SUCCESS', utr: '412345678901' });

    const res = await confirm(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
    expect(res.body.data.user.membership_tier).toBe('pro');
    expect(res.body.data.payment).toMatchObject({ order_id: orderId, provider: 'youpi', utr: '412345678901', source: 'checkout' });
    expect(res.body.data.message).toMatch(/^Payment received\./);

    // Asking again reports the same payment and never applies it twice.
    const again = await confirm(orderId);
    expect(again.body.data.status).toBe('paid');
    expect(db.payments.filter(p => p.order_id === orderId)).toHaveLength(1);
  });

  it('rejects a SUCCESS for a different amount and activates nothing', async () => {
    const { orderId } = await createOrder();
    Object.assign(sessionFor(orderId), { status: 'SUCCESS', amountPaise: 100 });
    const res = await confirm(orderId);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_REJECTED');
    expect(userByEmail(personas.basic).membership_tier).toBe('basic');
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('rejected');
  });

  it('closes an expired session as failed', async () => {
    const { orderId } = await createOrder();
    sessionFor(orderId).status = 'EXPIRED';
    const res = await confirm(orderId);
    expect(res.body.data).toEqual({ status: 'failed', reason: 'EXPIRED' });
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('failed');
  });

  it("refuses another member's order", async () => {
    const { orderId } = await createOrder();
    const res = await confirm(orderId, personas.vip);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORDER_NOT_YOURS');
  });

  it('does not treat a Razorpay order id as a YouPI order', async () => {
    db.payment_orders = [
      ...db.payment_orders,
      { id: 'order_rzp_1', user_id: userByEmail(personas.basic).id, tier: 'pro', billing_cycle: 'monthly', amount_inr: 1, currency: 'INR', status: 'created', created_at: new Date().toISOString() }
    ];
    const res = await confirm('order_rzp_1');
    expect(res.status).toBe(404);
  });

  it('answers 502 when YouPI cannot be reached', async () => {
    const { orderId } = await createOrder();
    config.youpi.apiUrl = 'http://127.0.0.1:1';
    const res = await confirm(orderId);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
  });
});

describe('POST /payment/youpi/webhook', () => {
  it('activates the order on a signed SUCCESS', async () => {
    const { orderId } = await createOrder();
    const res = await webhook(successEvent(sessionFor(orderId)));
    expect(res.status).toBe(200);
    expect(userByEmail(personas.basic).membership_tier).toBe('pro');
    expect(db.payments.find(p => p.order_id === orderId)).toMatchObject({ provider: 'youpi', source: 'webhook' });

    // A redelivery, and the member's page asking afterwards, change nothing.
    expect((await webhook(successEvent(sessionFor(orderId)))).status).toBe(200);
    expect((await confirm(orderId)).body.data.status).toBe('paid');
    expect(db.payments.filter(p => p.order_id === orderId)).toHaveLength(1);
  });

  it.each([
    ['a wrong signature', 'sha256=' + '0'.repeat(64)],
    ['a signature without the sha256= prefix', null],
    ['no signature', '']
  ])('refuses %s', async (_label, signature) => {
    const { orderId } = await createOrder();
    const payload = successEvent(sessionFor(orderId));
    const bare = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
    const res = await webhook(payload, signature ?? bare);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(userByEmail(personas.basic).membership_tier).toBe('basic');
  });

  it('refuses a body changed after signing', async () => {
    const { orderId } = await createOrder();
    const payload = successEvent(sessionFor(orderId));
    const sig = `sha256=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex')}`;
    const res = await api()
      .post('/api/payment/youpi/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Gateway-Signature', sig)
      .send(JSON.stringify({ ...payload, amountPaise: 1 }));
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown orders and sessions without applying anything', async () => {
    const { orderId } = await createOrder();
    const other = successEvent(sessionFor(orderId), { paymentId: crypto.randomUUID() });
    expect((await webhook(other)).status).toBe(200);
    expect((await webhook(successEvent(sessionFor(orderId), { orderId: 'ypo_unknown' }))).status).toBe(200);
    expect(userByEmail(personas.basic).membership_tier).toBe('basic');
  });

  it('rejects a SUCCESS for the wrong amount, so the page cannot activate it either', async () => {
    const { orderId } = await createOrder();
    await webhook(successEvent(sessionFor(orderId), { amountPaise: 100 }));
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('rejected');
    sessionFor(orderId).status = 'SUCCESS';
    expect((await confirm(orderId)).body.code).toBe('ORDER_REJECTED');
  });

  it('still activates an order that expired before the bank alert arrived', async () => {
    const { orderId } = await createOrder();
    await webhook({ ...successEvent(sessionFor(orderId)), event: 'EXPIRED' });
    expect(db.payment_orders.find(o => o.id === orderId)!.status).toBe('failed');
    await webhook(successEvent(sessionFor(orderId)));
    expect(userByEmail(personas.basic).membership_tier).toBe('pro');
  });

  it('is refused when no webhook secret is configured', async () => {
    const { orderId } = await createOrder();
    const payload = successEvent(sessionFor(orderId));
    config.youpi.webhookSecret = '';
    const res = await webhook(payload);
    expect(res.status).toBe(503);
  });
});
