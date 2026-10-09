import db from '../database.js';
import { addDays, dayOfWeek, gymDateTime, gymToday, toGymDate } from '../../lib/dates.js';
import { recordActivity } from '../../lib/streak.js';
import { newId } from '../../lib/users.js';
import { AttendanceLog, TrialPass } from '../../types/index.js';

// Demo data owned by the members domain. Called by seedDatabase() after the base data
// (users, trainers, classes, exercises, plans) has been written.

const HISTORY_DAYS = 28;

interface VisitPattern {
  visitsPerWeek: number;
  // Preferred window in gym-local minutes after midnight; most visits fall inside it.
  window: [number, number];
}

// Morning people peak 06:00-09:00, evening people 17:00-21:00, with the odd midday visit.
const PATTERNS: Record<string, VisitPattern> = {
  usr_member_1: { visitsPerWeek: 5, window: [17 * 60 + 15, 20 * 60 + 30] }, // Aarav, evening Zumba/cardio
  usr_member_2: { visitsPerWeek: 4, window: [18 * 60, 21 * 60] }, // Ananya, after work
  usr_member_3: { visitsPerWeek: 3, window: [6 * 60, 8 * 60 + 30] }, // Rohan, before work
  usr_member_4: { visitsPerWeek: 4, window: [6 * 60 + 15, 9 * 60] } // Maya, early riser
};
const DEFAULT_PATTERN: VisitPattern = { visitsPerWeek: 3, window: [17 * 60, 21 * 60] };

/** When a demo member usually comes in, in gym-local minutes after midnight. Floor sessions use it too. */
export function visitWindow(userId: string): [number, number] {
  return (PATTERNS[userId] ?? DEFAULT_PATTERN).window;
}

const OPEN = 6 * 60;
const LAST_ENTRY = 21 * 60 + 45;

/** Small deterministic PRNG so the same day always seeds the same history. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hhmm(minutes: number): string {
  const m = Math.max(OPEN, Math.min(LAST_ENTRY, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function seedAttendance(today: string, now: Date): AttendanceLog[] {
  const logs: AttendanceLog[] = [];
  const members = db.users.filter(
    u => u.role === 'member' && (u.membership_status === 'active' || u.membership_status === 'expired') && u.membership_expiry
  );

  for (const user of members) {
    const pattern = PATTERNS[user.id] ?? DEFAULT_PATTERN;
    const rand = mulberry32(hash(`${user.id}:${today}`));
    // Six open days a week (closed Sundays).
    const chance = Math.min(1, pattern.visitsPerWeek / 6);

    for (let back = HISTORY_DAYS - 1; back >= 0; back--) {
      const date = addDays(today, -back);
      if (dayOfWeek(date) === 0) continue;
      if (date > user.membership_expiry!) continue; // no entry after the last day of access
      if (rand() >= chance) continue;

      const [from, to] = pattern.window;
      const minutes = rand() < 0.15 ? 11 * 60 + rand() * 4 * 60 : from + rand() * (to - from);
      const at = gymDateTime(date, hhmm(minutes));
      if (at.getTime() > now.getTime()) continue;

      const r = rand();
      logs.push({
        id: newId('att'),
        user_id: user.id,
        user_name: user.name,
        user_email: user.email,
        user_tier: user.membership_tier,
        check_in_time: at.toISOString(),
        check_in_method: r < 0.8 ? 'qr' : r < 0.92 ? 'kiosk' : 'manual'
      });
    }
  }
  return logs;
}

/**
 * seed.ts gives members fixed streak numbers that the generated history cannot back up.
 * Replay each member's visit days through recordActivity instead, so the streak follows
 * whatever rule lib/streak applies.
 */
function syncStreaks(logs: AttendanceLog[]): void {
  const visitDays = new Map<string, Set<string>>();
  for (const log of logs) {
    if (log.trial_pass_id) continue;
    const days = visitDays.get(log.user_id) ?? new Set<string>();
    days.add(toGymDate(log.check_in_time));
    visitDays.set(log.user_id, days);
  }

  db.users = db.users.map(u => (u.role === 'member' ? { ...u, streak_days: 0, last_active_date: null } : u));
  for (const [userId, days] of visitDays) {
    for (const day of [...days].sort()) recordActivity(userId, day);
  }
}

function previousOpenDay(date: string, daysBack: number): string {
  let d = addDays(date, -daysBack);
  while (dayOfWeek(d) === 0) d = addDays(d, -1);
  return d;
}

export function seedMembers(): void {
  const now = new Date();
  const today = gymToday(now);

  const logs = seedAttendance(today, now);

  // A trial on a Sunday would be on a closed day, so the "today" pass moves to Monday then.
  const validOn = dayOfWeek(today) === 0 ? addDays(today, 1) : today;
  const redeemedOn = previousOpenDay(today, 3);
  const redeemedAt = gymDateTime(redeemedOn, '18:10');

  const trials: TrialPass[] = [
    {
      id: 'trial_seed_upcoming',
      code: 'PULSE-TRIAL-K7M2QX',
      name: 'Ishaan Malhotra',
      email: 'ishaan.malhotra@example.com',
      phone: '+91 98117 40021',
      interest: 'Workout & Strength',
      valid_on: validOn,
      status: 'issued',
      created_at: gymDateTime(addDays(today, -2), '20:45').toISOString()
    },
    {
      id: 'trial_seed_redeemed',
      code: 'PULSE-TRIAL-R4NW8C',
      name: 'Neha Bhatia',
      email: 'neha.bhatia@example.com',
      phone: '+91 98118 63307',
      interest: 'Zumba & Cardio',
      valid_on: redeemedOn,
      status: 'redeemed',
      created_at: gymDateTime(addDays(redeemedOn, -4), '13:20').toISOString(),
      redeemed_at: redeemedAt.toISOString()
    }
  ];

  logs.push({
    id: newId('att'),
    user_id: 'trial_seed_redeemed',
    user_name: 'Neha Bhatia',
    user_email: 'neha.bhatia@example.com',
    user_tier: 'trial',
    check_in_time: redeemedAt.toISOString(),
    check_in_method: 'qr',
    trial_pass_id: 'trial_seed_redeemed'
  });

  db.attendance_logs = logs.sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
  db.trial_passes = trials;
  syncStreaks(logs);
}
