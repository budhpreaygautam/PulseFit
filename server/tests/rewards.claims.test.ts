import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addMember, api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { pointsBalance, recordAward } from '../src/lib/points.js';
import { createClaim, grantGifts } from '../src/lib/gifts.js';
import type { Gift, GiftSize, User } from '../src/types/index.js';

// Wednesday 7 Oct 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00.000Z');
const later = (ms: number) => vi.setSystemTime(new Date(NOW.getTime() + ms));

const gift = (id: string) => db.gifts.find(g => g.id === id)!;
const cost = (id: string) => gift(id).points_cost!;
const setGift = (id: string, patch: Partial<Gift>) => {
  db.gifts = db.gifts.map(g => (g.id === id ? { ...g, ...patch } : g));
};
const sized = (stock: Partial<Record<GiftSize, number>>) => ({ S: 0, M: 0, L: 0, XL: 0, XXL: 0, ...stock });
const fund = (m: User, points: number) => recordAward({ user_id: m.id, key: `test:fund:${m.id}:${points}`, points, reason: 'bonus' });
const claim = (m: User, body: object) => api().post('/api/rewards/claims').set(authHeader(m.email)).send(body);
const patch = (email: string, id: string, body: object) => api().patch(`/api/rewards/claims/${id}`).set(authHeader(email)).send(body);
const stored = (id: string) => db.gift_claims.find(c => c.id === id)!;
const grant = (m: User, gift_ids: string[], source: 'milestone' | 'joining' = 'milestone') =>
  grantGifts(m, { key: `test:${source}:${m.id}:${gift_ids.join()}`, gift_ids, source, source_ref: 'ref_x', note: 'test' });
const waitingFor = (m: User, giftId: string, size?: GiftSize) =>
  createClaim(m, gift(giftId), { source: 'joining', source_ref: 'ref_x', points_spent: 0, size });
const admin = () => authHeader(personas.admin);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetDb();
});
afterEach(() => vi.useRealTimers());

it('claims a store gift: spends points, takes stock, ready with a pickup code', async () => {
  const m = addMember();
  fund(m, 1000);
  setGift('gift_mug', { stock: 2 });
  const res = await claim(m, { gift_id: 'gift_mug' });
  expect(res.status).toBe(201);
  const c = res.body.data;
  expect(c).toMatchObject({ user_id: m.id, gift_id: 'gift_mug', gift_name: 'Coffee mug', source: 'store', points_spent: cost('gift_mug'), status: 'ready' });
  expect(c.pickup_code).toMatch(/^[A-Z2-9]{6}$/);
  expect(db.points_ledger.find(e => e.key === `claim:${c.id}`)).toMatchObject({ user_id: m.id, points: -cost('gift_mug'), reason: 'claim' });
  expect(pointsBalance(m.id)).toBe(1000 - cost('gift_mug'));
  expect(gift('gift_mug').stock).toBe(1);
});

it('allows a claim when the balance equals the cost exactly', async () => {
  const m = addMember();
  fund(m, cost('gift_pt_session'));
  expect((await claim(m, { gift_id: 'gift_pt_session' })).status).toBe(201);
  expect(pointsBalance(m.id)).toBe(0);
});

it('refuses inactive or reward-only gifts, missing or unknown sizes, no stock and too few points', async () => {
  const m = addMember();
  fund(m, 5000);
  setGift('gift_cap', { active: false, stock: 5 });
  setGift('gift_towel', { points_cost: null, stock: 5 });
  setGift('gift_tshirt', { stock_by_size: sized({ M: 5 }) });
  setGift('gift_mug', { stock: 0 });
  const cases: [object, number, string][] = [
    [{ gift_id: 'gift_cap' }, 404, 'GIFT_NOT_FOUND'],
    [{ gift_id: 'gift_towel' }, 404, 'GIFT_NOT_FOUND'],
    [{ gift_id: 'gift_tshirt' }, 400, 'SIZE_REQUIRED'],
    [{ gift_id: 'gift_tshirt', size: 'XXXL' }, 400, 'SIZE_INVALID'],
    [{ gift_id: 'gift_mug' }, 409, 'OUT_OF_STOCK']
  ];
  for (const [body, status, code] of cases) {
    const res = await claim(m, body);
    expect([res.status, res.body.code]).toEqual([status, code]);
  }
  const poor = addMember();
  fund(poor, cost('gift_tshirt') - 1);
  const res = await claim(poor, { gift_id: 'gift_tshirt', size: 'M' });
  expect([res.status, res.body.code]).toEqual([409, 'NOT_ENOUGH_POINTS']);
  expect([pointsBalance(m.id), pointsBalance(poor.id)]).toEqual([5000, cost('gift_tshirt') - 1]);
  expect(gift('gift_tshirt').stock_by_size!.M).toBe(5);
  expect(db.gift_claims.filter(c => c.user_id === m.id || c.user_id === poor.id)).toEqual([]);
});

