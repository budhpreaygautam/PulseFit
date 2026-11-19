import crypto from 'crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { setRazorpayClientForTests } from '../src/controllers/paymentController.js';
import { GoogleProfile, InvalidGoogleTokenError, setGoogleVerifierForTests } from '../src/lib/google.js';
import { addMember, api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import type { User } from '../src/types/index.js';

const KEY_ID = 'rzp_test_pulsefit';
const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';
const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
// Wednesday 7 Oct 2026, noon at the gym.
const NOW = new Date('2026-10-07T06:30:00.000Z');

const original = { razorpay: { ...config.razorpay }, googleClientId: config.googleClientId };
let orderSeq = 0;
const createOrderMock = vi.fn(async (params: { amount: number; currency: string }) => ({
  id: `order_ref_${++orderSeq}`,
  amount: params.amount,
  currency: params.currency
}));

const sign = (orderId: string, paymentId: string) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

async function createOrder(email: string, tier = 'basic', billing_cycle = 'monthly') {
  const res = await api().post('/api/payment/create-order').set(authHeader(email)).send({ tier, billing_cycle });
  expect(res.status).toBe(200);
  return res.body.data as { orderId: string; amount: number };
}

function verify(email: string, orderId: string) {
  const paymentId = `pay_${orderId}`;
  return api()
    .post('/api/payment/verify')
    .set(authHeader(email))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) });
}

