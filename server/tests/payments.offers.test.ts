import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { setRazorpayClientForTests } from '../src/controllers/paymentController.js';
import { resetAuthRateLimits } from '../src/lib/authRateLimits.js';
import { addDays } from '../src/lib/dates.js';
import { addMember, api, authHeader, db, personas, resetDb } from './helpers.js';
import type { Coupon, Offer } from '../src/types/index.js';

const KEY_ID = 'rzp_test_pulsefit';
const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';
// Wednesday 7 Oct 2026, noon at the gym.
const NOW = new Date('2026-10-07T06:30:00.000Z');

const original = { razorpay: { ...config.razorpay }, rateLimit: config.rateLimit.enabled };
let orderSeq = 0;
const createOrderMock = vi.fn(async (params: { amount: number; currency: string }) => ({
  id: `order_offer_${++orderSeq}`,
  amount: params.amount,
  currency: params.currency
}));

const plan = (tier: 'basic' | 'pro' | 'vip') => db.membership_plans.find(p => p.tier === tier)!;
let offerSeq = 0;

/** A live sale on every plan unless the patch says otherwise. */
function offer(patch: Partial<Offer> = {}): Offer {
  const o: Offer = {
    id: `off_test_${++offerSeq}`,
    title: 'Festive sale',
    banner_text: 'Save on every plan this week',
    percent_off: 15,
    amount_off: null,
    tiers: [],
    billing_cycles: [],
    starts_at: '2026-10-01T00:00:00.000Z',
    ends_at: '2026-10-14T18:30:00.000Z',
    active: true,
    created_at: '2026-09-30T00:00:00.000Z',
    ...patch
  };
  db.offers = [...db.offers, o];
  return o;
}

/** A valid coupon for every plan unless the patch says otherwise. */
function coupon(patch: Partial<Coupon> = {}): Coupon {
  const c: Coupon = {
    code: 'WELCOME10',
    percent_off: 10,
    amount_off: null,
    tiers: [],
    billing_cycles: [],
    valid_from: '2026-10-01',
    valid_until: '2026-10-31',
    max_uses: null,
    per_member_limit: 1,
    uses: 0,
    active: true,
    created_at: '2026-09-30T00:00:00.000Z',
    ...patch
  };
  db.coupons = [...db.coupons, c];
  return c;
}

const quote = (body: object, email: string = personas.basic) =>
  api().post('/api/payment/quote').set(authHeader(email)).send(body);
const createOrder = (body: object, email: string = personas.basic) =>
  api().post('/api/payment/create-order').set(authHeader(email)).send(body);
const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
const verify = (orderId: string, email: string = personas.basic) =>
  api()
    .post('/api/payment/verify')
    .set(authHeader(email))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: `pay_${orderId}`, razorpay_signature: sign(orderId, `pay_${orderId}`) });