it('lets only members claim', async () => {
  const res = await api().post('/api/rewards/claims').set(authHeader(personas.trainer)).send({ gift_id: 'gift_pt_session' });
  expect(res.status).toBe(403);
});

it('a member cancels their own ready store claim: refund entry, stock back', async () => {
  const m = addMember();
  fund(m, 1000);
  setGift('gift_mug', { stock: 1 });
  const { id } = (await claim(m, { gift_id: 'gift_mug' })).body.data;
  const res = await patch(m.email, id, { status: 'cancelled' });
  expect(res.status).toBe(200);
  expect(res.body.data.status).toBe('cancelled');
  expect(db.points_ledger.find(e => e.key === `refund:${id}`)).toMatchObject({ points: cost('gift_mug'), reason: 'refund' });
  expect(pointsBalance(m.id)).toBe(1000);
  expect(gift('gift_mug').stock).toBe(1);
  const again = await patch(m.email, id, { status: 'cancelled' });
  expect([again.status, again.body.code]).toEqual([409, 'CLAIM_NOT_READY']);
});

it("a member cannot cancel a milestone or joining claim, or see another member's", async () => {
  const m = addMember();
  const [milestone] = grant(m, ['gift_pt_session'], 'milestone');
  const [joining] = grant(m, ['gift_guest_pass'], 'joining');
  for (const c of [milestone, joining]) {
    const res = await patch(m.email, c.id, { status: 'cancelled' });
    expect([res.status, res.body.code]).toEqual([403, 'CLAIM_NOT_CANCELLABLE']);
    expect(stored(c.id).status).toBe('ready');
  }
  const other = addMember();
  const res = await patch(other.email, milestone.id, { status: 'cancelled' });
  expect([res.status, res.body.code]).toEqual([404, 'CLAIM_NOT_FOUND']);
});

it('an admin cancels any ready claim; only store claims are refunded', async () => {
  const m = addMember();
  fund(m, 1000);
  setGift('gift_mug', { stock: 1 });
  const store = (await claim(m, { gift_id: 'gift_mug' })).body.data;
  const [milestone] = grant(m, ['gift_pt_session']);
  expect((await patch(personas.trainer, store.id, { status: 'cancelled' })).status).toBe(403);

  const res = await api().patch(`/api/rewards/claims/${store.id}`).set(admin()).send({ status: 'cancelled', reason: 'Wrong item' });
  expect(res.body.data).toMatchObject({ status: 'cancelled', cancel_reason: 'Wrong item' });
  expect(db.points_ledger.some(e => e.key === `refund:${store.id}`)).toBe(true);
  expect((await api().patch(`/api/rewards/claims/${milestone.id}`).set(admin()).send({ status: 'cancelled' })).status).toBe(200);
  expect(stored(milestone.id).status).toBe('cancelled');
  expect(db.points_ledger.some(e => e.key === `refund:${milestone.id}`)).toBe(false);
  expect(pointsBalance(m.id)).toBe(1000);
});

it('admins and coaches hand a ready claim over and the claim records who and when', async () => {
  const m = addMember();
  const [first, second] = grant(m, ['gift_pt_session', 'gift_guest_pass']);
  const trainer = userByEmail(personas.trainer);
  expect((await patch(m.email, first.id, { status: 'handed_over' })).status).toBe(403);

  const res = await patch(personas.trainer, first.id, { status: 'handed_over' });
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({ status: 'handed_over', handed_over_at: NOW.toISOString(), handed_over_by: { id: trainer.id, name: trainer.name } });
  expect((await api().patch(`/api/rewards/claims/${second.id}`).set(admin()).send({ status: 'handed_over' })).body.data.status).toBe('handed_over');

  setGift('gift_mug', { stock: 0 });
  const waiting = waitingFor(m, 'gift_mug');
  expect(waiting.status).toBe('waiting');
  const refused = await patch(personas.trainer, waiting.id, { status: 'handed_over' });
  expect([refused.status, refused.body.code]).toEqual([409, 'CLAIM_NOT_READY']);
});

