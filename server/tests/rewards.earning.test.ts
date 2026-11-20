import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addMember, api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { milestoneValues } from '../src/lib/milestones.js';
import { toGymDate } from '../src/lib/dates.js';
import type { AttendanceLog, Booking, Milestone, TimeSession, TrialPass, User } from '../src/types/index.js';

// Monday 5 Oct 2026, 10:00 at the gym (IST). Sunday 11 Oct is closed.
const START = new Date('2026-10-05T04:30:00.000Z');
const at = (date: string) => vi.setSystemTime(new Date(`${date}T04:30:00.000Z`));

const checkIn = (email: string) =>
  api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send({ code: email, method: 'manual' });
const logWorkout = (email: string, date: string) =>
  api()
    .post('/api/workouts')
    .set(authHeader(email))
    .send({ title: 'Push day', date, duration_minutes: 45, sets: [{ exercise_id: db.exercises[0].id, set_number: 1, weight_kg: 40, reps: 10 }] });
const ledger = (userId: string) => db.points_ledger.filter(e => e.user_id === userId);
const claims = (userId: string) => db.gift_claims.filter(c => c.user_id === userId);
const onlyMilestones = (...milestones: Milestone[]) => {
  db.reward_settings = { ...db.reward_settings, milestones };
};
const pastVisit = (user: User, date: string): AttendanceLog => ({
  id: `att_${user.id}_${date}`,
  user_id: user.id,
  user_name: user.name,
  user_email: user.email,
  user_tier: user.membership_tier,
  check_in_time: `${date}T04:30:00.000Z`,
  check_in_method: 'qr'
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  resetDb();
});
afterEach(() => vi.useRealTimers());

it('a staff check-in earns points_per_checkin once, keyed by the attendance log', async () => {
  const m = addMember();
  const res = await checkIn(m.email);
  expect(res.status).toBe(200);
  const logId = res.body.data.log.id;
  expect(ledger(m.id)).toEqual([expect.objectContaining({ points: 10, reason: 'checkin', key: `checkin:${logId}`, ref: logId })]);
});

it('a second check-in on the same day earns nothing', async () => {
  const m = addMember();
  await checkIn(m.email);
  const again = await checkIn(m.email);
  expect(again.body.data.already_checked_in).toBe(true);
  expect(ledger(m.id).filter(e => e.reason === 'checkin')).toHaveLength(1);
});

it('staff accounts and trial passes earn nothing at check-in', async () => {
  const trainer = userByEmail(personas.trainer);
  db.attendance_logs = db.attendance_logs.filter(l => !(l.user_id === trainer.id && toGymDate(l.check_in_time) === '2026-10-05'));
  const entriesBefore = db.points_ledger.length;
  expect((await checkIn(personas.trainer)).body.data.already_checked_in).toBe(false);

  const trial: TrialPass = {
    id: 'trl_rewards',
    code: 'PULSE-TRIAL-RWD234',
    name: 'Sara Ali',
    email: 'sara.ali@example.com',
    phone: '+91 98000 00000',
    interest: 'Zumba & Cardio',
    valid_on: '2026-10-05',
    status: 'issued',
    created_at: START.toISOString()
  };
  db.trial_passes = [...db.trial_passes, trial];
  const scan = await api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send({ code: trial.code });
  expect(scan.body.data).toMatchObject({ kind: 'trial', already_checked_in: false });
  expect(db.points_ledger.length).toBe(entriesBefore);
});

it('a workout logged for today earns points_per_workout once per gym day', async () => {
  const m = addMember();
  expect((await logWorkout(m.email, '2026-10-05')).status).toBe(201);
  expect((await logWorkout(m.email, '2026-10-05')).status).toBe(201);
  expect(ledger(m.id)).toEqual([expect.objectContaining({ key: `workout:${m.id}:2026-10-05`, points: 5, reason: 'workout' })]);
});

it("deleting and re-logging that day's workout earns nothing more; back-dated workouts earn nothing", async () => {
  const m = addMember();
  const first = await logWorkout(m.email, '2026-10-05');
  expect((await api().delete(`/api/workouts/${first.body.data.id}`).set(authHeader(m.email))).status).toBe(200);
  expect((await logWorkout(m.email, '2026-10-05')).status).toBe(201);
  expect(ledger(m.id).map(e => e.key)).toEqual([`workout:${m.id}:2026-10-05`]);

  const other = addMember();
  expect((await logWorkout(other.email, '2026-10-03')).status).toBe(201);
  expect(ledger(other.id)).toEqual([]);
});

