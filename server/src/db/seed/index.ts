import db from '../database.js';
import { gymDateTime, toGymDate } from '../../lib/dates.js';
import { OPENS_AT } from '../../lib/hours.js';
import { newId } from '../../lib/users.js';
import { AttendanceLog } from '../../types/index.js';
import { seedAuth } from './auth.js';
import { seedPayments } from './payments.js';
import { seedClasses } from './classes.js';
import { seedMembers } from './members.js';
import { seedActivity, seedStreaks } from './activity.js';

// Each domain adds its own demo data in its own file, so they can evolve independently.
export function runSeedExtensions(): void {
  seedAuth();
  seedPayments();
  seedClasses();
  seedMembers();
  seedActivity();
  addMissingCheckIns();
  // Check-ins added above can extend a run, so streaks are derived once more from the final history.
  seedStreaks();
}

/**
 * The domains generate visits independently, so a member could attend a class or train on the
 * floor on a day they never passed the turnstile, or before the turnstile saw them. Make sure every
 * such day has a check-in shortly before the first thing they did there: move the day's check-in
 * earlier when it came later, or add one when there is none. Never before opening time.
 */
function addMissingCheckIns(): void {
  const dayKey = (userId: string, at: number | string) => `${userId}|${toGymDate(at)}`;

  const firstActivity = new Map<string, number>();
  const note = (userId: string, at: number) => {
    const key = dayKey(userId, at);
    firstActivity.set(key, Math.min(firstActivity.get(key) ?? Infinity, at));
  };
  for (const b of db.bookings) {
    if (b.status !== 'attended') continue;
    const start = db.classes.find(c => c.id === b.class_id)?.start_time ?? b.start_time;
    if (start) note(b.user_id, gymDateTime(b.booking_date, start).getTime());
  }
  for (const s of db.time_sessions) note(s.user_id, Date.parse(s.clock_in_time));

  // The turnstile records one visit per member and day.
  const firstCheckIn = new Map<string, AttendanceLog>();
  for (const l of db.attendance_logs) {
    if (l.trial_pass_id) continue;
    const key = dayKey(l.user_id, l.check_in_time);
    const known = firstCheckIn.get(key);
    if (!known || l.check_in_time < known.check_in_time) firstCheckIn.set(key, l);
  }

  const moved = new Map<string, string>();
  const added: AttendanceLog[] = [];
  for (const [key, at] of firstActivity) {
    const [userId, date] = key.split('|');
    const arrival = new Date(Math.max(at - 10 * 60_000, gymDateTime(date, OPENS_AT).getTime())).toISOString();
    const log = firstCheckIn.get(key);
    if (log) {
      if (Date.parse(log.check_in_time) > at) moved.set(log.id, arrival);
      continue;
    }
    const user = db.users.find(u => u.id === userId);
    if (!user) continue;
    added.push({
      id: newId('att'),
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      user_tier: user.membership_tier,
      check_in_time: arrival,
      check_in_method: 'qr'
    });
  }
  if (added.length > 0 || moved.size > 0) {
    db.attendance_logs = [
      ...db.attendance_logs.map(l => (moved.has(l.id) ? { ...l, check_in_time: moved.get(l.id)! } : l)),
      ...added
    ].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
  }
}