it('a size picked for a needs_size claim takes stock, or waits when that size is out', async () => {
  setGift('gift_tshirt', { stock_by_size: sized({ M: 1 }) });
  const a = addMember();
  const b = addMember();
  const [ca] = grant(a, ['gift_tshirt']);
  const [cb] = grant(b, ['gift_tshirt']);
  expect([ca.status, cb.status]).toEqual(['needs_size', 'needs_size']);

  const mine = await patch(a.email, ca.id, { size: 'M' });
  expect(mine.body.data).toMatchObject({ status: 'ready', size: 'M' });
  expect(gift('gift_tshirt').stock_by_size!.M).toBe(0);
  // Staff may pick the size on any member's claim; M is out now, so it waits with the size.
  const desk = await patch(personas.trainer, cb.id, { size: 'M' });
  expect(desk.body.data).toMatchObject({ status: 'waiting', size: 'M' });

  // No size exchange on a ready claim.
  setGift('gift_tshirt', { stock_by_size: sized({ L: 2 }) });
  for (const body of [{ size: 'L' }, { status: 'handed_over', size: 'L' }]) {
    const res = await patch(personas.admin, ca.id, body);
    expect([res.status, res.body.code]).toEqual([409, 'CLAIM_NOT_READY']);
  }
  expect(stored(ca.id)).toMatchObject({ status: 'ready', size: 'M' });
  expect(gift('gift_tshirt').stock_by_size).toMatchObject({ M: 0, L: 2 });
});

it('the desk hands over a needs_size claim with a size in stock; without a size it asks for one', async () => {
  setGift('gift_hoodie', { stock_by_size: sized({ L: 1 }) });
  const m = addMember();
  const [c] = grant(m, ['gift_hoodie']);
  const bare = await patch(personas.trainer, c.id, { status: 'handed_over' });
  expect([bare.status, bare.body.code]).toEqual([400, 'SIZE_REQUIRED']);
  const out = await patch(personas.trainer, c.id, { status: 'handed_over', size: 'S' });
  expect([out.status, out.body.code]).toEqual([409, 'OUT_OF_STOCK']);
  const res = await patch(personas.trainer, c.id, { status: 'handed_over', size: 'L' });
  expect(res.body.data).toMatchObject({ status: 'handed_over', size: 'L' });
  expect(gift('gift_hoodie').stock_by_size!.L).toBe(0);
});

it('added stock promotes waiting claims oldest first, only for the size that got stock', async () => {
  setGift('gift_tshirt', { stock_by_size: sized({}) });
  const [a, b, c] = [addMember(), addMember(), addMember()];
  // b's M claim is stored first but made later, so the order comes from created_at.
  later(2000);
  const newerM = waitingFor(b, 'gift_tshirt', 'M');
  later(1000);
  const olderM = waitingFor(a, 'gift_tshirt', 'M');
  const l = waitingFor(c, 'gift_tshirt', 'L');
  expect([newerM.status, olderM.status, l.status]).toEqual(['waiting', 'waiting', 'waiting']);
  const put = (stock_by_size: object) =>
    api()
      .put('/api/rewards/gifts/gift_tshirt')
      .set(admin())
      .send({ stock_by_size, expected_stock: { stock: null, stock_by_size: gift('gift_tshirt').stock_by_size } });

  expect((await put(sized({ S: 5 }))).status).toBe(200);
  expect([stored(olderM.id).status, stored(newerM.id).status, stored(l.id).status]).toEqual(['waiting', 'waiting', 'waiting']);

  const res = await put(sized({ S: 5, M: 1 }));
  expect(res.body.message).toMatch(/1 waiting claim/);
  expect([stored(olderM.id).status, stored(newerM.id).status, stored(l.id).status]).toEqual(['ready', 'waiting', 'waiting']);
  expect(gift('gift_tshirt').stock_by_size).toMatchObject({ S: 5, M: 0 });
});

