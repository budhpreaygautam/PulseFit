import db from '../db/database.js';
import { addDays, gymToday, toGymDate } from './dates.js';
import { isOpenDay, previousOpenDay } from './hours.js';
import { runEndingOn } from './streak.js';
import { grantGifts } from './gifts.js';
import { earnsRewards, recordAward } from './points.js';
import { GiftClaim, GiftLevel, Milestone, User } from '../types/index.js';

// Milestones count only what the gym confirmed: staff check-ins and classes marked attended.
// Self-reported floor sessions and workouts feed the app's streak (lib/streak.ts) but not these.

export interface MilestoneValues {
  visits: number;
  streak: number;
}

/** Gym dates of the member's check-ins and attended classes. */
export function confirmedDays(userId: string): Set<string> {
  const days = new Set<string>();
  for (const l of db.attendance_logs) if (l.user_id === userId) days.add(toGymDate(l.check_in_time));
  for (const b of db.bookings) if (b.user_id === userId && b.status === 'attended') days.add(b.booking_date);
  return days;
}

/**
 * Visits = check-ins; streak = the run of confirmed days ending on the latest one up to today, or 0
 * once an open day has passed without one (the lapse rule of currentStreak).
 */
export function milestoneValues(userId: string, today = gymToday()): MilestoneValues {
  const visits = db.attendance_logs.filter(l => l.user_id === userId).length;
  const days = confirmedDays(userId);
  const last = [...days].filter(d => d <= today).sort().pop();
  const streak = last && last >= previousOpenDay(today) ? runEndingOn(days, last) : 0;
  return { visits, streak };
}

/**
 * Grant every milestone this step crossed (before < threshold ≤ after). The award key makes each one
 * once per member ever, so a rebuilt streak or a lowered threshold never grants it again.
 */
export function grantCrossedMilestones(user: User, before: MilestoneValues, after: MilestoneValues): GiftClaim[] {
  return db.reward_settings.milestones
    .filter(m => before[m.type] < m.threshold && m.threshold <= after[m.type])
    .flatMap(m =>
      grantGifts(user, {
        key: `milestone:${m.id}:${user.id}`,
        gift_ids: [m.gift_id],
        source: 'milestone',
        source_ref: m.id,
        note: m.type === 'visits' ? `${m.threshold} visits` : `${m.threshold}-day streak`
      })
    );
}

/**
 * The longest run anywhere in the days, by the rule of runEndingOn, in one pass: oldest first, each
 * day's run is one more than the run ending on the day before it (closed days without activity skipped).
 */
export function longestRun(days: Set<string>): number {
  const run = new Map<string, number>();
  let longest = 0;
  for (const d of [...days].sort()) {
    let p = addDays(d, -1);
    while (!days.has(p) && !isOpenDay(p)) p = addDays(p, -1);
    const n = (run.get(p) ?? 0) + 1;
    run.set(d, n);
    if (n > longest) longest = n;
  }
  return longest;
}

const LEVEL_RANK: Record<GiftLevel, number> = { small: 0, medium: 1, big: 2, premium: 3 };

/**
 * The one-time launch: each member who earns rewards and already passed milestones gets one welcome
 * gift, the highest one passed, and every passed milestone is marked done so it never fires later.
 * Past visits and workouts earn no points. Does nothing once launched_at is set. Never saves.
 */
export function launchRewards(today = gymToday()): { members: number; gifts: number } {
  if (db.reward_settings.launched_at) return { members: 0, gifts: 0 };
  const rank = (m: Milestone): [level: number, cost: number] => {
    const gift = db.gifts.find(g => g.id === m.gift_id);
    return [gift ? LEVEL_RANK[gift.level] : -1, gift?.points_cost ?? 0];
  };
  // The higher gift level, then the higher cost; on a tie the later milestone in the list (>=, as reduce goes in order).
  const higher = (best: Milestone, m: Milestone) => {
    const [[l, c], [bl, bc]] = [rank(m), rank(best)];
    return l > bl || (l === bl && c >= bc) ? m : best;
  };

  let members = 0;
  let gifts = 0;
  for (const user of db.users.filter(u => earnsRewards(u, today))) {
    const visits = db.attendance_logs.filter(l => l.user_id === user.id).length;
    const streak = longestRun(confirmedDays(user.id));
    const passed = db.reward_settings.milestones.filter(m => (m.type === 'visits' ? visits : streak) >= m.threshold);
    if (passed.length === 0) continue;
    const highest = passed.reduce(higher);
    members++;
    gifts += grantGifts(user, {
      key: `launch-gift:${user.id}`,
      gift_ids: [highest.gift_id],
      source: 'milestone',
      source_ref: highest.id,
      note: 'Welcome gift for regulars'
    }).length;
    for (const m of passed) {
      recordAward({ user_id: user.id, key: `milestone:${m.id}:${user.id}`, points: 0, reason: 'bonus', ref: m.id, note: 'Reached before rewards launched' });
    }
  }
  db.reward_settings = { ...db.reward_settings, launched_at: new Date().toISOString() };
  return { members, gifts };
}
