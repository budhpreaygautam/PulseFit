import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { TimeSession } from '../src/types/index.js';
import { recordActivity } from '../src/lib/streak.js';

// Wednesday 2026-10-07, 10:00 at the gym (IST): the gym is open.
const NOW = new Date('2026-10-07T04:30:00.000Z');
const HOUR = 3_600_000;

function setNow(instant: Date | string | number) {
  vi.setSystemTime(new Date(instant));
}

function openSession(email: string, overrides: Partial<TimeSession> = {}): TimeSession {
  const user = userByEmail(email);
  const s: TimeSession = {
    id: `ses_test_${Math.random().toString(36).slice(2, 10)}`,
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    user_avatar: user.avatar_url,
    user_tier: user.membership_tier,
    category: 'Workout & Strength',
    clock_in_time: new Date(Date.now() - 30 * 60_000).toISOString(),
    clock_out_time: null,
    duration_minutes: 0,
    status: 'active',
    notes: 'private note',
    ...overrides
  };
  db.time_sessions = [s, ...db.time_sessions];
  return s;
}

const stored = (id: string) => db.time_sessions.find(s => s.id === id)!;

function patchUser(email: string, patch: Record<string, unknown>) {
  const id = userByEmail(email).id;
  db.users = db.users.map(u => (u.id === id ? { ...u, ...patch } : u));
}

