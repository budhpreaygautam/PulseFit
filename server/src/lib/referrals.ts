import crypto from 'crypto';
import db from '../db/database.js';
import { badRequest } from './http.js';
import { CODE_ALPHABET } from './gifts.js';
import { earnsRewards, recordAward } from './points.js';
import { Payment, User } from '../types/index.js';

// Referrals: every member has a code to share (made on first need). An account created with it
// stores the referrer's id in referred_by; the friend's first paid activation credits both of them.
// The code and the link never leave the API in SafeUser.

/** The member's code, made and stored the first time anyone needs it. Never saves: the users setter does. */
export function ensureReferralCode(userId: string): string {
  const existing = db.users.find(u => u.id === userId)?.referral_code;
  if (existing) return existing;
  let code: string;
  do {
    code = Array.from(crypto.randomBytes(8), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  } while (db.users.some(u => u.referral_code === code));
  db.users = db.users.map(u => (u.id === userId ? { ...u, referral_code: code } : u));
  return code;
}

/** The member a typed code names; undefined for no code (or an emptied field). Only members refer. */
export function referrerFor(code: string | undefined): User | undefined {
  const wanted = code?.trim().toUpperCase();
  if (!wanted) return undefined;
  const referrer = db.users.find(u => u.role === 'member' && u.referral_code === wanted);
  if (!referrer) throw badRequest('That referral code does not match any member. Check it, or leave it empty.', 'REFERRAL_CODE_INVALID');
  return referrer;
}

/** Whether the user has any paid payment other than that one: then they are no longer a first-time payer. */
export function hasPaidActivation(userId: string, exceptPaymentId?: string): boolean {
  return db.payments.some(p => p.user_id === userId && p.status === 'paid' && p.id !== exceptPaymentId);
}

/**
 * Whether it is too late to link a referrer (the first paid activation happened). Front-desk sales left no
 * payment before rewards started, so an account from before then, or one that has had a membership, counts as paid.
 */
export function referrerLocked(user: User): boolean {
  const { launched_at } = db.reward_settings;
  return hasPaidActivation(user.id) || !!user.membership_expiry || (!!launched_at && user.created_at < launched_at);
}

/**
 * A referred member's first paid activation: the referrer earns points_per_referral (if they still earn
 * rewards) and the member welcome_points_for_referred. The keys make a repeat (webhook after verify) a no-op.
 * Never saves.
 */
export function creditReferral(user: User, payment: Payment): void {
  if (!user.referred_by || hasPaidActivation(user.id, payment.id)) return;
  const { points_per_referral, welcome_points_for_referred } = db.reward_settings;
  const referrer = db.users.find(u => u.id === user.referred_by);
  if (referrer && earnsRewards(referrer) && points_per_referral > 0) {
    // No name in the note: the referrer's history does not say who joined.
    recordAward({ user_id: referrer.id, key: `referral:${user.id}`, points: points_per_referral, reason: 'referral', note: 'A friend you referred joined' });
  }
  if (welcome_points_for_referred > 0) {
    recordAward({
      user_id: user.id,
      key: `referral-welcome:${user.id}`,
      points: welcome_points_for_referred,
      reason: 'referral',
      note: "Welcome: you joined with a friend's code"
    });
  }
}