it('deleting a member with a ready mug claim returns the mug and promotes the oldest waiting mug claim', async () => {
  setGift('gift_mug', { stock: 1 });
  const [a, b, c] = [addMember(), addMember(), addMember()];
  fund(a, 1000);
  expect((await claim(a, { gift_id: 'gift_mug' })).body.data.status).toBe('ready');
  later(1000);
  const [cb] = grant(b, ['gift_mug'], 'joining');
  later(2000);
  const [cc] = grant(c, ['gift_mug'], 'joining');
  expect([cb.status, cc.status]).toEqual(['waiting', 'waiting']);

  expect((await api().delete(`/api/members/${a.id}`).set(admin())).status).toBe(200);
  expect([stored(cb.id).status, stored(cc.id).status]).toEqual(['ready', 'waiting']);
  expect(gift('gift_mug').stock).toBe(0);
});

it('a deactivated or renamed gift keeps existing claims collectable and leaves the store', async () => {
  setGift('gift_mug', { stock: 3 });
  const m = addMember();
  fund(m, 1000);
  const { id } = (await claim(m, { gift_id: 'gift_mug' })).body.data;
  const res = await api().put('/api/rewards/gifts/gift_mug').set(admin()).send({ name: 'Old mug', active: false });
  expect(res.body.data).toMatchObject({ name: 'Old mug', active: false });
  expect(stored(id).gift_name).toBe('Coffee mug');
  expect((await patch(personas.trainer, id, { status: 'handed_over' })).body.data.status).toBe('handed_over');
  const store = await api().get('/api/rewards/gifts').set(authHeader(m.email));
  expect(store.body.data.map((g: { id: string }) => g.id)).not.toContain('gift_mug');
});

it('members see in/out of stock, never stock counts; admins see the full catalogue', async () => {
  setGift('gift_mug', { stock: 0 });
  setGift('gift_tshirt', { stock_by_size: sized({ M: 2 }) });
  setGift('gift_towel', { points_cost: null });
  const m = addMember();
  const res = await api().get('/api/rewards/gifts').set(authHeader(m.email));
  const items: Record<string, unknown>[] = res.body.data;
  expect(items).toHaveLength(23);
  for (const g of items) for (const key of ['stock', 'stock_by_size', 'active', 'created_at']) expect(g).not.toHaveProperty(key);
  const costs = items.map(g => g.points_cost as number);
  expect(costs).toEqual([...costs].sort((x, y) => x - y));
  const byId = (id: string) => items.find(g => g.id === id);
  expect(byId('gift_mug')).toMatchObject({ in_stock: false });
  expect(byId('gift_tshirt')).toMatchObject({ in_stock: true, sizes: ['S', 'M', 'L', 'XL', 'XXL'], sizes_in_stock: ['M'] });
  expect(byId('gift_pt_session')).toMatchObject({ in_stock: true, kind: 'service' });
  expect(byId('gift_towel')).toBeUndefined();

  const full = await api().get('/api/rewards/gifts').set(admin());
  expect(full.body.data).toHaveLength(24);
  expect(full.body.data.find((g: Gift) => g.id === 'gift_tshirt').stock_by_size.M).toBe(2);
});

it('guests get nothing from the rewards routes', async () => {
  for (const path of ['/api/rewards/me', '/api/rewards/gifts', '/api/rewards/claims']) {
    expect((await api().get(path)).status).toBe(401);
  }
});

