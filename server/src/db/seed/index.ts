import db from '../database.js';
import { gymDateTime, toGymDate } from '../../lib/dates.js';
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
 * floor on a day they never passed the turnstile. Give every such day a check-in shortly before
 * the first thing they did there.
 */
function addMissingCheckIns(): void {
  const visited = new Set(db.attendance_logs.map(l => `${l.user_id}|${toGymDate(l.check_in_time)}`));
  const firstArrival = new Map<string, number>();
  const note = (userId: string, at: number) => {
    const key = `${userId}|${toGymDate(at)}`;
    if (visited.has(key)) return;
    firstArrival.set(key, Math.min(firstArrival.get(key) ?? Infinity, at));
  };

  for (const b of db.bookings) {
    if (b.status !== 'attended') continue;
    const start = db.classes.find(c => c.id === b.class_id)?.start_time ?? b.start_time;
    if (start) note(b.user_id, gymDateTime(b.booking_date, start).getTime());
  }
  for (const s of db.time_sessions) note(s.user_id, Date.parse(s.clock_in_time));

  const added: AttendanceLog[] = [];
  for (const [key, at] of firstArrival) {
    const userId = key.split('|')[0];
    const user = db.users.find(u => u.id === userId);
    if (!user) continue;
    added.push({
      id: newId('att'),
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      user_tier: user.membership_tier,
      check_in_time: new Date(at - 10 * 60_000).toISOString(),
      check_in_method: 'qr'
    });
  }
  if (added.length > 0) {
    db.attendance_logs = [...db.attendance_logs, ...added].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
  }
}
