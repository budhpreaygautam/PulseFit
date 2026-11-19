import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, authHeader, db, personas, resetDb } from './helpers.js';
import type { DatabaseSchema } from '../src/db/database.js';
import { addDays, gymToday } from '../src/lib/dates.js';
import { earnsRewards, pointsBalance, recordAward } from '../src/lib/points.js';
import { grantGifts } from '../src/lib/gifts.js';
import { toSafeUser } from '../src/lib/users.js';

const BANDS = { small: [150, 250], medium: [300, 500], big: [700, 1200], premium: [1500, 3000] } as const;
const joining = (tier: string, cycle: string) => db.reward_settings.joining_gifts.find(j => j.tier === tier && j.billing_cycle === cycle);
beforeEach(() => resetDb());

describe('defaults', () => {
  it('has the 24-gift catalogue with costs inside each level band', () => {
    expect(db.gifts).toHaveLength(24);
    for (const g of db.gifts) {
      expect(g.points_cost!).toBeGreaterThanOrEqual(BANDS[g.level][0]);
      expect(g.points_cost!).toBeLessThanOrEqual(BANDS[g.level][1]);
    }
    expect(db.gifts.filter(g => g.sizes).map(g => g.id).sort()).toEqual(['gift_hoodie', 'gift_tank_top', 'gift_tshirt']);
    for (const g of db.gifts.filter(g => g.sizes)) expect(Object.keys(g.stock_by_size!).sort()).toEqual(['L', 'M', 'S', 'XL', 'XXL']);
    expect(db.gifts.filter(g => g.kind === 'service').map(g => g.stock)).toEqual([null, null, null]);
  });

  it('has the default rules', () => {
    expect(db.reward_settings).toMatchObject({ points_per_checkin: 10, points_per_workout: 5, points_per_referral: 200, welcome_points_for_referred: 50 });
    expect(db.reward_settings.milestones.map(m => [m.type, m.threshold, m.gift_id])).toEqual([
      ['visits', 10, 'gift_keychain'], ['streak', 30, 'gift_shaker'], ['visits', 100, 'gift_lifting_straps'], ['visits', 250, 'gift_hoodie']]);
    for (const t of ['basic', 'pro']) expect(joining(t, 'annual')).toMatchObject({ gift_ids: ['gift_tshirt', 'gift_shaker'], once_per_member: false });
    expect(joining('vip', 'annual')).toMatchObject({ gift_ids: ['gift_hoodie', 'gift_shaker', 'gift_water_bottle'], once_per_member: false });
    for (const t of ['basic', 'pro', 'vip']) expect(joining(t, 'monthly')).toMatchObject({ gift_ids: ['gift_sample_pack'], once_per_member: true });
  });

  it('gives a database written before rewards the default catalogue and rules', () => {
    const { gifts, gift_claims, points_ledger, reward_settings, offers, coupons, ...older } = db.snapshot();
    db.restore(older as DatabaseSchema);
    expect(db.gifts).toHaveLength(24);
    expect(db.reward_settings.points_per_checkin).toBe(10);
    expect([db.gift_claims, db.points_ledger, db.offers, db.coupons]).toEqual([[], [], [], []]);
  });
});

describe('ledger', () => {
  it('records an award once per key and sums the balance', () => {
    const m = addMember();
    expect(recordAward({ user_id: m.id, key: 'test:1', points: 10, reason: 'bonus' })).not.toBeNull();
    expect(recordAward({ user_id: m.id, key: 'test:1', points: 10, reason: 'bonus' })).toBeNull();
    recordAward({ user_id: m.id, key: 'test:2', points: -4, reason: 'claim' });
    expect(pointsBalance(m.id)).toBe(6);
  });

  it('lets only members with an active or frozen plan earn', () => {
    expect(earnsRewards(addMember())).toBe(true);
    expect(earnsRewards(addMember({ membership_status: 'frozen' }))).toBe(true);
    // Like the guide: a freeze cannot keep rewards past the paid end date.
    expect(earnsRewards(addMember({ membership_status: 'frozen', membership_expiry: addDays(gymToday(), -1) }))).toBe(false);
    expect(earnsRewards(addMember({ membership_expiry: addDays(gymToday(), -1) }))).toBe(false); // effectively expired
    expect(earnsRewards(addMember({ membership_status: 'pending', membership_tier: 'none', membership_expiry: null }))).toBe(false);
    expect(earnsRewards(addMember({ role: 'trainer' }))).toBe(false);
    expect(earnsRewards(addMember({ role: 'admin' }))).toBe(false);
  });
});