it('GET /rewards/me returns balance, visits, streak, milestone progress, earning values and claims', async () => {
  const m = addMember();
  db.attendance_logs = [
    ...db.attendance_logs,
    ...['2026-10-05', '2026-10-06', '2026-10-07'].map(d => ({
      id: `att_${m.id}_${d}`, user_id: m.id, user_name: m.name, user_email: m.email, user_tier: m.membership_tier,
      check_in_time: `${d}T04:00:00.000Z`, check_in_method: 'qr' as const
    }))
  ];
  fund(m, 40);
  recordAward({ user_id: m.id, key: `milestone:ms_visits_10:${m.id}`, points: 0, reason: 'bonus' });
  const [older] = grant(m, ['gift_pt_session']);
  later(1000);
  const [newer] = grant(m, ['gift_guest_pass'], 'joining');

  const res = await api().get('/api/rewards/me').set(authHeader(m.email));
  expect(res.status).toBe(200);
  const data = res.body.data;
  expect(data).toMatchObject({ balance: 40, visits: 3, streak: 3, earning: { checkin: 10, workout: 5, referral: 200, referral_welcome: 50 } });
  expect(data.milestones[0]).toEqual({ id: 'ms_visits_10', type: 'visits', threshold: 10, gift_name: 'Keychain', reached: true });
  expect(data.milestones.slice(1).map((x: { reached: boolean }) => x.reached)).toEqual([false, false, false]);
  expect(data.claims.map((c: { id: string }) => c.id)).toEqual([newer.id, older.id]);
  expect((await api().get('/api/rewards/me').set(authHeader(personas.trainer))).status).toBe(403);
});

it('GET /rewards/claims filters by status and member for admins only', async () => {
  setGift('gift_mug', { stock: 0 });
  const a = addMember({ name: 'Kavya Iyer' });
  const b = addMember();
  const [ready] = grant(a, ['gift_pt_session']);
  later(1000);
  const waiting = waitingFor(a, 'gift_mug');
  const [other] = grant(b, ['gift_pt_session']);
  const list = async (query: string) =>
    (await api().get(`/api/rewards/claims${query}`).set(admin())).body.data.map((c: { id: string }) => c.id);

  expect(await list(`?user_id=${a.id}`)).toEqual([ready.id, waiting.id]);
  expect(await list(`?user_id=${a.id}&status=waiting`)).toEqual([waiting.id]);
  expect(await list('?status=ready')).toEqual(expect.arrayContaining([ready.id, other.id]));
  expect(await list('?status=ready')).not.toContain(waiting.id);
  expect(await list(`?search=${ready.pickup_code.toLowerCase()}`)).toEqual([ready.id]);
  expect(await list('?search=kavya')).toEqual([ready.id, waiting.id]);
  expect((await api().get('/api/rewards/claims').set(authHeader(personas.trainer))).status).toBe(403);
});

it("the check-in answer lists the member's ready and needs_size gifts", async () => {
  setGift('gift_mug', { stock: 0 });
  const m = addMember();
  const [ready] = grant(m, ['gift_pt_session']);
  later(1000);
  const [needsSize] = grant(m, ['gift_tshirt'], 'joining');
  waitingFor(m, 'gift_mug');
  const checkIn = () => api().post('/api/attendance/check-in').set(admin()).send({ code: m.email, method: 'manual' });

  const first = await checkIn();
  expect(first.body.data.already_checked_in).toBe(false);
  expect(first.body.data.gifts_to_collect.map((c: { id: string }) => c.id)).toEqual([ready.id, needsSize.id]);
  const again = await checkIn();
  expect(again.body.data.already_checked_in).toBe(true);
  expect(again.body.data.gifts_to_collect.map((c: { id: string }) => c.id)).toEqual([ready.id, needsSize.id]);
});

it('a claim that needs a size lists the sizes its gift comes in, also for a reward-only gift (review)', async () => {
  setGift('gift_hoodie', { points_cost: null, sizes: ['M', 'L'], stock_by_size: { M: 1, L: 1 } });
  const m = addMember();
  const [c] = grant(m, ['gift_hoodie']);
  expect(c.status).toBe('needs_size');
  const me = await api().get('/api/rewards/me').set(authHeader(m.email));
  expect(me.body.data.claims).toEqual([expect.objectContaining({ id: c.id, sizes: ['M', 'L'] })]);
  const checkIn = await api().post('/api/attendance/check-in').set(admin()).send({ code: m.email, method: 'manual' });
  expect(checkIn.body.data.gifts_to_collect).toEqual([expect.objectContaining({ id: c.id, sizes: ['M', 'L'] })]);
  expect(stored(c.id)).not.toHaveProperty('sizes');
});

