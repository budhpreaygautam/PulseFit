import db from '../db/database.js';
import { recordActivity } from './streak.js';
import { toGymDate } from './dates.js';
import { FloorPresence, TimeSession } from '../types/index.js';

// Floor time rules shared by the time-tracking endpoints and the seed.

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
  for (const s of closed) recordActivity(s.user_id, toGymDate(s.clock_in_time));
  return closed.length;
}

/** What staff may see about a person on the floor: no email, notes or ids. */
export function toFloorPresence(session: TimeSession, now: Date = new Date()): FloorPresence {
  return {
    user_name: session.user_name,
    user_avatar: session.user_avatar ?? '',
    user_tier: session.user_tier,
    clock_in_time: session.clock_in_time,
    duration_minutes: elapsedMinutes(session, now)
  };
}
