import db from '../database.js';
import { addDays, gymDateTime, gymToday } from '../../lib/dates.js';
import { CLOSES_AT, OPENS_AT, isOpenAt, isOpenDay } from '../../lib/hours.js';
import { isMembershipActive, tierAllowsCategory } from '../../lib/membership.js';
import { newId } from '../../lib/users.js';
import { activityDays, runEndingOn } from '../../lib/floor.js';
import { currentStreak } from '../../lib/streak.js';
import { workoutVolume } from '../../controllers/workoutController.js';
import { TimeSession, TimeSessionCategory, User, Workout } from '../../types/index.js';
import { visitWindow } from './members.js';

// Demo data owned by the activity domain. Called by seedDatabase() after the base data
// (users, trainers, classes, exercises, plans) has been written. Everything is placed relative
// to "now" so the app looks alive whenever it is seeded, and every session obeys the same
// rules as POST /time-tracking/clock-in (active membership, entitled floor, opening hours).

const FLOORS: TimeSessionCategory[] = ['Workout & Strength', 'Zumba & Cardio'];
const MINUTE = 60_000;

// How long ago the live sessions started.
const LIVE_STARTED_MINUTES_AGO = [42, 25, 55, 18];
// How many days back from yesterday each demo member trained on every day the gym was open
// (about every other open day before that). The streaks that come out of it follow
// lib/streak's rule; nothing here depends on that rule.
const RECENT_RUN = [6, 3, 2, 5, 1, 4];

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * When a member starts training on a date: early in their usual visit window (seed/members.ts),
 * so floor time matches when they pass the turnstile; at least 10 minutes after opening, leaving
 * room for that check-in; and early enough to finish before closing.
 */
function usualStart(user: User, date: string, offsetMinutes: number, durationMinutes: number): Date {
  const latest = minutesOf(CLOSES_AT) - durationMinutes;
  const start = Math.max(minutesOf(OPENS_AT) + 10, Math.min(latest, visitWindow(user.id)[0] + offsetMinutes));
  return gymDateTime(date, hhmm(start));
}

/** The n-th most recent day before today the gym was open (n = 1 is the last one). */
function openDayBack(today: string, n: number): string {
  let date = today;
  for (let found = 0; found < n;) {
    date = addDays(date, -1);
    if (isOpenDay(date)) found++;
  }
  return date;
}

function floorsFor(user: User): TimeSessionCategory[] {
  return FLOORS.filter(c => tierAllowsCategory(user.membership_tier, c));
}

function session(user: User, category: TimeSessionCategory, clockIn: Date, durationMinutes: number | null, notes: string): TimeSession {
  return {
    id: newId('ses'),
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    user_avatar: user.avatar_url,
    user_tier: user.membership_tier,
    category,
    clock_in_time: clockIn.toISOString(),
    clock_out_time: durationMinutes === null ? null : new Date(clockIn.getTime() + durationMinutes * MINUTE).toISOString(),
    duration_minutes: durationMinutes ?? 0,
    status: durationMinutes === null ? 'active' : 'completed',
    notes
  };
}

/** Move every seeded workout to recent gym days (newest first per member) with an honest volume. */
function seedWorkouts(today: string): void {
  const rank = new Map<string, number>();
  const byUser = new Map<string, Workout[]>();
  for (const w of db.workouts) byUser.set(w.user_id, [...(byUser.get(w.user_id) || []), w]);
  for (const list of byUser.values()) {
    [...list].sort((a, b) => b.date.localeCompare(a.date)).forEach((w, i) => rank.set(w.id, i));
  }

  db.workouts = db.workouts.map(w => {
    const date = openDayBack(today, 1 + 2 * (rank.get(w.id) || 0));
    const user = db.users.find(u => u.id === w.user_id);
    const started = user ? usualStart(user, date, 0, w.duration_minutes) : gymDateTime(date, '07:00');
    const finished = new Date(started.getTime() + w.duration_minutes * MINUTE);
    const sets = w.sets || [];
    return { ...w, date, created_at: finished.toISOString(), sets, total_volume_kg: workoutVolume(sets) };
  });
}

function seedTimeSessions(now: Date): void {
  const today = gymToday(now);
  const members = db.users.filter(u => u.role === 'member' && floorsFor(u).length > 0);
  const sessions: TimeSession[] = [];

  // Completed sessions over the past three weeks: a recent unbroken run for some members, about
  // every other open day before that, only on days their membership was active.
  members.forEach((user, i) => {
    const floors = floorsFor(user);
    for (let back = 1; back <= 21; back++) {
      const date = addDays(today, -back);
      const trains = back <= RECENT_RUN[i % RECENT_RUN.length] || (back + i) % 2 === 0;
      if (!isOpenDay(date) || !trains || !isMembershipActive(user, date)) continue;
      const duration = 40 + ((back * 7 + i * 13) % 45);
      const start = usualStart(user, date, (back * 11 + i * 5) % 20, duration);
      const category = floors[back % floors.length];
      sessions.push(session(user, category, start, duration, category === 'Zumba & Cardio' ? 'Cardio and dance floor' : 'Strength floor session'));
    }
  });

  // People on the floor right now, only while the gym is open and never before opening time.
  if (isOpenAt(now)) {
    const minutesOpen = Math.floor((now.getTime() - gymDateTime(today, OPENS_AT).getTime()) / MINUTE);
    members
      .filter(u => isMembershipActive(u, today))
      .slice(0, LIVE_STARTED_MINUTES_AGO.length)
      .forEach((user, i) => {
        const floors = floorsFor(user);
        const ago = Math.min(LIVE_STARTED_MINUTES_AGO[i], minutesOpen);
        const category = floors[(i + 1) % floors.length];
        sessions.push(session(user, category, new Date(now.getTime() - ago * MINUTE), null, 'Training now'));
      });
  }

  db.time_sessions = sessions.sort((a, b) => b.clock_in_time.localeCompare(a.clock_in_time));
}

/**
 * Make every user's streak agree with the activity history that now exists: the run ending on
 * their last active day (lib/floor's runEndingOn), kept only while lib/streak's currentStreak
 * still counts it. The base users carry made-up streak numbers with no last_active_date, which
 * would otherwise be shown (and incremented) forever.
 */
export function seedStreaks(now: Date = new Date()): void {
  const today = gymToday(now);
  db.users = db.users.map(u => {
    const days = activityDays(u.id);
    const last = [...days].filter(d => d <= today).sort().pop() ?? null;
    const streak = last ? currentStreak({ streak_days: runEndingOn(days, last), last_active_date: last }, today) : 0;
    return { ...u, streak_days: streak, last_active_date: last };
  });
}

export function seedActivity(now: Date = new Date()): void {
  seedWorkouts(gymToday(now));
  seedTimeSessions(now);
  seedStreaks(now);
}
