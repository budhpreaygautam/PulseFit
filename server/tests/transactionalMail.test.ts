import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { setRazorpayClientForTests } from '../src/controllers/paymentController.js';
import { setMailSenderForTests, type Mail } from '../src/lib/mailer.js';
import { api, authHeader, db, personas, resetDb } from './helpers.js';

// Reset links, booking confirmations and payment receipts: sent only when email is set up, never in the way of the action.

const NOW = new Date('2026-10-07T06:30:00.000Z');
const THU = '2026-10-08';
const KEY_SECRET = 'test-key-secret';
const original = { isLocal: config.isLocal, isProduction: config.isProduction, logResetLinks: config.logResetLinks, publicUrl: config.publicUrl, razorpay: { ...config.razorpay } };
let sent: Mail[];
let sender: (mail: Mail) => Promise<void>;

const forgot = (email: string) => api().post('/api/auth/forgot-password').send({ email });
const book = () => api().post('/api/bookings').set(authHeader(personas.member)).send({ class_id: 'cls_zumba_thu', booking_date: THU });
async function pay() {
  const plan = db.membership_plans.find(p => p.tier === 'pro')!;
  const orderRes = await api().post('/api/payment/create-order').set(authHeader(personas.member)).send({ tier: 'pro', billing_cycle: 'monthly' });
  expect(orderRes.status).toBe(200);
  const orderId = orderRes.body.data.orderId as string;
  const payId = 'pay_receipt_1';
  const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${payId}`).digest('hex');
  const res = await api().post('/api/payment/verify').set(authHeader(personas.member)).send({ razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: signature });
  return { res, plan };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
  db.offers = [];
  sent = [];
  sender = async mail => void sent.push(mail);
  setMailSenderForTests(mail => sender(mail));
  Object.assign(config.mail, { brevoApiKey: 'test-key', from: 'desk@example.com' });
  Object.assign(config.razorpay, { keyId: 'rzp_test', keySecret: KEY_SECRET });
  setRazorpayClientForTests({ orders: { create: async p => ({ id: 'order_tx_1', amount: p.amount, currency: p.currency }) } });
});
afterEach(() => {
  setMailSenderForTests(null);
  setRazorpayClientForTests(null);
  Object.assign(config.mail, { brevoApiKey: '', from: '' });
  Object.assign(config, { isLocal: original.isLocal, isProduction: original.isProduction, logResetLinks: original.logResetLinks, publicUrl: original.publicUrl });
  Object.assign(config.razorpay, original.razorpay);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('forgot password email', () => {
  beforeEach(() => Object.assign(config, { isLocal: false, isProduction: true, logResetLinks: false, publicUrl: 'https://gym.example' }));

  it('mails the link to a known address, and nothing for an unknown one, with the same answer', async () => {
    const known = await forgot(personas.basic);
    const unknown = await forgot('ghost@example.com');
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].to).toBe(personas.basic);
    expect(sent[0].text).toContain('https://gym.example/reset-password?token=');
  });

  it('sends nothing and gives the desk message when email is not set up', async () => {
    config.mail.brevoApiKey = '';
    const res = await forgot(personas.basic);
    expect(res.body.data.message).toMatch(/front desk/);
    expect(sent).toHaveLength(0);
  });
});

describe('booking and payment emails', () => {
  it('confirms a booking with class name, date and time', async () => {
    const res = await book();
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].to).toBe(personas.member);
    expect(sent[0].text).toContain('Core & Cardio Burn Session');
    expect(sent[0].text).toContain('2026');
    expect(sent[0].text).toContain(db.classes.find(c => c.id === 'cls_zumba_thu')!.start_time);
  });

  it('receipts a payment with plan, amount and reference', async () => {
    const { res, plan } = await pay();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].text).toContain(plan.name);
    expect(sent[0].text).toContain(String(res.body.data.payment.amount_inr));
    expect(sent[0].text).toContain('pay_receipt_1');
  });

  it('sends nothing when email is not set up', async () => {
    config.mail.brevoApiKey = '';
    expect((await book()).status).toBe(201);
    expect((await pay()).res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['throws', async () => { throw new Error('Brevo answered 500'); }],
    ['hangs', () => new Promise<void>(() => {})]
  ])('is not held up or failed by a sender that %s', async (_name, bad) => {
    sender = bad;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await book()).status).toBe(201);
    expect((await pay()).res.status).toBe(200);
    if (_name === 'throws') {
      await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2));
      const logged = error.mock.calls.map(a => String(a[0])).join('\n');
      expect(logged).toContain('Brevo answered 500');
      expect(logged).not.toContain(personas.member);
    }
  });
});