it('a frozen member earns workout points; expired and pending members and coaches do not', async () => {
  const frozen = addMember({ membership_status: 'frozen', frozen_since: '2026-10-01' });
  const expired = addMember({ membership_expiry: '2026-10-04' });
  const pending = addMember({ membership_status: 'pending', membership_tier: 'none', membership_expiry: null });
  const coach = addMember({ role: 'trainer' });
  for (const u of [frozen, expired, pending, coach]) expect((await logWorkout(u.email, '2026-10-05')).status).toBe(201);
  expect(ledger(frozen.id)).toHaveLength(1);
  for (const u of [expired, pending, coach]) expect(ledger(u.id)).toEqual([]);
});

it('a check-in that crosses a visits milestone grants its gift once, with no points spent', async () => {
  const m = addMember();
  const before = milestoneValues(m.id).visits;
  onlyMilestones({ id: 'ms_t', type: 'visits', threshold: before + 1, gift_id: 'gift_pt_session' });

  await checkIn(m.email);
  expect(claims(m.id)).toEqual([
    expect.objectContaining({ gift_id: 'gift_pt_session', source: 'milestone', source_ref: 'ms_t', points_spent: 0, status: 'ready' })
  ]);
  expect(ledger(m.id).find(e => e.key === `milestone:ms_t:${m.id}`)).toMatchObject({ points: 0, reason: 'bonus' });

  at('2026-10-06');
  await checkIn(m.email);
  expect(claims(m.id)).toHaveLength(1);
});

it("a milestone added or lowered below a member's value never fires retroactively", async () => {
  const m = addMember();
  db.attendance_logs = [...['2026-10-01', '2026-10-02', '2026-10-03'].map(d => pastVisit(m, d)), ...db.attendance_logs];
  const visits = milestoneValues(m.id).visits;
  expect(visits).toBe(3);
  onlyMilestones(
    { id: 'ms_low', type: 'visits', threshold: visits - 1, gift_id: 'gift_pt_session' },
    { id: 'ms_same', type: 'visits', threshold: visits, gift_id: 'gift_guest_pass' },
    { id: 'ms_next', type: 'visits', threshold: visits + 1, gift_id: 'gift_free_week' }
  );

  await checkIn(m.email);
  expect(claims(m.id).map(c => c.source_ref)).toEqual(['ms_next']);
});

it('a streak milestone is granted once ever, even after the streak drops and is rebuilt', async () => {
  const m = addMember();
  onlyMilestones({ id: 'ms_s', type: 'streak', threshold: 3, gift_id: 'gift_pt_session' });
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) {
    at(d);
    await checkIn(m.email);
  }
  expect(claims(m.id)).toHaveLength(1);

  // Thursday 8 is an open day without a visit, so the run ends; Sunday 11 is closed and bridges.
  for (const d of ['2026-10-09', '2026-10-10', '2026-10-12']) {
    at(d);
    await checkIn(m.email);
  }
  expect(milestoneValues(m.id).streak).toBe(3);
  expect(claims(m.id)).toHaveLength(1);
});

it('self-reported floor sessions and logged workouts do not count toward the milestone streak', async () => {
  const m = addMember();
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) {
    at(d);
    expect((await logWorkout(m.email, d)).status).toBe(201);
  }
  const floor: TimeSession = {
    id: 'ts_rewards',
    user_id: m.id,
    user_name: m.name,
    user_email: m.email,
    user_tier: 'basic',
    category: 'Workout & Strength',
    clock_in_time: '2026-10-06T05:00:00.000Z',
    clock_out_time: '2026-10-06T06:00:00.000Z',
    duration_minutes: 60,
    status: 'completed'
  };
  db.time_sessions = [...db.time_sessions, floor];
  await checkIn(m.email);

  expect(milestoneValues(m.id).streak).toBe(1);
  // The app's own streak still counts them.
  expect(userByEmail(m.email).streak_days).toBe(3);
});

it('a class marked attended can cross a streak milestone', async () => {
  const m = addMember();
  onlyMilestones({ id: 'ms_s', type: 'streak', threshold: 3, gift_id: 'gift_pt_session' });
  at('2026-10-05');
  await checkIn(m.email);
  at('2026-10-06');
  await checkIn(m.email);
  const booking: Booking = {
    id: 'bk_rewards',
    class_id: 'cls_str_wed',
    user_id: m.id,
    booking_date: '2026-10-07',
    status: 'confirmed',
    created_at: '2026-10-06T05:00:00.000Z'
  };
  db.bookings = [...db.bookings, booking];

  at('2026-10-08');
  const mark = () => api().patch(`/api/bookings/${booking.id}/attendance`).set(authHeader(personas.admin)).send({ status: 'attended' });
  expect((await mark()).status).toBe(200);
  expect(claims(m.id)).toEqual([expect.objectContaining({ source: 'milestone', source_ref: 'ms_s', status: 'ready' })]);
  expect((await mark()).status).toBe(200);
  expect(claims(m.id)).toHaveLength(1);
});
