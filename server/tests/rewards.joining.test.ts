import crypto from 'crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { setRazorpayClientForTests } from '../src/controllers/paymentController.js';
import { addDays, displayDate } from '../src/lib/dates.js';
import { addMember, api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import type { Gift, User } from '../src/types/index.js';

const KEY_ID = 'rzp_test_pulsefit';
const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';
// Wednesday 7 Oct 2026, noon at the gym.
const NOW = new Date('2026-10-07T06:30:00.000Z');

const original = { ...config.razorpay };
let orderSeq = 0;
const createOrderMock = vi.fn(async (params: { amount: number; currency: string }) => ({
  id: `order_join_${++orderSeq}`,
  amount: params.amount,
  currency: params.currency
}));

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

async function createOrder(email: string, tier: string, billing_cycle: string) {
  const res = await api().post('/api/payment/create-order').set(authHeader(email)).send({ tier, billing_cycle });
  expect(res.status).toBe(200);
  return res.body.data as { orderId: string; amount: number };
}

function verify(email: string, orderId: string, paymentId = `pay_${orderId}`) {
  return api()
    .post('/api/payment/verify')
    .set(authHeader(email))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) });
}

function webhook(orderId: string, paymentId: string, amountPaise: number) {
  const raw = JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise, currency: 'INR', status: 'captured' } } }
  });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(raw);
}

/** Buy a plan online and return the verify answer's payment. */
async function buy(email: string, tier: string, cycle: string) {
  const { orderId } = await createOrder(email, tier, cycle);
  const res = await verify(email, orderId);
  expect(res.status).toBe(200);
  return res.body.data.payment as { id: string };
}

const claims = (userId: string) => db.gift_claims.filter(c => c.user_id === userId);
const giftIds = (userId: string) => claims(userId).map(c => c.gift_id);
const ledger = (userId: string) => db.points_ledger.filter(e => e.user_id === userId);
const deskPayments = (userId: string) => db.payments.filter(p => p.user_id === userId && p.source === 'desk');
const deskSale = (user: User, body: object, email: string = personas.admin) =>
  api().post(`/api/members/${user.id}/desk-sale`).set(authHeader(email)).send(body);
const SALE = { tier: 'basic', billing_cycle: 'annual', amount_inr: 7188, method: 'cash' } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
  Object.assign(config.razorpay, { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
  setRazorpayClientForTests({ orders: { create: createOrderMock } });
  // The joining gifts in stock, so claims start ready (apparel still waits for a size).
  const stocked: Partial<Gift> = { stock: 20 };
  db.gifts = db.gifts.map(g => (['gift_shaker', 'gift_water_bottle', 'gift_sample_pack'].includes(g.id) ? { ...g, ...stocked } : g));
});

afterEach(() => {
  Object.assign(config.razorpay, original);
  setRazorpayClientForTests(null);
  vi.useRealTimers();
});

it('verify grants the annual joining bundle once, keyed join:<paymentId>', async () => {
  const m = addMember();
  const payment = await buy(m.email, 'basic', 'annual');
  expect(claims(m.id).map(c => [c.gift_id, c.status, c.source, c.source_ref])).toEqual([
    ['gift_tshirt', 'needs_size', 'joining', payment.id],
    ['gift_shaker', 'ready', 'joining', payment.id]
  ]);
  expect(ledger(m.id)).toEqual([expect.objectContaining({ key: `join:${payment.id}`, points: 0, reason: 'bonus' })]);
});

it('the webhook arriving after verify grants nothing more', async () => {
  const m = addMember();
  const { orderId, amount } = await createOrder(m.email, 'basic', 'annual');
  expect((await verify(m.email, orderId)).status).toBe(200);
  expect((await webhook(orderId, `pay_${orderId}`, amount)).status).toBe(200);
  expect(claims(m.id)).toHaveLength(2);
  expect(ledger(m.id).filter(e => e.key.startsWith('join:'))).toHaveLength(1);
});

it('the monthly sample pack comes once per member across renewals', async () => {
  const m = addMember();
  await buy(m.email, 'basic', 'monthly');
  await buy(m.email, 'basic', 'monthly');
  expect(giftIds(m.id)).toEqual(['gift_sample_pack']);
  expect(ledger(m.id).map(e => e.key)).toEqual([`join-once:gift_sample_pack:${m.id}`]);
});

it('the annual kit comes with every annual purchase', async () => {
  const m = addMember();
  await buy(m.email, 'pro', 'annual');
  await buy(m.email, 'pro', 'annual');
  expect(giftIds(m.id).filter(id => id === 'gift_shaker')).toHaveLength(2);
});

it('staff accounts buying a plan get no joining gifts', async () => {
  const admin = userByEmail(personas.admin);
  await buy(personas.admin, 'basic', 'annual');
  expect(claims(admin.id)).toEqual([]);
});

it('a desk sale records a desk Payment with an invoice and activates like an online payment', async () => {
  const m = addMember({ membership_tier: 'basic', membership_expiry: '2026-10-20' });
  const admin = userByEmail(personas.admin);
  const res = await deskSale(m, { tier: 'basic', billing_cycle: 'monthly', amount_inr: 699, method: 'cash' });
  expect(res.status).toBe(200);
  const { payment, user } = res.body.data;
  // A renewal of the same active plan starts the day after the current last day.
  expect(payment).toMatchObject({
    source: 'desk',
    desk_method: 'cash',
    recorded_by: { id: admin.id, name: admin.name },
    order_id: '',
    razorpay_payment_id: '',
    amount_inr: 699,
    tier: 'basic',
    billing_cycle: 'monthly',
    period_start: '2026-10-21',
    status: 'paid'
  });
  expect(payment.invoice_number).toMatch(/^PF-\d{4}-\d{6}$/);
  expect(payment).not.toHaveProperty('base_amount_inr');
  expect(payment).not.toHaveProperty('discount_inr');
  expect(user).toMatchObject({ membership_tier: 'basic', membership_status: 'active', membership_expiry: payment.period_end });
  expect(res.body.message).toContain(displayDate(payment.period_end));
  const mine = await api().get('/api/payments/my').set(authHeader(m.email));
  expect(mine.body.data.map((p: { id: string }) => p.id)).toEqual([payment.id]);
});

