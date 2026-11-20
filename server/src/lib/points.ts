import db from '../db/database.js';
import { hasPlan } from './membership.js';
import { gymToday } from './dates.js';
import { newId } from './users.js';
import { PointsEntry, User } from '../types/index.js';

// Points live only in the append-only points_ledger. Every award carries a key that is unique
// across the ledger (e.g. checkin:<attendanceId>), so an award replayed by a retry, a webhook
// after verify or a rebuilt streak is written once. The balance is the sum of a member's entries.

/** Members earn points and gifts only while they have a plan (active, or frozen up to its paid end date); staff and lapsed members never do. */
export function earnsRewards(user: Pick<User, 'role' | 'membership_status' | 'membership_expiry'>, today = gymToday()): boolean {
  return user.role === 'member' && hasPlan(user, today);
}

export function hasAward(key: string): boolean {
  return db.points_ledger.some(e => e.key === key);
}

/** Append an entry unless its key was used before (then null). Never saves: the caller does. */
export function recordAward(entry: Omit<PointsEntry, 'id' | 'created_at'>): PointsEntry | null {
  if (hasAward(entry.key)) return null;
  const saved: PointsEntry = { id: newId('pts'), ...entry, created_at: new Date().toISOString() };
  db.points_ledger = [...db.points_ledger, saved];
  return saved;
}

/** A member's entries, newest first. */
export function entriesOf(userId: string): PointsEntry[] {
  // The ledger is append-only, so reversing gives newest first; the sort only matters for equal times.
  return db.points_ledger
    .filter(e => e.user_id === userId)
    .reverse()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function pointsBalance(userId: string): number {
  return db.points_ledger.reduce((sum, e) => (e.user_id === userId ? sum + e.points : sum), 0);
}