it('the member detail shows the points balance, recent points and claims', async () => {
  const m = addMember();
  fund(m, 70);
  const [c] = grant(m, ['gift_pt_session']);
  const res = await api().get(`/api/members/${m.id}`).set(admin());
  expect(res.body.data.rewards).toMatchObject({ balance: 70, claims: [expect.objectContaining({ id: c.id })] });
  expect(res.body.data.rewards.recent_points).toHaveLength(2);
});

it('PUT /rewards/settings keeps milestone ids, gives new ones ids, and refuses unknown or inactive gifts', async () => {
  const current = (await api().get('/api/rewards/settings').set(admin())).body.data;
  const { launched_at: _launched, ...body } = current;
  const put = (settings: object) => api().put('/api/rewards/settings').set(admin()).send(settings);

  const res = await put({
    ...body,
    points_per_checkin: 15,
    milestones: [
      { id: 'ms_visits_10', type: 'visits', threshold: 12, gift_id: 'gift_keychain' },
      { type: 'streak', threshold: 7, gift_id: 'gift_mug' }
    ]
  });
  expect(res.status).toBe(200);
  const [kept, added] = res.body.data.milestones;
  expect(kept).toEqual({ id: 'ms_visits_10', type: 'visits', threshold: 12, gift_id: 'gift_keychain' });
  expect(added.id).toMatch(/^ms_/);
  expect(db.reward_settings.points_per_checkin).toBe(15);

  const unknown = await put({ ...body, milestones: [{ type: 'visits', threshold: 5, gift_id: 'gift_nope' }] });
  expect([unknown.status, unknown.body.code, unknown.body.data.issues[0].path]).toEqual([400, 'VALIDATION_ERROR', 'milestones.0.gift_id']);
  setGift('gift_cap', { active: false });
  const inactive = await put({ ...body, joining_gifts: [{ tier: 'pro', billing_cycle: 'annual', gift_ids: ['gift_cap'], once_per_member: false }] });
  expect([inactive.status, inactive.body.data.issues[0].path]).toEqual([400, 'joining_gifts.0.gift_ids.0']);
  expect((await put({ ...body, launched_at: NOW.toISOString() })).status).toBe(400);
  expect(db.reward_settings.milestones).toHaveLength(2);
  expect((await api().get('/api/rewards/settings').set(authHeader(personas.trainer))).status).toBe(403);
});

it('gift create/update validation', async () => {
  const post = (body: object) => api().post('/api/rewards/gifts').set(admin()).send(body);
  const base = { name: 'Bottle opener', description: 'Steel opener.', image: '🍾', level: 'small', points_cost: 200, kind: 'item', stock: 4 };

  const created = await post(base);
  expect(created.status).toBe(201);
  expect(created.body.data).toMatchObject({ ...base, active: true });
  expect(created.body.data.id).toMatch(/^gift_/);
  expect((await post({ ...base, points_cost: null })).body.data.points_cost).toBeNull();
  expect((await post({ ...base, sizes: ['M', 'L'], stock: null })).status).toBe(400);
  expect((await post({ ...base, kind: 'service', sizes: ['M'], stock_by_size: { M: 1 }, stock: null })).status).toBe(400);
  expect((await post({ ...base, image: 'http://x' })).status).toBe(400);
  expect((await post({ ...base, sizes: ['M', 'M'], stock_by_size: { M: 1 }, stock: null })).status).toBe(400);
  expect((await post({ ...base, created_at: 'x' })).status).toBe(400);
  expect((await api().post('/api/rewards/gifts').set(authHeader(personas.member)).send(base)).status).toBe(403);

  const m = addMember();
  waitingFor(m, 'gift_tshirt', 'XXL');
  const drop = await api().put('/api/rewards/gifts/gift_tshirt').set(admin()).send({ sizes: ['S', 'M', 'L', 'XL'], stock_by_size: { S: 0, M: 0, L: 0, XL: 0 } });
  expect([drop.status, drop.body.code]).toEqual([409, 'SIZE_IN_USE']);
  expect(gift('gift_tshirt').sizes).toEqual(['S', 'M', 'L', 'XL', 'XXL']);

  const retire = await api().put('/api/rewards/gifts/gift_keychain').set(admin()).send({ active: false });
  expect([retire.status, retire.body.code]).toEqual([409, 'GIFT_IN_RULES']);
  expect(gift('gift_keychain').active).toBe(true);
  expect((await api().put('/api/rewards/gifts/gift_nope').set(admin()).send({ active: false })).body.code).toBe('GIFT_NOT_FOUND');
});