describe('grantGifts', () => {
  it('starts claims ready (taking stock), waiting at zero stock, needs_size for apparel, ready for services', () => {
    db.gifts = db.gifts.map(g => (g.id === 'gift_mug' ? { ...g, stock: 1 } : g.id === 'gift_cap' ? { ...g, stock: 0 } : g));
    const m = addMember();
    const claims = grantGifts(m, { key: 'test:join', gift_ids: ['gift_mug', 'gift_cap', 'gift_tshirt', 'gift_pt_session'], source: 'joining', source_ref: 'pmt_x', note: 'test' });
    expect(claims.map(c => [c.gift_id, c.status, c.points_spent])).toEqual([
      ['gift_mug', 'ready', 0], ['gift_cap', 'waiting', 0], ['gift_tshirt', 'needs_size', 0], ['gift_pt_session', 'ready', 0]]);
    expect(db.gifts.find(g => g.id === 'gift_mug')!.stock).toBe(0);
    expect(claims.every(c => /^[A-Z2-9]{6}$/.test(c.pickup_code))).toBe(true);
  });

  it('grants nothing twice for one key, writes one 0-point bonus entry, and skips inactive gifts', () => {
    db.gifts = db.gifts.map(g => (g.id === 'gift_cap' ? { ...g, active: false } : g));
    const m = addMember();
    const award = { key: 'test:k', gift_ids: ['gift_cap', 'gift_pt_session'], source: 'milestone' as const, source_ref: 'ms_x', note: 'test' };
    expect(grantGifts(m, award).map(c => c.gift_id)).toEqual(['gift_pt_session']);
    expect(grantGifts(m, award)).toEqual([]);
    expect(db.points_ledger.filter(e => e.key === 'test:k')).toEqual([expect.objectContaining({ points: 0, reason: 'bonus', user_id: m.id })]);
  });
});

describe('points API', () => {
  const ledger = (email: string, query = '') => api().get(`/api/rewards/ledger${query}`).set(authHeader(email));
  const adjust = (id: string, body: object, who: string = personas.admin) =>
    api().post(`/api/members/${id}/points`).set(authHeader(who)).send(body);

  it("GET /rewards/ledger lists the member's own entries newest first with the balance", async () => {
    const m = addMember();
    const other = addMember();
    recordAward({ user_id: m.id, key: 'test:first', points: 10, reason: 'bonus' });
    recordAward({ user_id: m.id, key: 'test:second', points: 5, reason: 'checkin' });
    recordAward({ user_id: other.id, key: 'test:other', points: 99, reason: 'bonus' });

    const res = await ledger(m.email);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ balance: 15, total: 2 });
    expect(res.body.data.items.map((e: { key: string }) => e.key)).toEqual(['test:second', 'test:first']);

    const page = await ledger(m.email, '?limit=1');
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.total).toBe(2);
    expect((await ledger(m.email, '?limit=101')).status).toBe(400);
  });

  it('GET /rewards/ledger is for members only', async () => {
    expect((await ledger(personas.trainer)).status).toBe(403);
    expect((await ledger(personas.admin)).status).toBe(403);
    expect((await api().get('/api/rewards/ledger')).status).toBe(401);
  });

  it('POST /members/:id/points adds or removes points with a note', async () => {
    const m = addMember();
    const res = await adjust(m.id, { points: 100, note: 'Helped at the open day' });
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(100);
    expect(res.body.data.entry).toMatchObject({ user_id: m.id, points: 100, reason: 'admin_adjust', note: 'Helped at the open day' });
    expect(res.body.data.entry.key).toMatch(/^adjust:/);

    const back = await adjust(m.id, { points: -40, note: 'Correction' });
    expect(back.body.data.balance).toBe(60);
    expect(pointsBalance(m.id)).toBe(60);
  });

  it('POST /members/:id/points refuses a balance below zero, zero points and non-admins', async () => {
    const m = addMember();
    await adjust(m.id, { points: 100, note: 'Start' });
    const below = await adjust(m.id, { points: -101, note: 'Too much' });
    expect(below.status).toBe(400);
    expect(below.body.code).toBe('POINTS_NEGATIVE');
    const zero = await adjust(m.id, { points: 0, note: 'Nothing' });
    expect(zero.status).toBe(400);
    expect(zero.body.code).toBe('VALIDATION_ERROR');
    expect((await adjust(m.id, { points: 10 })).body.code).toBe('VALIDATION_ERROR');
    expect((await adjust(m.id, { points: 10, note: 'x', balance: 5 })).body.code).toBe('VALIDATION_ERROR');
    expect((await adjust(m.id, { points: 10, note: 'Mine' }, m.email)).status).toBe(403);
    expect((await adjust('usr_nobody', { points: 10, note: 'Nobody' })).status).toBe(404);
    expect(pointsBalance(m.id)).toBe(100);
  });
});

it('keeps referral_code and referred_by out of SafeUser', () => {
  const safe = toSafeUser({ ...addMember(), referral_code: 'ABCD2345', referred_by: 'usr_x' });
  expect(safe).not.toHaveProperty('referral_code');
  expect(safe).not.toHaveProperty('referred_by');
});

it("deletes a member's ledger entries and claims with the account", async () => {
  const m = addMember();
  recordAward({ user_id: m.id, key: 'test:del', points: 10, reason: 'bonus' });
  grantGifts(m, { key: 'test:del-gift', gift_ids: ['gift_pt_session'], source: 'milestone', source_ref: 'ms_x', note: 'test' });
  expect(db.gift_claims.some(c => c.user_id === m.id)).toBe(true);

  const res = await api().delete(`/api/members/${m.id}`).set(authHeader(personas.admin));
  expect(res.status).toBe(200);
  expect(db.points_ledger.filter(e => e.user_id === m.id)).toEqual([]);
  expect(db.gift_claims.filter(c => c.user_id === m.id)).toEqual([]);
});