describe('floor time tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setNow(NOW);
    resetDb();
    db.time_sessions = [];
  });
  afterEach(() => vi.useRealTimers());

  describe('POST /time-tracking/clock-in', () => {
    it('opens a session on an entitled floor', async () => {
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send({ category: 'Zumba & Cardio', notes: 'Evening dance' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        user_id: userByEmail(personas.member).id,
        category: 'Zumba & Cardio',
        status: 'active',
        clock_out_time: null,
        clock_in_time: NOW.toISOString(),
        notes: 'Evening dance'
      });
      expect(db.time_sessions).toHaveLength(1);
    });

    it('requires a token', async () => {
      const res = await api().post('/api/time-tracking/clock-in').send({ category: 'Zumba & Cardio' });
      expect(res.status).toBe(401);
    });

    it.each([
      [{}],
      [{ category: 'Yoga' }],
      [{ category: 'Zumba & Cardio', sessionId: 'x' }],
      [{ category: 'Zumba & Cardio', notes: 'x'.repeat(501) }]
    ])('rejects an invalid body %j', async body => {
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('refuses an expired member (regression: clock-in ignored membership)', async () => {
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.expired)).send({ category: 'Workout & Strength' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_INACTIVE');
      expect(res.body.data.status).toBe('expired');
      expect(db.time_sessions).toHaveLength(0);
    });

    it('treats a stored "active" membership past its expiry as inactive', async () => {
      patchUser(personas.basic, { membership_status: 'active', membership_expiry: '2026-10-06' });
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.basic)).send({ category: 'Workout & Strength' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_INACTIVE');
    });

    it.each(['frozen', 'pending'])('refuses a %s member', async status => {
      patchUser(personas.basic, { membership_status: status });
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.basic)).send({ category: 'Workout & Strength' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_INACTIVE');
      expect(res.body.data.status).toBe(status);
    });

    it('refuses a floor the plan does not include', async () => {
      const basic = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.basic)).send({ category: 'Zumba & Cardio' });
      expect(basic.status).toBe(403);
      expect(basic.body.code).toBe('PLAN_EXCLUDES_CATEGORY');

      const pro = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send({ category: 'Workout & Strength' });
      expect(pro.status).toBe(403);
      expect(pro.body.code).toBe('PLAN_EXCLUDES_CATEGORY');
    });

    it('reads entitlements from the plan catalogue', async () => {
      db.membership_plans = db.membership_plans.map(p => (p.tier === 'basic' ? { ...p, categories: [] } : p));
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.basic)).send({ category: 'Zumba & Cardio' });
      expect(res.status).toBe(201);
    });

    it('lets a VIP use either floor', async () => {
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.vip)).send({ category: 'Workout & Strength' });
      expect(res.status).toBe(201);
    });

    it('lets staff clock in whatever their membership', async () => {
      patchUser(personas.trainer, { membership_status: 'expired', membership_tier: 'none' });
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.trainer)).send({ category: 'Zumba & Cardio' });
      expect(res.status).toBe(201);
    });

    it('answers 409 ALREADY_CLOCKED_IN for a second session', async () => {
      await api().post('/api/time-tracking/clock-in').set(authHeader(personas.vip)).send({ category: 'Workout & Strength' }).expect(201);
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.vip)).send({ category: 'Zumba & Cardio' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_CLOCKED_IN');
      expect(db.time_sessions).toHaveLength(1);
    });

    it('closes a session left open 4 hours instead of blocking a new clock-in', async () => {
      const stale = openSession(personas.vip, { clock_in_time: new Date(NOW.getTime() - 5 * HOUR).toISOString() });
      const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.vip)).send({ category: 'Zumba & Cardio' });
      expect(res.status).toBe(201);
      expect(stored(stale.id)).toMatchObject({
        status: 'completed',
        auto_closed: true,
        duration_minutes: 240,
        clock_out_time: new Date(NOW.getTime() - HOUR).toISOString()
      });
    });
  });

  describe('POST /time-tracking/clock-out', () => {
    it('closes the caller\'s own session, records the duration and counts the streak', async () => {
      const s = openSession(personas.vip, { clock_in_time: NOW.toISOString() });
      setNow(NOW.getTime() + 47 * 60_000);
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({ notes: 'Good one' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: s.id, status: 'completed', duration_minutes: 47, notes: 'Good one' });
      expect(stored(s.id).status).toBe('completed');
      expect(userByEmail(personas.vip).last_active_date).toBe('2026-10-07');
    });

    it('answers 404 NO_ACTIVE_SESSION when there is nothing to close', async () => {
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({});
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_ACTIVE_SESSION');
    });

    it('requires a token and a valid body', async () => {
      expect((await api().post('/api/time-tracking/clock-out').send({})).status).toBe(401);
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({ sessionId: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('does not let a member clock out someone else\'s session (regression)', async () => {
      const other = openSession(personas.vip);
      const before = userByEmail(personas.member);
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.member)).send({ session_id: other.id });
      expect(res.status).toBe(403);
      expect(stored(other.id).status).toBe('active');
      expect(userByEmail(personas.member).streak_days).toBe(before.streak_days);
      expect(userByEmail(personas.member).last_active_date).toBe(before.last_active_date);
    });

    it('lets a member name their own session id', async () => {
      const own = openSession(personas.vip);
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({ session_id: own.id });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(own.id);
    });

    it('lets an admin close a member\'s session and credits the streak to the owner', async () => {
      const other = openSession(personas.vip);
      const admin = userByEmail(personas.admin);
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.admin)).send({ session_id: other.id });
      expect(res.status).toBe(200);
      expect(stored(other.id).status).toBe('completed');
      expect(userByEmail(personas.vip).last_active_date).toBe('2026-10-07');
      expect(userByEmail(personas.admin).streak_days).toBe(admin.streak_days);
      expect(userByEmail(personas.admin).last_active_date).toBe(admin.last_active_date);
    });

    it('closes only the caller\'s session even when another member is on the floor', async () => {
      const other = openSession(personas.basic);
      const own = openSession(personas.vip);
      await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({}).expect(200);
      expect(stored(own.id).status).toBe('completed');
      expect(stored(other.id).status).toBe('active');
    });

    it('does not let a trainer clock out a member session', async () => {
      const other = openSession(personas.vip);
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.trainer)).send({ session_id: other.id });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(stored(other.id).status).toBe('active');
    });

    it('answers 404 NO_ACTIVE_SESSION for an unknown or already closed session id', async () => {
      openSession(personas.vip);
      const unknown = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({ session_id: 'ses_missing' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('NO_ACTIVE_SESSION');
      const closed = openSession(personas.basic, { status: 'completed', clock_out_time: NOW.toISOString(), duration_minutes: 30 });
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.admin)).send({ session_id: closed.id });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_ACTIVE_SESSION');
    });

    it('finds nothing to close once a forgotten session has been auto-closed', async () => {
      const s = openSession(personas.vip, { clock_in_time: new Date(NOW.getTime() - 6 * HOUR).toISOString() });
      const res = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({});
      expect(res.status).toBe(404);
      expect(stored(s.id)).toMatchObject({ status: 'completed', auto_closed: true, duration_minutes: 240 });
    });
  });

  describe('streak credit for sessions closed late', () => {
    // Monday 10-05 was the member's last counted day; on Tuesday 10-06 at 21:00 they clocked in
    // and never clocked out. "Today" is Wednesday 10-07, 10:00.
    const TUESDAY_9PM = '2026-10-06T15:30:00.000Z';

    function activeMonday(email: string, streak: number) {
      const user = userByEmail(email);
      openSession(email, {
        clock_in_time: '2026-10-05T12:30:00.000Z',
        clock_out_time: '2026-10-05T13:30:00.000Z',
        duration_minutes: 60,
        status: 'completed'
      });
      db.attendance_logs = db.attendance_logs.filter(l => l.user_id !== user.id);
      db.bookings = db.bookings.filter(b => b.user_id !== user.id);
      db.workouts = db.workouts.filter(w => w.user_id !== user.id);
      patchUser(email, { streak_days: streak, last_active_date: '2026-10-05' });
      return openSession(email, { clock_in_time: TUESDAY_9PM });
    }

    it('credits an auto-closed session to its owner on the day they clocked in', async () => {
      const s = activeMonday(personas.vip, 4);
      await api().get('/api/time-tracking/my-stats').set(authHeader(personas.vip)).expect(200);
      expect(stored(s.id)).toMatchObject({ status: 'completed', auto_closed: true });
      expect(userByEmail(personas.vip)).toMatchObject({ streak_days: 5, last_active_date: '2026-10-06' });
    });

    it('closes a forgotten session before a workout for today is counted (regression: streak reset)', async () => {
      const s = activeMonday(personas.vip, 4);
      const workout = { title: 'Legs', date: '2026-10-07', duration_minutes: 40, sets: [{ exercise_id: 'ex_barbell_squat', set_number: 1, weight_kg: 60, reps: 5 }] };
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(workout).expect(201);
      expect(stored(s.id)).toMatchObject({ status: 'completed', auto_closed: true });
      expect(userByEmail(personas.vip)).toMatchObject({ streak_days: 6, last_active_date: '2026-10-07' });
    });

    it('rebuilds the run from history when a later check-in was counted before the auto-close (regression)', async () => {
      activeMonday(personas.vip, 1);
      const user = userByEmail(personas.vip);
      // What a turnstile check-in in another part of the API does: log it and count today.
      db.attendance_logs = [...db.attendance_logs, { id: 'att_test', user_id: user.id, check_in_time: NOW.toISOString(), check_in_method: 'qr' }];
      recordActivity(user.id, '2026-10-07');
      expect(userByEmail(personas.vip).streak_days).toBe(1);

      await api().get('/api/time-tracking/active-floor').expect(200);
      expect(userByEmail(personas.vip)).toMatchObject({ streak_days: 3, last_active_date: '2026-10-07' });
    });

    it('rebuilds the run when a session is clocked out after midnight following a workout', async () => {
      activeMonday(personas.vip, 1);
      db.time_sessions = db.time_sessions.map(x => (x.clock_in_time === TUESDAY_9PM ? { ...x, clock_in_time: '2026-10-06T16:00:00.000Z' } : x)); // 21:30
      setNow('2026-10-06T18:40:00.000Z'); // 00:10 Wednesday at the gym
      const workout = { title: 'Late', date: '2026-10-07', duration_minutes: 20, sets: [{ exercise_id: 'ex_pullup', set_number: 1, weight_kg: 0, reps: 8 }] };
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(workout).expect(201);
      expect(userByEmail(personas.vip).streak_days).toBe(1);

      setNow('2026-10-06T19:10:00.000Z'); // 00:40
      await api().post('/api/time-tracking/clock-out').set(authHeader(personas.vip)).send({}).expect(200);
      expect(userByEmail(personas.vip)).toMatchObject({ streak_days: 3, last_active_date: '2026-10-07' });
    });

    it('never lowers a streak when the late day does not bridge anything', async () => {
      const s = activeMonday(personas.vip, 1);
      patchUser(personas.vip, { streak_days: 9, last_active_date: '2026-10-07' });
      await api().get('/api/time-tracking/active-floor').expect(200);
      expect(stored(s.id).status).toBe('completed');
      expect(userByEmail(personas.vip)).toMatchObject({ streak_days: 9, last_active_date: '2026-10-07' });
    });
  });

  describe('GET /time-tracking/active-floor', () => {
    beforeEach(() => {
      openSession(personas.vip, { category: 'Workout & Strength' });
      openSession(personas.basic, { category: 'Workout & Strength' });
      openSession(personas.member, { category: 'Zumba & Cardio' });
    });

    it('gives the public counts only (regression: leaked names, emails and notes)', async () => {
      const res = await api().get('/api/time-tracking/active-floor');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ totalActive: 3, workoutActive: 2, zumbaActive: 1 });
      expect(JSON.stringify(res.body)).not.toMatch(/@|private note|ses_/);
    });

    it('gives a member counts only', async () => {
      const res = await api().get('/api/time-tracking/active-floor').set(authHeader(personas.member));
      expect(res.body.data).toEqual({ totalActive: 3, workoutActive: 2, zumbaActive: 1 });
    });

    it('treats an invalid token as anonymous', async () => {
      const res = await api().get('/api/time-tracking/active-floor').set({ Authorization: 'Bearer nope' });
      expect(res.status).toBe(200);
      expect(res.body.data.workoutUsers).toBeUndefined();
    });

    it.each([personas.admin, personas.trainer])('lists who is on the floor for staff (%s), without emails, notes or ids', async email => {
      const res = await api().get('/api/time-tracking/active-floor').set(authHeader(email));
      expect(res.status).toBe(200);
      expect(res.body.data.workoutUsers).toHaveLength(2);
      expect(res.body.data.zumbaUsers).toHaveLength(1);
      for (const person of [...res.body.data.workoutUsers, ...res.body.data.zumbaUsers]) {
        expect(Object.keys(person).sort()).toEqual(['clock_in_time', 'duration_minutes', 'user_avatar', 'user_name', 'user_tier']);
        expect(person.duration_minutes).toBe(30);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/@|private note|ses_/);
    });

    it('auto-closes sessions open 4 hours or more before counting', async () => {
      const stale = openSession(userByEmail(personas.trainer).email, { clock_in_time: new Date(NOW.getTime() - 4 * HOUR).toISOString() });
      const res = await api().get('/api/time-tracking/active-floor');
      expect(res.body.data.totalActive).toBe(3);
      expect(stored(stale.id)).toMatchObject({ status: 'completed', auto_closed: true, duration_minutes: 240 });
    });
  });

  describe('GET /time-tracking/my-stats', () => {
    it('reports the live session as a copy without changing the stored one (regression)', async () => {
      const s = openSession(personas.vip, { clock_in_time: new Date(NOW.getTime() - 20 * 60_000).toISOString() });
      const res = await api().get('/api/time-tracking/my-stats').set(authHeader(personas.vip));
      expect(res.status).toBe(200);
      expect(res.body.data.activeSession).toMatchObject({ id: s.id, duration_minutes: 20 });
      expect(stored(s.id).duration_minutes).toBe(0);
    });

    it('sums completed minutes for this gym week and month', async () => {
      const done = (clockIn: string, minutes: number): Partial<TimeSession> => ({
        status: 'completed',
        clock_in_time: clockIn,
        clock_out_time: new Date(Date.parse(clockIn) + minutes * 60_000).toISOString(),
        duration_minutes: minutes
      });
      openSession(personas.vip, done('2026-10-05T01:00:00.000Z', 60)); // Mon this week
      openSession(personas.vip, done('2026-10-04T19:00:00.000Z', 15)); // 00:30 IST Mon: this week, though UTC says Sunday
      openSession(personas.vip, done('2026-10-02T12:00:00.000Z', 45)); // Fri last week, this month
      openSession(personas.vip, done('2026-09-30T12:00:00.000Z', 30)); // last month
      openSession(personas.basic, done('2026-10-06T12:00:00.000Z', 99)); // someone else

      const res = await api().get('/api/time-tracking/my-stats').set(authHeader(personas.vip));
      expect(res.body.data).toMatchObject({
        activeSession: null,
        totalTimeMinutesThisWeek: 75,
        totalTimeMinutesThisMonth: 120,
        totalSessionsCompleted: 4
      });
      expect(res.body.data.recentSessions.map((s: TimeSession) => s.duration_minutes)).toEqual([60, 15, 45, 30]);
    });

    it('counts a forgotten session as auto-closed at 4 hours', async () => {
      openSession(personas.vip, { clock_in_time: new Date(NOW.getTime() - 9 * HOUR).toISOString() });
      const res = await api().get('/api/time-tracking/my-stats').set(authHeader(personas.vip));
      expect(res.body.data.activeSession).toBeNull();
      expect(res.body.data.totalTimeMinutesThisWeek).toBe(240);
      expect(res.body.data.recentSessions[0].auto_closed).toBe(true);
    });

    it('requires a token', async () => {
      expect((await api().get('/api/time-tracking/my-stats')).status).toBe(401);
    });
  });
});
