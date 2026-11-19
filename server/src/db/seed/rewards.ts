import db from '../database.js';
import { addDays, gymToday } from '../../lib/dates.js';
import { createClaim } from '../../lib/gifts.js';
import { launchRewards } from '../../lib/milestones.js';
import { recordAward } from '../../lib/points.js';

// Demo data owned by the rewards domain. Called last by runSeedExtensions(), once every visit exists,
// so the launch sees the demo gym's full history. The catalogue and rules are the defaults every gym
// starts with (db/rewardDefaults.ts); this adds stock, persona points and a claim, a live sale and a
// coupon. Dates are relative to now so the sale and the coupon are always live.

export function seedRewards(now: Date = new Date()): void {
  db.gifts = db.gifts.map(g => {
    if (g.kind === 'service') return g;
    if (g.sizes) return { ...g, stock_by_size: Object.fromEntries(g.sizes.map(s => [s, 5])) };
    return { ...g, stock: 25 };
  });

  launchRewards(gymToday(now));

  recordAward({ user_id: 'usr_member_1', key: 'seed-bonus:usr_member_1', points: 400, reason: 'bonus', note: 'Welcome bonus' });

  // Ananya spent her bonus on a mug she has not collected yet.
  const ananya = db.users.find(u => u.id === 'usr_member_2');
  const mug = db.gifts.find(g => g.id === 'gift_mug');
  if (ananya && mug?.points_cost) {
    recordAward({ user_id: ananya.id, key: `seed-bonus:${ananya.id}`, points: mug.points_cost, reason: 'bonus', note: 'Welcome bonus' });
    const claim = createClaim(ananya, mug, { source: 'store', source_ref: '', points_spent: mug.points_cost });
    recordAward({ user_id: ananya.id, key: `claim:${claim.id}`, points: -mug.points_cost, reason: 'claim', ref: claim.id, note: mug.name });
  }

  const day = 24 * 60 * 60_000;
  const createdAt = now.toISOString();
  db.offers = [
    {
      id: 'offer_demo_annual',
      title: 'Annual plan sale',
      banner_text: '15% off every annual plan this week',
      percent_off: 15,
      amount_off: null,
      tiers: [],
      billing_cycles: ['annual'],
      starts_at: new Date(now.getTime() - day).toISOString(),
      ends_at: new Date(now.getTime() + 7 * day).toISOString(),
      active: true,
      created_at: createdAt
    }
  ];
  const today = gymToday(now);
  db.coupons = [
    {
      code: 'WELCOME10',
      percent_off: 10,
      amount_off: null,
      tiers: [],
      billing_cycles: ['monthly'],
      valid_from: today,
      valid_until: addDays(today, 90),
      max_uses: null,
      per_member_limit: 1,
      uses: 0,
      active: true,
      created_at: createdAt
    }
  ];
}
