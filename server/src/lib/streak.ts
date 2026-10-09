import db from '../db/database.js';
import { addDays, gymToday, toGymDate } from './dates.js';
import { isOpenDay, previousOpenDay } from './hours.js';
import { User } from '../types/index.js';

// The streak is the number of consecutive gym days with at least one activity
// (turnstile check-in, completed floor session, attended class, or a workout logged for that day).
// Days the gym is closed (Sundays) are neutral: they never break a run, and activity on one
// still counts as a day. Every code path that counts activity goes through recordActivity, so a
// day is counted once; recomputeStreak rebuilds the same number from history when a counted day
// is taken back.

/** Whether a run whose last day is `last` is still alive on `date`: no open day lies between them. */
function continuesTo(last: string, date: string): boolean {
  return last >= previousOpenDay(date);
}

/**
 * Streak to display today. It lapses to 0 once an open day before today went by without
 * activity (Saturday's run is still alive on Sunday and Monday); today itself is still to play for.
 */
export function currentStreak(user: Pick<User, 'streak_days' | 'last_active_date'>, today = gymToday()): number {
  const last = user.last_active_date;
  // A number without the day it was earned cannot be trusted (v2.0 data stored bare counters).
  if (!last) return 0;
  return continuesTo(last, today) ? user.streak_days || 0 : 0;
}

/**
 * Count activity for a user on a gym-local date (default today). Returns the new streak.
 * Activity on a date earlier than the last counted day is ignored (back-dated workouts
 * do not rewrite history).
 */
export function recordActivity(userId: string, date = gymToday()): number {
  const user = db.users.find(u => u.id === userId);
  if (!user) return 0;

  const last = user.last_active_date || null;
  let streak = user.streak_days || 0;

  if (last === date) return streak;
  if (last && date < last) return streak;

  if (last && continuesTo(last, date)) {
    streak += 1;
  } else {
    streak = 1;
  }

  db.users = db.users.map(u => (u.id === userId ? { ...u, streak_days: streak, last_active_date: date } : u));
  return streak;
}

/**
 * Gym-local days on which a user did something that counts towards the streak, read from stored
 * history: completed floor sessions, turnstile check-ins, attended bookings, and workouts logged
 * on the day they are for.
 */
export function activityDays(userId: string): Set<string> {
  const days = new Set<string>();
  for (const s of db.time_sessions) if (s.user_id === userId && s.status === 'completed') days.add(toGymDate(s.clock_in_time));
  for (const l of db.attendance_logs) if (l.user_id === userId) days.add(toGymDate(l.check_in_time));
  for (const b of db.bookings) if (b.user_id === userId && b.status === 'attended') days.add(b.booking_date);
  for (const w of db.workouts) {
    if (w.user_id === userId && w.created_at && toGymDate(w.created_at) === w.date) days.add(w.date);
  }
  return days;
}

/**
 * Length of the run in `days` ending on `through` (0 when `through` is not one of them), by the
 * same rule as recordActivity: a closed day without activity is stepped over, an open one ends it.
 */
export function runEndingOn(days: Set<string>, through: string): number {
  let run = 0;
  let d = through;
  while (days.has(d)) {
    run++;
    d = addDays(d, -1);
    while (!days.has(d) && !isOpenDay(d)) d = addDays(d, -1);
  }
  return run;
}

/**
 * Rebuild a user's streak and last active day from their stored history, for when a day that was
 * counted is taken back (attendance corrected away from 'attended', a workout deleted). Gives the
 * same result as replaying every activity day up to today through recordActivity.
 */
export function recomputeStreak(userId: string, today = gymToday()): number {
  if (!db.users.some(u => u.id === userId)) return 0;
  const days = activityDays(userId);
  const last = [...days].filter(d => d <= today).sort().pop() ?? null;
  const streak = last ? runEndingOn(days, last) : 0;
  db.users = db.users.map(u => (u.id === userId ? { ...u, streak_days: streak, last_active_date: last } : u));
  return streak;
}
