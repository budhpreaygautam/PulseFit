import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './helpers.js';
import { addDays, dayOfWeek, gymDateTime, gymHour, toGymDate } from '../src/lib/dates.js';
import { isMembershipActive, tierAllowsCategory } from '../src/lib/membership.js';
import { workoutVolume } from '../src/controllers/workoutController.js';
import { recordActivity } from '../src/lib/streak.js';

function seedAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  resetDb();
  return new Date(iso);
}

const active = () => db.time_sessions.filter(s => s.status === 'active');

function expectSessionsFollowTheRules() {
  for (const s of db.time_sessions) {
    const user = db.users.find(u => u.id === s.user_id)!;
    const date = toGymDate(s.clock_in_time);
    expect(user.role).toBe('member');
    expect(isMembershipActive(user, date)).toBe(true);
    expect(tierAllowsCategory(user.membership_tier, s.category)).toBe(true);
    expect(dayOfWeek(date)).not.toBe(0);
    expect(gymHour(s.clock_in_time)).toBeGreaterThanOrEqual(6);
    if (s.clock_out_time) {
      expect(Date.parse(s.clock_out_time)).toBeLessThanOrEqual(gymDateTime(date, '22:00').getTime());
      expect(s.duration_minutes).toBe(Math.round((Date.parse(s.clock_out_time) - Date.parse(s.clock_in_time)) / 60000));
    }
  }
}