function webhook(orderId: string, amountPaise: number) {
  const raw = JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_${orderId}`, order_id: orderId, amount: amountPaise, currency: 'INR', status: 'captured' } } }
  });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(raw);
}

async function orderWith(body: object, email: string = personas.basic) {
  const res = await createOrder(body, email);
  expect(res.status).toBe(200);
  return res.body.data as { orderId: string; amount: number; amount_inr: number; base_amount_inr: number; discount_inr: number };
}

const usesOf = (code: string) => db.coupons.find(c => c.code === code)!.uses;
const MONTHLY_BASIC = { tier: 'basic', billing_cycle: 'monthly' } as const;
const ANNUAL_BASIC = { tier: 'basic', billing_cycle: 'annual' } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
  db.offers = [];
  db.coupons = [];
  Object.assign(config.razorpay, { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
  createOrderMock.mockClear();
  setRazorpayClientForTests({ orders: { create: createOrderMock } });
});

afterEach(async () => {
  Object.assign(config.razorpay, original.razorpay);
  config.rateLimit.enabled = original.rateLimit;
  await resetAuthRateLimits();
  setRazorpayClientForTests(null);
  vi.useRealTimers();
});

describe('POST /payment/quote', () => {
  it('quotes the list price when nothing applies', async () => {
    const res = await quote(MONTHLY_BASIC);
    expect(res.status).toBe(200);
    const price = plan('basic').price_monthly;
    expect(res.body.data).toEqual({ tier: 'basic', billing_cycle: 'monthly', base: price, discount: 0, total: price, applied: null });
  });

  it('applies a live offer for its tiers and cycles only', async () => {
    const sale = offer({ tiers: ['basic'], billing_cycles: ['annual'], percent_off: 15 });
    const hit = (await quote(ANNUAL_BASIC)).body.data;
    expect(hit.applied).toEqual({ type: 'offer', id: sale.id, label: '15% off' });
    expect(hit.offer_ends_at).toBe(sale.ends_at);
    expect(hit.discount).toBe(Math.floor((plan('basic').price_annual * 15) / 100));
    for (const other of [MONTHLY_BASIC, { tier: 'pro', billing_cycle: 'annual' }]) {
      const res = (await quote(other)).body.data;
      expect([res.applied, res.offer_ends_at]).toEqual([null, undefined]);
    }

    for (const patch of [
      { starts_at: '2026-10-08T00:00:00.000Z' }, // not started
      { ends_at: NOW.toISOString() }, // ended this instant
      { active: false }
    ]) {
      db.offers = [];
      offer(patch);
      expect((await quote(ANNUAL_BASIC)).body.data.applied).toBeNull();
    }
  });

  it('takes the larger of offer and coupon, never both; a tie goes to the offer', async () => {
    const base = plan('basic').price_annual;
    const sale = offer({ percent_off: 10 });
    coupon({ code: 'BIG20', percent_off: 20 });
    coupon({ code: 'SMALL5', percent_off: 5 });
    coupon({ code: 'TIE10', percent_off: 10 });

    const big = (await quote({ ...ANNUAL_BASIC, coupon_code: 'BIG20' })).body.data;
    expect(big).toMatchObject({ applied: { type: 'coupon', code: 'BIG20', label: 'BIG20: 20% off' }, discount: Math.floor(base * 0.2) });
    expect(big.offer_ends_at).toBeUndefined();
    for (const code of ['SMALL5', 'TIE10']) {
      const res = (await quote({ ...ANNUAL_BASIC, coupon_code: code })).body.data;
      expect(res).toMatchObject({ applied: { type: 'offer', id: sale.id }, discount: Math.floor(base * 0.1), total: base - Math.floor(base * 0.1) });
    }

    db.offers = [];
    offer({ percent_off: null, amount_off: 500 });
    const flat = (await quote({ ...ANNUAL_BASIC, coupon_code: 'SMALL5' })).body.data;
    expect(flat).toMatchObject({ applied: { type: 'offer', label: '₹500 off' }, discount: 500, total: base - 500 });
  });

  it('floors the total at ₹1 and rounds percentages down', async () => {
    const monthly = plan('basic').price_monthly;
    offer({ percent_off: null, amount_off: 100_000, billing_cycles: ['monthly'] });
    expect((await quote(MONTHLY_BASIC)).body.data).toMatchObject({ base: monthly, discount: monthly - 1, total: 1 });

    offer({ percent_off: 15, billing_cycles: ['annual'] });
    const annual = (await quote(ANNUAL_BASIC)).body.data;
    expect(annual.discount).toBe(Math.floor((plan('basic').price_annual * 15) / 100));
    expect(annual.total).toBe(plan('basic').price_annual - annual.discount);
  });

  it('names each coupon problem with its code', async () => {
    coupon({ code: 'OFFLINE1', active: false });
    coupon({ code: 'SOON1234', valid_from: '2026-10-08' });
    coupon({ code: 'OLD12345', valid_until: '2026-10-06' });
    coupon({ code: 'TODAY123', valid_from: '2026-10-07', valid_until: '2026-10-07' });
    coupon({ code: 'VIPONLY1', tiers: ['vip'] });
    coupon({ code: 'ANNUAL12', billing_cycles: ['annual'] });
    coupon({ code: 'GONE1234', max_uses: 3, uses: 3 });
    coupon({ code: 'ONCEEACH', max_uses: null, per_member_limit: 1 });

    const expectCode = async (coupon_code: string, code: string) => {
      const res = await quote({ ...MONTHLY_BASIC, coupon_code });
      expect([coupon_code, res.status, res.body.code]).toEqual([coupon_code, 400, code]);
    };
    for (const c of ['NOPE1234', 'OFFLINE1', 'ab', 'AB!CD', 'SOON1234']) await expectCode(c, 'COUPON_INVALID');
    await expectCode('OLD12345', 'COUPON_EXPIRED');
    await expectCode('VIPONLY1', 'COUPON_NOT_FOR_PLAN');
    await expectCode('ANNUAL12', 'COUPON_NOT_FOR_PLAN');
    await expectCode('GONE1234', 'COUPON_USED_UP');
    expect((await quote({ ...MONTHLY_BASIC, coupon_code: 'TODAY123' })).status).toBe(200);

    // Once used on a paid order, the member's own limit is reached.
    const { orderId } = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'ONCEEACH' });
    expect((await verify(orderId)).status).toBe(200);
    await expectCode('ONCEEACH', 'COUPON_USED_UP');
    expect((await quote({ ...MONTHLY_BASIC, coupon_code: 'ONCEEACH' }, personas.member)).status).toBe(200);
  });

  it('accepts a coupon typed in lower case or with spaces', async () => {
    coupon();
    const res = await quote({ ...MONTHLY_BASIC, coupon_code: ' welcome10 ' });
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toEqual({ type: 'coupon', code: 'WELCOME10', label: 'WELCOME10: 10% off' });
  });

  it('quote and create-order with coupon_code "" or "  " charge the normal price', async () => {
    const price = plan('basic').price_monthly;
    for (const coupon_code of ['', '  ']) {
      const q = await quote({ ...MONTHLY_BASIC, coupon_code });
      expect([q.status, q.body.data.applied, q.body.data.total]).toEqual([200, null, price]);
      const order = await orderWith({ ...MONTHLY_BASIC, coupon_code });
      expect(db.payment_orders.find(o => o.id === order.orderId)).toMatchObject({ amount_inr: price, discount_inr: 0 });
      expect(db.payment_orders.find(o => o.id === order.orderId)).not.toHaveProperty('coupon_code');
    }
  });

  it('rate-limits failed coupon attempts per member', async () => {
    config.rateLimit.enabled = true;
    await resetAuthRateLimits();
    coupon();
    const bad = () => quote({ ...MONTHLY_BASIC, coupon_code: 'NOPE1234' });
    for (let i = 0; i < 9; i++) expect((await bad()).status).toBe(400);
    // Neither a valid code nor an emptied field counts.
    expect((await quote({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' })).status).toBe(200);
    expect((await quote({ ...MONTHLY_BASIC, coupon_code: ' ' })).status).toBe(200);
    expect((await bad()).status).toBe(400);
    const limited = await bad();
    expect([limited.status, limited.body.code]).toEqual([429, 'RATE_LIMITED']);
    expect((await createOrder({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' })).status).toBe(429);
    // Without a code the member can still pay the normal price; another member is not limited.
    expect((await quote(MONTHLY_BASIC)).status).toBe(200);
    expect((await quote({ ...MONTHLY_BASIC, coupon_code: 'NOPE1234' }, personas.member)).status).toBe(400);
  });
});

describe('GET /payment/quotes', () => {
  it('lists all six plan prices for signed-in accounts only', async () => {
    expect((await api().get('/api/payment/quotes')).status).toBe(401);
    const sale = offer({ billing_cycles: ['annual'], percent_off: 20 });
    const res = await api().get('/api/payment/quotes').set(authHeader(personas.member));
    expect(res.status).toBe(200);
    expect(res.body.data.map((q: { tier: string; billing_cycle: string }) => `${q.tier}/${q.billing_cycle}`)).toEqual([
      'basic/monthly',
      'basic/annual',
      'pro/monthly',
      'pro/annual',
      'vip/monthly',
      'vip/annual'
    ]);
    for (const q of res.body.data) {
      expect(q.applied).toEqual(q.billing_cycle === 'annual' ? { type: 'offer', id: sale.id, label: '20% off' } : null);
    }
  });
});

describe('POST /payment/create-order with offers and coupons', () => {
  it('charges the quoted total and stores how it was priced', async () => {
    coupon();
    const base = plan('pro').price_monthly;
    const discount = Math.floor(base / 10);
    const res = await createOrder({ tier: 'pro', billing_cycle: 'monthly', coupon_code: 'welcome10' });
    expect(res.status).toBe(200);
    expect(createOrderMock).toHaveBeenLastCalledWith(expect.objectContaining({ amount: (base - discount) * 100 }));
    expect(res.body.data).toMatchObject({
      amount: (base - discount) * 100,
      amount_inr: base - discount,
      base_amount_inr: base,
      discount_inr: discount,
      applied: { type: 'coupon', code: 'WELCOME10' }
    });
    const order = db.payment_orders.find(o => o.id === res.body.data.orderId)!;
    expect(order).toMatchObject({ amount_inr: base - discount, base_amount_inr: base, discount_inr: discount, coupon_code: 'WELCOME10' });
    expect(order).not.toHaveProperty('offer_id');

    const sale = offer({ percent_off: 15 });
    const withOffer = await orderWith({ tier: 'pro', billing_cycle: 'monthly' });
    expect(db.payment_orders.find(o => o.id === withOffer.orderId)).toMatchObject({ offer_id: sale.id, discount_inr: Math.floor(base * 0.15) });
  });

  it('ignores prices in the body and refuses a bad coupon without an order', async () => {
    const price = plan('basic').price_monthly;
    const res = await orderWith({ ...MONTHLY_BASIC, amount_inr: 1, discount: 999, discount_inr: 999 });
    expect(res.amount_inr).toBe(price);

    const before = db.payment_orders.length;
    createOrderMock.mockClear();
    const bad = await createOrder({ ...MONTHLY_BASIC, coupon_code: 'NOPE1234' });
    expect([bad.status, bad.body.code]).toEqual([400, 'COUPON_INVALID']);
    expect(db.payment_orders).toHaveLength(before);
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it('the webhook activates a discounted order for its total and rejects the list price', async () => {
    coupon();
    const list = plan('basic').price_monthly;
    const paid = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' }, personas.member);
    expect((await webhook(paid.orderId, paid.amount)).status).toBe(200);
    expect(db.payments.find(p => p.order_id === paid.orderId)).toMatchObject({ amount_inr: paid.amount_inr, source: 'webhook' });

    const m = addMember();
    const wrong = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' }, m.email);
    expect((await webhook(wrong.orderId, list * 100)).status).toBe(200);
    expect(db.payment_orders.find(o => o.id === wrong.orderId)!.status).toBe('rejected');
    expect(db.payments.some(p => p.order_id === wrong.orderId)).toBe(false);
    expect(usesOf('WELCOME10')).toBe(1);
  });

  it('counts a coupon use once, on activation, even when verify and the webhook both arrive', async () => {
    coupon();
    const order = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' });
    expect(usesOf('WELCOME10')).toBe(0);
    expect((await verify(order.orderId)).status).toBe(200);
    expect((await webhook(order.orderId, order.amount)).status).toBe(200);
    expect(usesOf('WELCOME10')).toBe(1);
  });

  it('honours a coupon that ran out between order and payment', async () => {
    coupon({ max_uses: 1 });
    const first = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' }, personas.basic);
    const second = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' }, personas.member);
    expect((await verify(first.orderId, personas.basic)).status).toBe(200);
    expect((await verify(second.orderId, personas.member)).status).toBe(200);
    expect(usesOf('WELCOME10')).toBe(2);
    expect((await quote({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' }, personas.vip)).body.code).toBe('COUPON_USED_UP');
  });

  it('applies a coupon once per member even when the member pays several open orders made with it (review)', async () => {
    coupon();
    const first = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' });
    const second = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'WELCOME10' });
    expect((await verify(first.orderId)).status).toBe(200);
    const again = await verify(second.orderId);
    expect([again.status, again.body.code]).toEqual([409, 'ORDER_REJECTED']);
    expect((await webhook(second.orderId, second.amount)).status).toBe(200);
    expect(db.payment_orders.find(o => o.id === second.orderId)).toMatchObject({ status: 'rejected', razorpay_payment_id: `pay_${second.orderId}` });
    expect(db.payments.filter(p => p.coupon_code === 'WELCOME10')).toHaveLength(1);
    expect(usesOf('WELCOME10')).toBe(1);
  });

  it('a sale or coupon that has ended holds only for an order paid within 30 minutes (review)', async () => {
    const at = (minutes: number) => vi.setSystemTime(new Date(NOW.getTime() + minutes * 60_000));
    // A 90% sale that ends at 12:10 gym time; it is 12:00.
    offer({ percent_off: 90, ends_at: '2026-10-07T06:40:00.000Z' });
    const quick = await orderWith(ANNUAL_BASIC);
    const slow = await orderWith(ANNUAL_BASIC, personas.member);
    at(30);
    expect((await verify(quick.orderId)).status).toBe(200);
    at(31);
    const late = await verify(slow.orderId, personas.member);
    expect([late.status, late.body.code]).toEqual([409, 'ORDER_REJECTED']);
    expect(db.payments.some(p => p.order_id === slow.orderId)).toBe(false);

    // A coupon: still valid the next morning, honoured; expired by then, refused.
    db.offers = [];
    at(0);
    coupon({ code: 'LASTDAY1', valid_until: '2026-10-07' });
    coupon({ code: 'ALLMONTH' });
    const expiring = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'LASTDAY1' }, personas.vip);
    const lasting = await orderWith({ ...MONTHLY_BASIC, coupon_code: 'ALLMONTH' }, personas.expired);
    vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'));
    expect((await verify(expiring.orderId, personas.vip)).body.code).toBe('ORDER_REJECTED');
    expect((await verify(lasting.orderId, personas.expired)).status).toBe(200);
    expect([usesOf('LASTDAY1'), usesOf('ALLMONTH')]).toEqual([0, 1]);
  });

  it('upgrade credit counts what a discounted period cost, not its list price (review)', async () => {
    offer({ percent_off: 90, tiers: ['basic'], billing_cycles: ['annual'] });
    const m = addMember({ membership_tier: 'none', membership_status: 'pending', membership_expiry: null });
    const basic = await orderWith(ANNUAL_BASIC, m.email);
    expect((await verify(basic.orderId, m.email)).status).toBe(200);
    const vip = await orderWith({ tier: 'vip', billing_cycle: 'monthly' }, m.email);
    const paid = (await verify(vip.orderId, m.email)).body.data.payment;
    // 365 unused days of Basic, a tenth of them paid for, turned into VIP days.
    const paidDays = (365 * basic.amount_inr) / basic.base_amount_inr;
    expect(paid.period_end).toBe(addDays('2026-11-06', Math.floor((paidDays * plan('basic').price_monthly) / plan('vip').price_monthly)));
  });

  it('copies base, discount, offer and coupon onto the payment', async () => {
    coupon({ percent_off: 30 });
    const sale = offer({ percent_off: 15 });
    const base = plan('basic').price_annual;

    const viaCoupon = await orderWith({ ...ANNUAL_BASIC, coupon_code: 'WELCOME10' });
    const paidCoupon = (await verify(viaCoupon.orderId)).body.data.payment;
    expect(paidCoupon).toMatchObject({ amount_inr: base - Math.floor(base * 0.3), base_amount_inr: base, discount_inr: Math.floor(base * 0.3), coupon_code: 'WELCOME10' });
    expect(paidCoupon).not.toHaveProperty('offer_id');

    const viaOffer = await orderWith(ANNUAL_BASIC, personas.member);
    const paidOffer = (await verify(viaOffer.orderId, personas.member)).body.data.payment;
    expect(paidOffer).toMatchObject({ base_amount_inr: base, discount_inr: Math.floor(base * 0.15), offer_id: sale.id });
    expect(paidOffer).not.toHaveProperty('coupon_code');
  });
});

describe('GET /promotions', () => {
  it('shows guests only the sale headline and joining gift names', async () => {
    const later = offer({ title: 'Annual sale', billing_cycles: ['annual'], percent_off: 20, ends_at: '2026-10-20T18:30:00.000Z' });
    const sooner = offer({ title: 'Flash sale', percent_off: null, amount_off: 300, ends_at: '2026-10-09T18:30:00.000Z' });
    offer({ title: 'Retired sale', active: false });
    coupon();
    const res = await api().get('/api/promotions');
    expect(res.status).toBe(200);
    expect(res.body.data.sales.map((s: { title: string }) => s.title)).toEqual([sooner.title, later.title]);
    for (const sale of res.body.data.sales) expect(Object.keys(sale).sort()).toEqual(['amount_off', 'banner_text', 'ends_at', 'percent_off', 'title']);
    const name = (id: string) => db.gifts.find(g => g.id === id)!.name;
    expect(res.body.data.joining_gifts).toContainEqual({ tier: 'basic', billing_cycle: 'annual', gifts: [name('gift_tshirt'), name('gift_shaker')] });
    const text = JSON.stringify(res.body);
    for (const secret of ['WELCOME10', 'stock', 'usr_', 'off_test_']) expect(text).not.toContain(secret);
  });
});

describe('offers and coupons admin', () => {
  const OFFER = {
    title: 'Diwali sale',
    banner_text: '20% off annual plans',
    percent_off: 20,
    tiers: [],
    billing_cycles: ['annual'],
    starts_at: '2026-10-07T00:00:00.000Z',
    ends_at: '2026-10-21T00:00:00.000Z'
  };
  const COUPON = { code: ' summer25 ', percent_off: 25, tiers: ['pro'], billing_cycles: [], valid_from: '2026-10-07', valid_until: '2026-10-31', max_uses: 50 };

  it('offer and coupon admin validation and access', async () => {
    const admin = authHeader(personas.admin);
    for (const body of [
      { ...OFFER, amount_off: 500 },
      { ...OFFER, percent_off: 91 },
      { ...OFFER, percent_off: null },
      { ...OFFER, ends_at: '2026-10-06T00:00:00.000Z' },
      { ...OFFER, title: 'x' }
    ]) {
      const res = await api().post('/api/offers').set(admin).send(body);
      expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_ERROR']);
    }
    const created = await api().post('/api/offers').set(admin).send(OFFER);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ...OFFER, amount_off: null, active: true });
    const id = created.body.data.id;
    expect((await api().get('/api/offers').set(admin)).body.data.map((o: Offer) => o.id)).toEqual([id]);
    const off = await api().put(`/api/offers/${id}`).set(admin).send({ active: false });
    expect([off.status, off.body.data.active, off.body.data.title]).toEqual([200, false, OFFER.title]);
    const swap = await api().put(`/api/offers/${id}`).set(admin).send({ percent_off: null, amount_off: 400 });
    expect(swap.body.data).toMatchObject({ percent_off: null, amount_off: 400 });
    expect((await api().put('/api/offers/off_nope').set(admin).send({ active: false })).body.code).toBe('OFFER_NOT_FOUND');

    for (const body of [{ ...COUPON, code: 'ab!' }, { ...COUPON, amount_off: 100 }, { ...COUPON, uses: 3 }, { ...COUPON, valid_until: '2026-10-06' }]) {
      const res = await api().post('/api/coupons').set(admin).send(body);
      expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_ERROR']);
    }
    const made = await api().post('/api/coupons').set(admin).send(COUPON);
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ code: 'SUMMER25', uses: 0, per_member_limit: 1, amount_off: null, active: true });
    const dup = await api().post('/api/coupons').set(admin).send({ ...COUPON, code: 'Summer25' });
    expect([dup.status, dup.body.code]).toEqual([409, 'COUPON_EXISTS']);
    const edited = await api().put('/api/coupons/summer25').set(admin).send({ max_uses: null, active: false });
    expect(edited.body.data).toMatchObject({ code: 'SUMMER25', max_uses: null, active: false, uses: 0 });
    expect((await api().put('/api/coupons/SUMMER25').set(admin).send({ code: 'OTHER123' })).status).toBe(400);
    expect((await api().put('/api/coupons/SUMMER25').set(admin).send({ uses: 0 })).status).toBe(400);
    expect((await api().put('/api/coupons/NOPE1234').set(admin).send({ active: true })).body.code).toBe('COUPON_NOT_FOUND');
    expect((await api().get('/api/coupons').set(admin)).body.data.map((c: Coupon) => c.code)).toEqual(['SUMMER25']);

    expect((await api().get('/api/coupons').set(authHeader(personas.member))).status).toBe(403);
    expect((await api().get('/api/offers').set(authHeader(personas.member))).status).toBe(403);
    expect((await api().post('/api/offers').set(authHeader(personas.trainer)).send(OFFER)).status).toBe(403);
    expect((await api().get('/api/coupons')).status).toBe(401);
  });
});
