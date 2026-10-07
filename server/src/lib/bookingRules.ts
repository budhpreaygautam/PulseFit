import db from '../db/database.js';
import { hasStarted } from './occurrences.js';
import { tierAllowsCategory } from './membership.js';
import { creditSession, elapsedMinutes, MAX_SESSION_MINUTES } from './floor.js';
import { toGymDate } from './dates.js';
import { Booking } from '../types/index.js';

// Keeping bookings honest when something else changes: a frozen member, a class moved to
// another category, or a plan whose entitlements shrink must not keep holding spots that the
// booking rules would now refuse.

function startTimeOf(booking: Booking): string {
  return db.classes.find(c => c.id === booking.class_id)?.start_time ?? booking.start_time ?? '00:00';
}

/** Cancel the confirmed bookings matched by `shouldCancel` whose class has not started yet. */
function cancelUpcoming(shouldCancel: (booking: Booking) => boolean, now: Date = new Date()): number {
  const cancelledAt = now.toISOString();
  let cancelled = 0;
  const bookings = db.bookings.map(b => {
    if (b.status !== 'confirmed' || hasStarted(startTimeOf(b), b.booking_date, now) || !shouldCancel(b)) return b;
    cancelled++;
    return { ...b, status: 'cancelled' as const, cancelled_at: cancelledAt };
  });
  if (cancelled > 0) db.bookings = bookings;
  return cancelled;
}

/** A frozen member cannot attend: free the spots they hold. */
export function releaseMemberBookings(userId: string, now: Date = new Date()): number {
  return cancelUpcoming(b => b.user_id === userId, now);
}

/**
 * After a class's category or a plan's categories change, cancel upcoming bookings whose member's
 * plan no longer covers the class. Scope to one class and/or one tier.
 */
export function releaseUnentitledBookings(scope: { classId?: string; tier?: string }, now: Date = new Date()): number {
  return cancelUpcoming(b => {
    if (scope.classId && b.class_id !== scope.classId) return false;
    const member = db.users.find(u => u.id === b.user_id);
    const cls = db.classes.find(c => c.id === b.class_id);
    if (!member || !cls || member.role !== 'member') return false;
    if (scope.tier && member.membership_tier !== scope.tier) return false;
    return !tierAllowsCategory(member.membership_tier, cls.category);
  }, now);
}

/** Close the member's open floor session now (e.g. when their membership is frozen). */
export function closeOpenSession(userId: string, now: Date = new Date()): boolean {
  const open = db.time_sessions.find(s => s.user_id === userId && s.status === 'active');
  if (!open) return false;
  const minutes = Math.min(MAX_SESSION_MINUTES, Math.max(1, elapsedMinutes(open, now)));
  db.time_sessions = db.time_sessions.map(s =>
    s.id === open.id ? { ...s, status: 'completed' as const, clock_out_time: now.toISOString(), duration_minutes: minutes } : s
  );
  creditSession(userId, toGymDate(open.clock_in_time));
  return true;
}