it('a stock edit based on counts that changed since the form loaded is refused; other edits keep the stock (review)', async () => {
  setGift('gift_mug', { stock: 3 });
  setGift('gift_tshirt', { stock_by_size: sized({ M: 2 }) });
  const catalogue = (await api().get('/api/rewards/gifts').set(admin())).body.data as Gift[];
  const loaded = (id: string) => catalogue.find(g => g.id === id)!;
  const m = addMember();
  fund(m, 5000);
  expect((await claim(m, { gift_id: 'gift_mug' })).status).toBe(201);
  expect((await claim(m, { gift_id: 'gift_tshirt', size: 'M' })).status).toBe(201);
  const put = (id: string, body: object) => api().put(`/api/rewards/gifts/${id}`).set(admin()).send(body);

  const stale = await put('gift_mug', { description: 'Big mug', stock: 3, expected_stock: { stock: loaded('gift_mug').stock } });
  expect([stale.status, stale.body.code]).toEqual([409, 'STOCK_CHANGED']);
  const sizes = loaded('gift_tshirt');
  const staleSizes = await put('gift_tshirt', { stock_by_size: sized({ M: 5 }), expected_stock: { stock: sizes.stock, stock_by_size: sizes.stock_by_size } });
  expect([staleSizes.status, staleSizes.body.code]).toEqual([409, 'STOCK_CHANGED']);
  expect([gift('gift_mug').stock, gift('gift_tshirt').stock_by_size]).toEqual([2, sized({ M: 1 })]);

  // Without stock, the edit leaves the counts alone; stock without what it was based on is refused.
  expect((await put('gift_mug', { description: 'Big mug' })).status).toBe(200);
  expect(gift('gift_mug')).toMatchObject({ description: 'Big mug', stock: 2 });
  expect((await put('gift_mug', { stock: 12 })).status).toBe(400);
  expect((await put('gift_mug', { stock: 12, expected_stock: { stock: 2 } })).status).toBe(200);
  expect(gift('gift_mug').stock).toBe(12);
});

it('sizes cannot be added to a gift while a claim waits for it without one (review)', async () => {
  setGift('gift_cap', { stock: 0 });
  const [waiting] = grant(addMember(), ['gift_cap'], 'joining');
  expect(waiting.status).toBe('waiting');
  const put = (body: object) => api().put('/api/rewards/gifts/gift_cap').set(admin()).send({ ...body, expected_stock: { stock: gift('gift_cap').stock } });
  const addSizes = { sizes: ['M', 'L'], stock_by_size: { M: 3, L: 3 }, stock: null };

  const refused = await put(addSizes);
  expect([refused.status, refused.body.code]).toEqual([409, 'SIZE_IN_USE']);
  expect(gift('gift_cap').sizes).toBeUndefined();
  // Stock fills the claim first; then sizes can come.
  expect((await put({ stock: 1 })).status).toBe(200);
  expect(stored(waiting.id).status).toBe('ready');
  expect((await put(addSizes)).status).toBe(200);
  expect(gift('gift_cap')).toMatchObject({ sizes: ['M', 'L'], stock: null });
});

it('DELETE /rewards/gifts/:id removes only a gift that no claim or rule names', async () => {
  const del = (id: string, email: string = personas.admin) => api().delete(`/api/rewards/gifts/${id}`).set(authHeader(email));
  const fresh = (
    await api().post('/api/rewards/gifts').set(admin()).send({ name: 'Bottle opener', description: '', image: '🍾', level: 'small', points_cost: 200, kind: 'item', stock: 1 })
  ).body.data;
  expect((await del(fresh.id, personas.member)).status).toBe(403);
  expect((await del(fresh.id)).body.data).toEqual({ deleted: true });
  expect(db.gifts.some(g => g.id === fresh.id)).toBe(false);

  grant(addMember(), ['gift_pt_session']);
  for (const id of ['gift_pt_session', 'gift_keychain']) {
    const res = await del(id);
    expect([res.status, res.body.code]).toEqual([409, 'GIFT_IN_USE']);
  }
  expect((await del('gift_nope')).status).toBe(404);
});
