import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMember, api, authHeader, db, personas, resetDb } from './helpers.js';
import { launchRewards } from '../src/lib/milestones.js';
import { pointsBalance } from '../src/lib/points.js';
import { liveOffers } from '../src/lib/pricing.js';
import { seedDatabase } from '../src/db/seed.js';
import { defaultGifts, defaultRewardSettings } from '../src/db/rewardDefaults.js';
import { addDays, gymToday } from '../src/lib/dates.js';
import { isOpenDay } from '../src/lib/hours.js';
import type { AttendanceLog, User } from '../src/types/index.js';

// Monday 5 Oct 2026, 10:00 at the gym (IST). Sunday 4 Oct is closed.
const START = new Date('2026-10-05T04:30:00.000Z');

const claims = (userId: string) => db.gift_claims.filter(c => c.user_id === userId);
const keysOf = (userId: string) => db.points_ledger.filter(e => e.user_id === userId).map(e => e.key);

/** Staff check-ins on these gym dates (10:00 IST each). */
function visits(user: User, dates: string[]): void {
  const logs: AttendanceLog[] = dates.map(date => ({
    id: `att_${user.id}_${date}`,
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    user_tier: user.membership_tier,
    check_in_time: `${date}T04:30:00.000Z`,
    check_in_method: 'qr'
  }));
  db.attendance_logs = [...logs, ...db.attendance_logs];
}

/** `count` consecutive open days ending on `last`, oldest first. */
function openRun(last: string, count: number): string[] {
  const days: string[] = [];
  for (let d = last; days.length < count; d = addDays(d, -1)) if (isOpenDay(d)) days.unshift(d);
  return days;
}

/** `count` dates three days apart ending on `last`: no run longer than one open day. */
function scattered(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(last, -3 * i)).reverse();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  resetDb();
});
afterEach(() => vi.useRealTimers());

describe('launchRewards', () => {
  // The demo seed already launched: start from a gym that has not.
  beforeEach(() => {
    db.gift_claims = [];
    db.points_ledger = [];
    db.reward_settings = { ...db.reward_settings, launched_at: undefined };
  });

  it('gives each regular only the highest passed milestone, and marks every passed one done', () => {
    const m = addMember();
    const run = openRun('2026-08-29', 35);
    visits(m, [...scattered(addDays(run[0], -7), 85), ...run]);
    expect(db.attendance_logs.filter(l => l.user_id === m.id)).toHaveLength(120);

    launchRewards();

    expect(claims(m.id)).toEqual([
      expect.objectContaining({ gift_id: 'gift_lifting_straps', source: 'milestone', source_ref: 'ms_visits_100', points_spent: 0 })
    ]);
    expect(keysOf(m.id)).toEqual(
      expect.arrayContaining([`launch-gift:${m.id}`, `milestone:ms_visits_10:${m.id}`, `milestone:ms_streak_30:${m.id}`, `milestone:ms_visits_100:${m.id}`])
    );
    expect(keysOf(m.id)).not.toContain(`milestone:ms_visits_250:${m.id}`);
    expect(pointsBalance(m.id)).toBe(0);
  });

  it('a member past only the first milestone gets its gift', () => {
    const m = addMember();
    visits(m, scattered('2026-10-02', 12));

    launchRewards();

    expect(claims(m.id)).toEqual([expect.objectContaining({ gift_id: 'gift_keychain', source_ref: 'ms_visits_10' })]);
    expect(keysOf(m.id).sort()).toEqual([`launch-gift:${m.id}`, `milestone:ms_visits_10:${m.id}`]);
  });

  it('a streak passed before launch is not granted again when rebuilt later', async () => {
    const m = addMember();
    // A 35-day run in the summer, then 29 open days in a row up to Saturday: today's check-in makes 30.
    visits(m, [...openRun('2026-07-31', 35), ...openRun('2026-10-03', 29)]);

    launchRewards();
    expect(claims(m.id)).toEqual([expect.objectContaining({ gift_id: 'gift_shaker', source_ref: 'ms_streak_30' })]);

    const res = await api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send({ code: m.email, method: 'manual' });
    expect(res.status).toBe(200);
    expect(claims(m.id)).toHaveLength(1);
  });

  it('gives expired members, coaches and admins nothing, and writes no points', () => {
    const expired = addMember({ membership_status: 'expired', membership_expiry: addDays(gymToday(), -5) });
    const coach = addMember({ role: 'trainer', membership_tier: 'none' });
    const admin = addMember({ role: 'admin', membership_tier: 'none' });
    for (const u of [expired, coach, admin]) visits(u, scattered('2026-10-02', 12));

    launchRewards();

    for (const u of [expired, coach, admin]) {
      expect(claims(u.id)).toEqual([]);
      expect(keysOf(u.id)).toEqual([]);
    }
    expect(db.points_ledger.filter(e => e.points !== 0)).toEqual([]);
  });

  it('runs once: a second run grants nothing', () => {
    const first = launchRewards();
    expect(db.reward_settings.launched_at).toBe(START.toISOString());

    const m = addMember();
    visits(m, scattered('2026-10-02', 12));
    const entries = db.points_ledger.length;
    expect(launchRewards()).toEqual({ members: 0, gifts: 0 });
    expect(claims(m.id)).toEqual([]);
    expect(db.points_ledger).toHaveLength(entries);
    expect(first.gifts).toBe(db.gift_claims.length);
  });
});

it('demo data has points, a ready claim, a live sale and WELCOME10', () => {
  expect(db.reward_settings.launched_at).toBeTruthy();
  const keys = db.points_ledger.map(e => e.key);
  expect(new Set(keys).size).toBe(keys.length);

  expect(keys).toContain('seed-bonus:usr_member_1');
  expect(pointsBalance('usr_member_1')).toBeGreaterThan(0);

  const mug = db.gift_claims.find(c => c.user_id === 'usr_member_2' && c.source === 'store');
  expect(mug).toMatchObject({ gift_id: 'gift_mug', status: 'ready' });
  expect(db.points_ledger).toContainEqual(expect.objectContaining({ key: `claim:${mug!.id}`, points: -mug!.points_spent }));
  for (const u of db.users) expect(pointsBalance(u.id)).toBeGreaterThanOrEqual(0);

  // Items and apparel have stock; services stay unlimited.
  for (const g of db.gifts) {
    if (g.kind === 'service') expect(g.stock).toBeNull();
    else if (g.sizes) for (const s of g.sizes) expect(g.stock_by_size?.[s]).toBeGreaterThan(0);
    else expect(g.stock).toBeGreaterThan(0);
  }

  expect(liveOffers()).toContainEqual(expect.objectContaining({ percent_off: 15, billing_cycles: ['annual'] }));
  const welcome = db.coupons.find(c => c.code === 'WELCOME10');
  expect(welcome).toMatchObject({ percent_off: 10, billing_cycles: ['monthly'], active: true, max_uses: null, per_member_limit: 1 });
  expect(welcome!.valid_from <= gymToday() && gymToday() <= welcome!.valid_until).toBe(true);
});

it('the catalogue-only seed has gifts and rules but no claims, points, offers or coupons', () => {
  seedDatabase({ demo: false });
  expect(db.gifts).toEqual(defaultGifts());
  expect(db.reward_settings).toEqual(defaultRewardSettings());
  expect(db.gift_claims).toEqual([]);
  expect(db.points_ledger).toEqual([]);
  expect(db.offers).toEqual([]);
  expect(db.coupons).toEqual([]);
});