describe('activity seed', () => {
  afterEach(() => vi.useRealTimers());

  it('puts 2-4 members on the floor while the gym is open, all started within 90 minutes', async () => {
    const now = seedAt('2026-10-07T04:30:00.000Z'); // Wed 10:00 IST
    const live = active();
    expect(live.length).toBeGreaterThanOrEqual(2);
    expect(live.length).toBeLessThanOrEqual(4);
    for (const s of live) {
      const ago = now.getTime() - Date.parse(s.clock_in_time);
      expect(ago).toBeGreaterThanOrEqual(0);
      expect(ago).toBeLessThanOrEqual(90 * 60_000);
    }
    expect(new Set(live.map(s => s.user_id)).size).toBe(live.length);
    expectSessionsFollowTheRules();
  });

  it('never starts a live session before opening time', async () => {
    const now = seedAt('2026-10-07T00:50:00.000Z'); // Wed 06:20 IST
    expect(active().length).toBeGreaterThanOrEqual(2);
    for (const s of active()) {
      expect(Date.parse(s.clock_in_time)).toBeGreaterThanOrEqual(gymDateTime('2026-10-07', '06:00').getTime());
      expect(Date.parse(s.clock_in_time)).toBeLessThanOrEqual(now.getTime());
    }
  });

  it.each([
    ['on Sunday', '2026-10-11T05:00:00.000Z'],
    ['at night', '2026-10-07T17:30:00.000Z'], // 23:00 IST
    ['before opening', '2026-10-07T00:00:00.000Z'] // 05:30 IST
  ])('leaves the floor empty %s', async (_label, iso) => {
    seedAt(iso);
    expect(active()).toHaveLength(0);
    expectSessionsFollowTheRules();
  });

  it('seeds completed sessions over the past three weeks, within the rules', async () => {
    seedAt('2026-10-07T04:30:00.000Z');
    const done = db.time_sessions.filter(s => s.status === 'completed');
    expect(done.length).toBeGreaterThan(10);
    for (const s of done) {
      const date = toGymDate(s.clock_in_time);
      expect(date >= addDays('2026-10-07', -21) && date < '2026-10-07').toBe(true);
    }
    // The expired member has no sessions after their membership ended.
    const dev = db.users.find(u => u.email === 'dev.kapoor@example.com')!;
    expect(db.time_sessions.some(s => s.user_id === dev.id && toGymDate(s.clock_in_time) > dev.membership_expiry!)).toBe(false);
    expectSessionsFollowTheRules();
  });

  it('moves workouts to recent open days with volumes recomputed from their sets (regression: inflated volumes)', async () => {
    seedAt('2026-10-07T04:30:00.000Z');
    expect(db.workouts.length).toBeGreaterThan(0);
    for (const w of db.workouts) {
      expect(w.date < '2026-10-07' && w.date >= addDays('2026-10-07', -14)).toBe(true);
      expect(dayOfWeek(w.date)).not.toBe(0);
      expect(w.total_volume_kg).toBe(workoutVolume(w.sets || []));
      expect(toGymDate(w.created_at!)).toBe(w.date);
    }
    const chest = db.workouts.find(w => w.id === 'wk_aarav_1');
    expect(chest).toBeDefined();
    expect(chest!.total_volume_kg).toBe(3137);
  });

  it.each([
    ['on a Wednesday', '2026-10-07T04:30:00.000Z'],
    ['on a Monday', '2026-10-12T04:30:00.000Z'],
    ['on a Sunday', '2026-10-11T05:00:00.000Z']
  ])('gives every user a streak that matches the seeded history %s (regression: made-up streak numbers)', async (_label, iso) => {
    const now = seedAt(iso);
    const today = toGymDate(now);
    for (const u of db.users) {
      const days = new Set<string>();
      for (const s of db.time_sessions) if (s.user_id === u.id && s.status === 'completed') days.add(toGymDate(s.clock_in_time));
      for (const l of db.attendance_logs) if (l.user_id === u.id) days.add(toGymDate(l.check_in_time));
      for (const b of db.bookings) if (b.user_id === u.id && b.status === 'attended') days.add(b.booking_date);
      for (const w of db.workouts) if (w.user_id === u.id && toGymDate(w.created_at!) === w.date) days.add(w.date);
      const last = [...days].filter(d => d <= today).sort().pop() ?? null;
      // Closed days (Sundays) without activity are stepped over, not a break in the run.
      let run = 0;
      if (last && last >= addDays(today, -1)) {
        for (let d = last; days.has(d); ) {
          run++;
          d = addDays(d, -1);
          while (!days.has(d) && dayOfWeek(d) === 0) d = addDays(d, -1);
        }
      }
      expect(u.last_active_date ?? null, u.name).toBe(last);
      expect(u.streak_days, u.name).toBe(run);
    }
    // Staff have no seeded activity, so no streak; some members are on a live run.
    expect(db.users.find(u => u.role === 'admin')!.streak_days).toBe(0);
    if (dayOfWeek(today) !== 1) expect(db.users.some(u => (u.streak_days || 0) >= 2)).toBe(true);
  });

  it('does not inflate a seeded streak on the next activity (regression: +1 on a date-less streak)', async () => {
    seedAt('2026-10-07T04:30:00.000Z');
    // Members already in the gym at seed time have checked in today; pick one whose run ends yesterday.
    const onRun = db.users.find(u => u.last_active_date === '2026-10-06' && (u.streak_days || 0) > 0)
      ?? (() => {
        const member = db.users.find(u => u.role === 'member')!;
        db.users = db.users.map(u => (u.id === member.id ? { ...u, streak_days: 3, last_active_date: '2026-10-06' } : u));
        return db.users.find(u => u.id === member.id);
      })();
    expect(onRun).toBeDefined();
    recordActivity(onRun!.id, '2026-10-07');
    expect(db.users.find(u => u.id === onRun!.id)!.streak_days).toBe(onRun!.streak_days! + 1);
    // A user whose last activity was before yesterday starts again at 1.
    const lapsed = db.users.find(u => u.role === 'member' && u.last_active_date && u.last_active_date < '2026-10-06');
    if (lapsed) {
      expect(lapsed.streak_days).toBe(0);
      recordActivity(lapsed.id, '2026-10-07');
      expect(db.users.find(u => u.id === lapsed.id)!.streak_days).toBe(1);
    }
  });
});
