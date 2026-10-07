import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './helpers.js';
import { addDays, dayOfWeek, gymDateTime, gymHour, toGymDate } from '../src/lib/dates.js';
import { isMembershipActive, tierAllowsCategory } from '../src/lib/membership.js';
import { workoutVolume } from '../src/controllers/workoutController.js';

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
    if (chest) expect(chest.total_volume_kg).toBe(3137);
  });
});
