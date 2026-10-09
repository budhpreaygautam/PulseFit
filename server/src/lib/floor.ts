import db from '../db/database.js';
import { activityDays, recordActivity, runEndingOn } from './streak.js';
import { toGymDate } from './dates.js';
import { FloorPresence, TimeSession } from '../types/index.js';

// Floor time rules shared by the time-tracking endpoints and the seed.

// The streak history helpers moved to lib/streak.ts; re-exported for existing callers.
export { activityDays, runEndingOn };

/** A session still open this long after clock-in is closed automatically at clock-in + this. */
export const MAX_SESSION_MINUTES = 4 * 60;

const MINUTE = 60_000;

/** Minutes between clock-in and an instant, never negative and never past the 4-hour cap. */
export function elapsedMinutes(session: Pick<TimeSession, 'clock_in_time'>, until: Date = new Date()): number {
  const minutes = Math.round((until.getTime() - Date.parse(session.clock_in_time)) / MINUTE);
  return Math.min(MAX_SESSION_MINUTES, Math.max(0, minutes));
}

/**
 * Close every session that has been open for 4 hours or more, at clock-in + 4 h, flagged
 * auto_closed. Run before any read or write of floor sessions so a forgotten clock-out never
 * keeps someone "on the floor". A closed session counts towards its owner's streak on the day
 * they clocked in, like a manual clock-out. Returns the number of sessions closed.
 */
export function closeStaleSessions(now: Date = new Date()): number {
  const closed: TimeSession[] = [];
  const sessions = db.time_sessions.map(s => {
    if (s.status !== 'active') return s;
    const closesAt = Date.parse(s.clock_in_time) + MAX_SESSION_MINUTES * MINUTE;
    if (closesAt > now.getTime()) return s;
    const done: TimeSession = {
      ...s,
      status: 'completed',
      clock_out_time: new Date(closesAt).toISOString(),
      duration_minutes: MAX_SESSION_MINUTES,
      auto_closed: true
    };
    closed.push(done);
    return done;
  });
  if (closed.length === 0) return 0;
  db.time_sessions = sessions;
  for (const s of closed) creditSession(s.user_id, toGymDate(s.clock_in_time));
  return closed.length;
}

/**
 * Credit a completed session (already stored) to its owner's streak on its clock-in gym date.
 * recordActivity ignores a day earlier than the last one it counted, so a session closed after
 * some later activity was recorded (a forgotten clock-out auto-closed only once the member is
 * back the next day) would leave a gap in a streak it actually bridges. In that case the run
 * ending on the last counted day is rebuilt from history, and kept only if it is longer.
 */
export function creditSession(userId: string, date: string): void {
  const user = db.users.find(u => u.id === userId);
  if (!user) return;
  const last = user.last_active_date;
  if (!last || date >= last) {
    recordActivity(userId, date);
    return;
  }
  const run = runEndingOn(activityDays(userId), last);
  if (run > (user.streak_days || 0)) {
    db.users = db.users.map(u => (u.id === userId ? { ...u, streak_days: run } : u));
  }
}

/** What staff may see about a person on the floor: no email, notes or ids. */
export function toFloorPresence(session: TimeSession, now: Date = new Date()): FloorPresence {
  const avatar = db.users.find(u => u.id === session.user_id)?.avatar_url ?? session.user_avatar ?? '';
  return {
    user_name: session.user_name,
    // Remote photo URLs only: an uploaded data: photo would make the floor list megabytes long.
    user_avatar: avatar.startsWith('data:') ? '' : avatar,
    user_tier: session.user_tier,
    clock_in_time: session.clock_in_time,
    duration_minutes: elapsedMinutes(session, now)
  };
}