function webhook(orderId: string, amountPaise: number) {
  const raw = JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_${orderId}`, order_id: orderId, amount: amountPaise, currency: 'INR', status: 'captured' } } }
  });
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return api().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).send(raw);
}

async function buy(email: string) {
  const { orderId } = await createOrder(email);
  expect((await verify(email, orderId)).status).toBe(200);
}

/** The member's code, as their Rewards page gets it. */
async function codeOf(user: User): Promise<string> {
  const res = await api().get('/api/rewards/me').set(authHeader(user.email));
  expect(res.status).toBe(200);
  return res.body.data.referral_code;
}

const stored = (id: string) => db.users.find(u => u.id === id)!;
const keyed = (key: string) => db.points_ledger.filter(e => e.key === key);
const newcomer = (patch: Partial<User> = {}) =>
  addMember({ membership_tier: 'none', membership_status: 'pending', membership_expiry: null, ...patch });
const STRONG = 'Stronger2026';

// The fake Google verifier: the credential is the JSON of the profile it stands for.
function fakeGoogle(credential: string, audience: string): Promise<GoogleProfile> {
  if (audience !== GOOGLE_CLIENT_ID) return Promise.reject(new InvalidGoogleTokenError('bad token'));
  return Promise.resolve(JSON.parse(credential));
}
const google = (profile: GoogleProfile, extra: object = {}) =>
  api().post('/api/auth/google').send({ credential: JSON.stringify(profile), ...extra });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
  Object.assign(config.razorpay, { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
  setRazorpayClientForTests({ orders: { create: createOrderMock } });
  config.googleClientId = GOOGLE_CLIENT_ID;
  setGoogleVerifierForTests(fakeGoogle);
});

afterEach(() => {
  Object.assign(config.razorpay, original.razorpay);
  config.googleClientId = original.googleClientId;
  setRazorpayClientForTests(null);
  setGoogleVerifierForTests(null);
  vi.useRealTimers();
});

it('GET /rewards/me gives a member one stable referral code', async () => {
  const a = addMember();
  const code = await codeOf(a);
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  expect(await codeOf(a)).toBe(code);
  expect(stored(a.id).referral_code).toBe(code);
  expect(await codeOf(addMember())).not.toBe(code);
});

it('register with a referral code sets referred_by; an unknown code creates no account', async () => {
  const referrer = addMember();
  const code = await codeOf(referrer);
  const res = await api()
    .post('/api/auth/register')
    .send({ name: 'Kabir Singh', email: 'kabir@example.com', password: STRONG, referral_code: ` ${code.toLowerCase()} ` });
  expect(res.status).toBe(201);
  expect(userByEmail('kabir@example.com').referred_by).toBe(referrer.id);

  const bad = await api()
    .post('/api/auth/register')
    .send({ name: 'Nobody Here', email: 'nobody@example.com', password: STRONG, referral_code: 'ZZZZZZZZ' });
  expect([bad.status, bad.body.code]).toEqual([400, 'REFERRAL_CODE_INVALID']);
  expect(db.users.some(u => u.email === 'nobody@example.com')).toBe(false);

  // A staff account's code refers no one; an emptied field is no code.
  db.users = db.users.map(u => (u.email === personas.trainer ? { ...u, referral_code: 'TRAINER2' } : u));
  const staffCode = await api()
    .post('/api/auth/register')
    .send({ name: 'Nobody Here', email: 'nobody@example.com', password: STRONG, referral_code: 'TRAINER2' });
  expect(staffCode.body.code).toBe('REFERRAL_CODE_INVALID');
  const empty = await api()
    .post('/api/auth/register')
    .send({ name: 'Nobody Here', email: 'nobody@example.com', password: STRONG, referral_code: '  ' });
  expect(empty.status).toBe(201);
  expect(userByEmail('nobody@example.com').referred_by).toBeUndefined();
});

it('Google sign-up takes a referral code; signing in to an existing account ignores it', async () => {
  const referrer = addMember();
  const code = await codeOf(referrer);

  const unknown = await google({ sub: 'g-1', email: 'g1@gmail.com', name: 'G One' }, { referral_code: 'ZZZZZZZZ' });
  expect([unknown.status, unknown.body.code]).toEqual([400, 'REFERRAL_CODE_INVALID']);
  expect(db.users.some(u => u.email === 'g1@gmail.com')).toBe(false);

  const created = await google({ sub: 'g-1', email: 'g1@gmail.com', name: 'G One' }, { referral_code: code });
  expect(created.body.data.created).toBe(true);
  expect(userByEmail('g1@gmail.com').referred_by).toBe(referrer.id);

  const existing = addMember({ google_sub: 'g-2', email: 'g2@gmail.com' });
  const signedIn = await google({ sub: 'g-2', email: 'g2@gmail.com' }, { referral_code: 'ZZZZZZZZ' });
  expect([signedIn.status, signedIn.body.data.created]).toEqual([200, false]);
  expect(stored(existing.id).referred_by).toBeUndefined();
  const again = await google({ sub: 'g-2', email: 'g2@gmail.com' }, { referral_code: code });
  expect(again.status).toBe(200);
  expect(stored(existing.id).referred_by).toBeUndefined();
});

it('Add member takes a referral code', async () => {
  const referrer = addMember();
  const code = await codeOf(referrer);
  const add = (email: string, referral_code: string) =>
    api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'Meera Nair', email, referral_code });

  const res = await add('meera@example.com', code);
  expect(res.status).toBe(201);
  expect(stored(res.body.data.member.id).referred_by).toBe(referrer.id);
  expect(res.body.data.member).not.toHaveProperty('referred_by');

  const bad = await add('other@example.com', 'ZZZZZZZZ');
  expect([bad.status, bad.body.code]).toEqual([400, 'REFERRAL_CODE_INVALID']);
  expect(db.users.some(u => u.email === 'other@example.com')).toBe(false);
});

it('Add member with a referral code and a desk sale credits the referrer +points_per_referral and the member +welcome_points_for_referred in one request', async () => {
  const referrer = addMember();
  const code = await codeOf(referrer);
  const res = await api()
    .post('/api/members')
    .set(authHeader(personas.admin))
    .send({
      name: 'Meera Nair',
      email: 'meera@example.com',
      referral_code: code,
      desk_sale: { tier: 'basic', billing_cycle: 'monthly', amount_inr: 699, method: 'cash' }
    });
  expect(res.status).toBe(201);
  const id = res.body.data.member.id;
  expect(keyed(`referral:${id}`)).toEqual([expect.objectContaining({ user_id: referrer.id, points: 200, reason: 'referral' })]);
  expect(keyed(`referral-welcome:${id}`)).toEqual([expect.objectContaining({ user_id: id, points: 50, reason: 'referral' })]);
});

it('the first paid activation credits the referrer and welcomes the new member', async () => {
  const referrer = addMember();
  const friend = newcomer({ referred_by: referrer.id });
  await buy(friend.email);
  expect(keyed(`referral:${friend.id}`)).toEqual([expect.objectContaining({ user_id: referrer.id, points: 200, reason: 'referral' })]);
  expect(keyed(`referral-welcome:${friend.id}`)).toEqual([expect.objectContaining({ user_id: friend.id, points: 50, reason: 'referral' })]);
});

it('verify and webhook for the same first order credit once; a second payment credits nothing', async () => {
  const referrer = addMember();
  const friend = newcomer({ referred_by: referrer.id });
  const { orderId, amount } = await createOrder(friend.email);
  expect((await verify(friend.email, orderId)).status).toBe(200);
  expect((await webhook(orderId, amount)).status).toBe(200);
  await buy(friend.email);
  expect(keyed(`referral:${friend.id}`)).toHaveLength(1);
  expect(keyed(`referral-welcome:${friend.id}`)).toHaveLength(1);
  expect(db.points_ledger.filter(e => e.user_id === referrer.id)).toHaveLength(1);

  // A member who had paid before being linked earns the referrer nothing.
  const paidBefore = newcomer();
  await buy(paidBefore.email);
  db.users = db.users.map(u => (u.id === paidBefore.id ? { ...u, referred_by: referrer.id } : u));
  await buy(paidBefore.email);
  expect(keyed(`referral:${paidBefore.id}`)).toEqual([]);
});

it('a first paid activation by desk sale credits the referral too', async () => {
  const referrer = addMember();
  const friend = newcomer({ referred_by: referrer.id });
  const res = await api()
    .post(`/api/members/${friend.id}/desk-sale`)
    .set(authHeader(personas.admin))
    .send({ tier: 'pro', billing_cycle: 'monthly', amount_inr: 999, method: 'upi' });
  expect(res.status).toBe(200);
  expect(keyed(`referral:${friend.id}`)).toHaveLength(1);
  expect(keyed(`referral-welcome:${friend.id}`)).toHaveLength(1);
});

it('a referrer whose membership has expired earns nothing; the new member is still welcomed', async () => {
  const referrer = addMember({ membership_expiry: '2026-09-30' });
  const friend = newcomer({ referred_by: referrer.id });
  await buy(friend.email);
  expect(keyed(`referral:${friend.id}`)).toEqual([]);
  expect(keyed(`referral-welcome:${friend.id}`)).toEqual([expect.objectContaining({ user_id: friend.id, points: 50 })]);
});

it('an admin attaches a referrer before the first paid activation only', async () => {
  const referrer = addMember({ name: 'Riya Kapoor' });
  const code = await codeOf(referrer);
  const attach = (user: User, referral_code: string, email: string = personas.admin) =>
    api().post(`/api/members/${user.id}/referrer`).set(authHeader(email)).send({ referral_code });

  const friend = newcomer();
  const res = await attach(friend, code.toLowerCase());
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual({ referred_by: { id: referrer.id, name: 'Riya Kapoor' } });
  expect(stored(friend.id).referred_by).toBe(referrer.id);

  const self = newcomer();
  const selfRes = await attach(self, await codeOf(self));
  expect([selfRes.status, selfRes.body.code]).toEqual([400, 'REFERRAL_SELF']);

  expect((await attach(friend, code)).body.code).toBe('REFERRAL_LOCKED');
  const paid = newcomer();
  await buy(paid.email);
  const late = await attach(paid, code);
  expect([late.status, late.body.code]).toEqual([409, 'REFERRAL_LOCKED']);
  expect(stored(paid.id).referred_by).toBeUndefined();
  // Desk sales left no payment before rewards started: an older account, or one that has had a membership, has paid (review).
  const veteran = newcomer({ created_at: '2024-01-01T00:00:00.000Z' });
  const deskRegular = newcomer({ membership_tier: 'basic', membership_status: 'expired', membership_expiry: '2026-09-30' });
  for (const u of [veteran, deskRegular]) {
    const locked = await attach(u, code);
    expect([locked.status, locked.body.code]).toEqual([409, 'REFERRAL_LOCKED']);
    expect(stored(u.id).referred_by).toBeUndefined();
  }

  const unknown = await attach(newcomer(), 'ZZZZZZZZ');
  expect([unknown.status, unknown.body.code]).toEqual([400, 'REFERRAL_CODE_INVALID']);
  expect((await attach(newcomer(), code, personas.trainer)).status).toBe(403);
  expect((await api().post('/api/members/usr_nope/referrer').set(authHeader(personas.admin)).send({ referral_code: code })).status).toBe(404);
});

it('referral codes and links never leave the API in SafeUser', async () => {
  const referrer = addMember();
  const code = await codeOf(referrer);
  const friend = addMember({ referred_by: referrer.id });
  const answers = [
    await api().get('/api/auth/me').set(authHeader(referrer.email)),
    await api().get('/api/auth/me').set(authHeader(friend.email)),
    await api().get('/api/members').set(authHeader(personas.admin)),
    await api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send({ code: friend.email, method: 'manual' })
  ];
  for (const res of answers) {
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('referral_code');
    expect(text).not.toContain('referred_by');
    expect(text).not.toContain(code);
  }
});

it('the member detail shows who referred the member', async () => {
  const referrer = addMember({ name: 'Riya Kapoor' });
  const friend = addMember({ referred_by: referrer.id });
  const detail = (user: User) => api().get(`/api/members/${user.id}`).set(authHeader(personas.admin));
  expect((await detail(friend)).body.data.rewards.referred_by).toEqual({ id: referrer.id, name: 'Riya Kapoor' });
  expect((await detail(referrer)).body.data.rewards.referred_by).toBeNull();
  // The Add referrer form shows only while the server would accept one.
  const can = async (user: User) => (await detail(user)).body.data.rewards.can_add_referrer;
  expect([await can(friend), await can(referrer), await can(newcomer())]).toEqual([false, false, true]);
});

it("deleting a referred member leaves nothing in the referrer's points history that names them (review)", async () => {
  const referrer = addMember();
  const friend = newcomer({ referred_by: referrer.id });
  await buy(friend.email);
  expect(keyed(`referral:${friend.id}`)).toHaveLength(1);
  expect((await api().delete(`/api/members/${friend.id}`).set(authHeader(personas.admin))).status).toBe(200);
  const kept = db.points_ledger.filter(e => e.user_id === referrer.id);
  expect(kept).toEqual([expect.objectContaining({ points: 200, reason: 'referral', key: expect.stringMatching(/^referral:deleted:/) })]);
  expect(JSON.stringify(kept)).not.toContain(friend.id);
});

it('deleting a referrer clears referred_by on the members they referred', async () => {
  const referrer = addMember();
  const friend = addMember({ referred_by: referrer.id });
  const other = addMember({ referred_by: friend.id });
  expect((await api().delete(`/api/members/${referrer.id}`).set(authHeader(personas.admin))).status).toBe(200);
  expect(stored(friend.id)).not.toHaveProperty('referred_by');
  expect(stored(other.id).referred_by).toBe(friend.id);
});
