import db from '../db/database.js';
import { addDays, gymToday } from './dates.js';
import { User } from '../types/index.js';

// The streak is the number of consecutive gym days with at least one activity
// (turnstile check-in, completed floor session, or a workout logged for that day).
// Every code path that counts activity goes through recordActivity, so a day is counted once.

/** Streak to display today: a streak whose last day is before yesterday has lapsed to 0. */
export function currentStreak(user: Pick<User, 'streak_days' | 'last_active_date'>, today = gymToday()): number {
  const last = user.last_active_date;
  // A number without the day it was earned cannot be trusted (v2.0 data stored bare counters).
  if (!last) return 0;
  if (last === today || last === addDays(today, -1)) return user.streak_days || 0;
  return 0;
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

  if (last && addDays(last, 1) === date) {
    streak += 1;
  } else {
    streak = 1;
  }

  db.users = db.users.map(u => (u.id === userId ? { ...u, streak_days: streak, last_active_date: date } : u));
  return streak;
}