it('a desk sale grants the joining gifts', async () => {
  const m = addMember();
  const res = await deskSale(m, SALE);
  expect(res.body.data.gifts.map((c: { gift_id: string }) => c.gift_id)).toEqual(['gift_tshirt', 'gift_shaker']);
  expect(giftIds(m.id)).toEqual(['gift_tshirt', 'gift_shaker']);
  expect(res.body.message).toMatch(/T-shirt/);
  expect(ledger(m.id).map(e => e.key)).toEqual([`join:${res.body.data.payment.id}`]);
});

it('a second identical desk sale within 2 minutes is refused and grants nothing', async () => {
  const m = addMember();
  expect((await deskSale(m, SALE)).status).toBe(200);
  const expiry = db.users.find(u => u.id === m.id)!.membership_expiry;

  vi.setSystemTime(new Date(NOW.getTime() + 60_000));
  const again = await deskSale(m, SALE);
  expect([again.status, again.body.code]).toEqual([409, 'DESK_SALE_DUPLICATE']);
  expect(deskPayments(m.id)).toHaveLength(1);
  expect(db.users.find(u => u.id === m.id)!.membership_expiry).toBe(expiry);
  expect(claims(m.id)).toHaveLength(2);

  vi.setSystemTime(new Date(NOW.getTime() + 120_000));
  expect((await deskSale(m, SALE)).status).toBe(200);
  expect(deskPayments(m.id)).toHaveLength(2);
});

it('Add member with desk_sale creates an active member, a desk payment and joining gifts', async () => {
  const res = await api()
    .post('/api/members')
    .set(authHeader(personas.admin))
    .send({ name: 'Meera Nair', email: 'meera@example.com', desk_sale: { tier: 'pro', billing_cycle: 'annual', amount_inr: 9000, method: 'upi' } });
  expect(res.status).toBe(201);
  const { member, payment, gifts, tempPassword } = res.body.data;
  expect(typeof tempPassword).toBe('string');
  // Starts today: 12 months from 7 Oct 2026, last day 6 Oct 2027.
  expect(member).toMatchObject({ membership_tier: 'pro', membership_status: 'active', membership_expiry: '2027-10-06' });
  expect(payment).toMatchObject({ user_id: member.id, source: 'desk', desk_method: 'upi', amount_inr: 9000, period_start: '2026-10-07', period_end: '2027-10-06' });
  expect(gifts.map((c: { gift_id: string }) => c.gift_id)).toEqual(['gift_tshirt', 'gift_shaker']);
  expect(deskPayments(member.id)).toHaveLength(1);
});

it('Add member refuses desk_sale together with free months or another tier', async () => {
  const sale = { tier: 'pro', billing_cycle: 'monthly', amount_inr: 999, method: 'card' };
  for (const extra of [{ expiry_months: 1 }, { membership_tier: 'vip' }]) {
    const res = await api()
      .post('/api/members')
      .set(authHeader(personas.admin))
      .send({ name: 'Meera Nair', email: 'meera@example.com', desk_sale: sale, ...extra });
    expect([res.status, res.body.code, res.body.data.issues[0].path]).toEqual([400, 'VALIDATION_ERROR', 'desk_sale']);
  }
  expect(db.users.some(u => u.email === 'meera@example.com')).toBe(false);
  const same = await api()
    .post('/api/members')
    .set(authHeader(personas.admin))
    .send({ name: 'Meera Nair', email: 'meera@example.com', membership_tier: 'pro', desk_sale: sale });
  expect(same.status).toBe(201);
});

it('ordinary member edits never grant joining gifts or points', async () => {
  const m = addMember({ membership_status: 'pending', membership_tier: 'none', membership_expiry: null });
  const put = (body: object) => api().put(`/api/members/${m.id}`).set(authHeader(personas.admin)).send(body);
  expect((await put({ membership_tier: 'basic', membership_status: 'active', membership_expiry: addDays('2026-10-07', 365) })).status).toBe(200);
  expect((await put({ membership_tier: 'vip' })).status).toBe(200);
  expect((await put({ membership_status: 'frozen' })).status).toBe(200);
  expect((await put({ membership_status: 'active' })).status).toBe(200);
  expect(claims(m.id)).toEqual([]);
  expect(ledger(m.id)).toEqual([]);
});

it('desk sale validation and access', async () => {
  const m = addMember();
  for (const body of [{ ...SALE, amount_inr: 0 }, { ...SALE, method: 'cheque' }, { ...SALE, amount_inr: 1_200_001 }, { ...SALE, discount: 100 }]) {
    const res = await deskSale(m, body);
    expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_ERROR']);
  }
  expect((await deskSale(m, SALE, personas.trainer)).status).toBe(403);
  expect((await api().post('/api/members/usr_nope/desk-sale').set(authHeader(personas.admin)).send(SALE)).status).toBe(404);
  expect(deskPayments(m.id)).toEqual([]);
});
