import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { activeDaysInWeek } from '../src/lib/streak.js';
import { addMember, api, authHeader, db, resetDb } from './helpers.js';

beforeEach(() => {
  resetDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T04:30:00Z'));   // Thu 19 Nov 2026, 10:00 at the gym; week Mon 16 – Sun 22
});
afterEach(() => vi.useRealTimers());

const me = async (email: string) => (await api().get('/api/auth/me').set(authHeader(email))).body.data;

it("activeDaysInWeek counts the days in today's gym week, Monday to Sunday", () => {
  const days = new Set(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-19', '2026-11-23']);
  expect(activeDaysInWeek(days, '2026-11-19')).toBe(3);
  expect(activeDaysInWeek(days, '2026-11-22')).toBe(3);
  expect(activeDaysInWeek(days, '2026-11-23')).toBe(1);
});

it("GET /auth/me counts this week's active days by the streak rule", async () => {
  const m = addMember();
  db.attendance_logs.push({ user_id: m.id, check_in_time: '2026-11-16T04:00:00Z' } as never);               // Mon: counts
  db.attendance_logs.push({ user_id: m.id, check_in_time: '2026-11-15T04:00:00Z' } as never);               // Sun 15: last week
  db.workouts.push({ user_id: m.id, date: '2026-11-17', created_at: '2026-11-17T12:00:00Z' } as never);      // Tue, logged that day
  db.workouts.push({ user_id: m.id, date: '2026-11-18', created_at: '2026-11-19T03:00:00Z' } as never);      // Wed, back-dated: no
  db.bookings.push({ user_id: m.id, status: 'attended', booking_date: '2026-11-19' } as never);               // Thu: counts
  db.bookings.push({ user_id: m.id, status: 'confirmed', booking_date: '2026-11-18' } as never);              // confirmed: no
  db.time_sessions.push({ user_id: m.id, status: 'active', clock_in_time: '2026-11-18T04:00:00Z' } as never); // still open: no
  expect((await me(m.email)).active_days_this_week).toBe(3);
});

it('longest_streak_days is the longest run, stepping over Sundays', async () => {
  const m = addMember();
  for (const d of ['02', '03', '04', '05', '06', '07', '09', '11', '12']) db.attendance_logs.push({ user_id: m.id, check_in_time: `2026-11-${d}T04:00:00Z` } as never);
  expect((await me(m.email)).longest_streak_days).toBe(7);   // Mon 2 – Mon 9 over the closed Sun 8; Tue 10 missed
});

it('a member with no history gets 0 and 0, and other answers do not carry the numbers', async () => {
  const m = addMember();
  expect(await me(m.email)).toMatchObject({ active_days_this_week: 0, longest_streak_days: 0 });
  const updated = await api().put('/api/auth/profile').set(authHeader(m.email)).send({ name: 'New Name' });
  expect(updated.body.data).not.toHaveProperty('active_days_this_week');
});
