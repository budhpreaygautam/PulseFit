import db from '../db/database.js';
import { gymToday } from './dates.js';
import { earnsRewards, recordAward } from './points.js';
import { grantCrossedMilestones, MilestoneValues, milestoneValues } from './milestones.js';
import { grantGifts } from './gifts.js';
import { creditReferral } from './referrals.js';
import { AttendanceLog, GiftClaim, Payment, User, Workout } from '../types/index.js';

// The hooks the existing controllers call when something earns a reward. Each does nothing for an
// account that does not earn (lib/points.ts earnsRewards) and never saves: the caller does.

/** A new staff check-in: points keyed by the log, then any milestone it crossed. */
export function onCheckIn(user: User, log: AttendanceLog, before: MilestoneValues): GiftClaim[] {
  if (!earnsRewards(user)) return [];
  const { points_per_checkin } = db.reward_settings;
  if (points_per_checkin > 0) {
    recordAward({ user_id: user.id, key: `checkin:${log.id}`, points: points_per_checkin, reason: 'checkin', ref: log.id });
  }
  return grantCrossedMilestones(user, before, milestoneValues(user.id));
}

/** A class newly marked attended: milestones only (no points). */
export function onClassAttended(userId: string, before: MilestoneValues): GiftClaim[] {
  const user = db.users.find(u => u.id === userId);
  if (!user || !earnsRewards(user)) return [];
  return grantCrossedMilestones(user, before, milestoneValues(userId));
}

/**
 * A paid activation, online or at the desk: the joining gifts for its plan and cycle. Bundles come with
 * every payment (key join:<paymentId>); once-per-member gifts only the first time (join-once:<giftId>:<userId>).
 * A referred member's first one also credits the referral (lib/referrals.ts).
 */
export function onPaidActivation(user: User, payment: Payment): GiftClaim[] {
  if (!earnsRewards(user)) return [];
  const rules = db.reward_settings.joining_gifts.filter(j => j.tier === payment.tier && j.billing_cycle === payment.billing_cycle);
  const award = { source: 'joining' as const, source_ref: payment.id, note: `Joining gift: ${payment.plan_name}` };
  const bundle = rules.filter(j => !j.once_per_member).flatMap(j => j.gift_ids);
  const once = rules.filter(j => j.once_per_member).flatMap(j => j.gift_ids);
  const gifts = [
    // No empty join: entry for a plan whose only gifts are once-per-member.
    ...(bundle.length ? grantGifts(user, { ...award, key: `join:${payment.id}`, gift_ids: bundle }) : []),
    ...once.flatMap(id => grantGifts(user, { ...award, key: `join-once:${id}:${user.id}`, gift_ids: [id] }))
  ];
  creditReferral(user, payment);
  return gifts;
}

/** A workout logged for today: points once per member and gym day; back-dated ones earn nothing. */
export function onWorkoutLogged(user: User, workout: Workout): void {
  const { points_per_workout } = db.reward_settings;
  if (!earnsRewards(user) || workout.date !== gymToday() || points_per_workout <= 0) return;
  recordAward({ user_id: user.id, key: `workout:${user.id}:${workout.date}`, points: points_per_workout, reason: 'workout', ref: workout.id });
}
