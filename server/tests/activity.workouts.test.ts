import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

// Wednesday 2026-10-07, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00.000Z');
const TODAY = '2026-10-07';

const validWorkout = (overrides: Record<string, unknown> = {}) => ({
  title: 'Push day',
  date: TODAY,
  duration_minutes: 50,
  notes: 'Felt good',
  sets: [
    { exercise_id: 'ex_bench_press', set_number: 1, weight_kg: 40, reps: 10, is_warmup: true },
    { exercise_id: 'ex_bench_press', set_number: 2, weight_kg: 80, reps: 8, rpe: 8 },
    { exercise_id: 'ex_tricep_rope_pushdown', set_number: 1, weight_kg: 25, reps: 12, rpe: 7.5 },
    { exercise_id: 'ex_bench_press', set_number: 3, weight_kg: 82.5, reps: 5 }
  ],
  ...overrides
});

const LIFTS = ['ex_deadlift', 'ex_bench_press', 'ex_tricep_rope_pushdown'];

const set = (patch: Record<string, unknown>) => validWorkout({ sets: [{ exercise_id: 'ex_bench_press', set_number: 1, weight_kg: 50, reps: 5, ...patch }] });

describe('workouts & exercises', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('exercises', () => {
    it('lists and filters the catalogue', async () => {
      const all = await api().get('/api/exercises');
      expect(all.status).toBe(200);
      expect(all.body.data.length).toBe(db.exercises.length);

      const chest = await api().get('/api/exercises?category=chest');
      expect(chest.body.data.length).toBeGreaterThan(0);
      expect(chest.body.data.every((e: any) => e.category === 'Chest')).toBe(true);

      const allCategory = await api().get('/api/exercises?category=All&equipment=Barbell');
      expect(allCategory.body.data.every((e: any) => e.equipment === 'Barbell')).toBe(true);

      const search = await api().get('/api/exercises?search=squat');
      expect(search.body.data.map((e: any) => e.id)).toContain('ex_barbell_squat');

      const muscle = await api().get('/api/exercises?search=triceps');
      expect(muscle.body.data.length).toBeGreaterThan(0);
    });

    it('returns one exercise or 404', async () => {
      expect((await api().get('/api/exercises/ex_deadlift')).body.data.id).toBe('ex_deadlift');
      const missing = await api().get('/api/exercises/ex_nope');
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /workouts', () => {
    it('saves a workout with per-exercise set numbers kept and volume from working sets', async () => {
      const res = await api().post('/api/workouts').set(authHeader(personas.member)).send(validWorkout());
      expect(res.status).toBe(201);
      const w = res.body.data;
      expect(w).toMatchObject({ user_id: userByEmail(personas.member).id, title: 'Push day', date: TODAY, duration_minutes: 50, notes: 'Felt good' });
      // 80*8 + 25*12 + 82.5*5; the warm-up set is excluded.
      expect(w.total_volume_kg).toBe(1352.5);
      expect(w.sets.map((s: any) => s.set_number)).toEqual([1, 2, 1, 3]);
      expect(w.sets[0]).toMatchObject({ exercise_name: 'Barbell Flat Bench Press', is_warmup: true, workout_id: w.id });
      expect(w.sets[1].rpe).toBe(8);
      expect(w.sets[0].rpe).toBeUndefined();
      expect(db.workouts.find(x => x.id === w.id)).toBeTruthy();
    });

    it('counts a workout logged for today towards the streak', async () => {
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout()).expect(201);
      expect(userByEmail(personas.vip).last_active_date).toBe(TODAY);
    });

    it('does not count a back-dated workout towards the streak', async () => {
      const before = userByEmail(personas.vip);
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ date: '2026-10-01' })).expect(201);
      expect(userByEmail(personas.vip).streak_days).toBe(before.streak_days);
      expect(userByEmail(personas.vip).last_active_date).toBe(before.last_active_date);
    });

    it('uses the gym date for "today" just after midnight IST (regression: UTC date)', async () => {
      vi.setSystemTime(new Date('2026-10-07T19:00:00.000Z')); // 00:30 on 8 Oct at the gym
      const res = await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ date: '2026-10-08' }));
      expect(res.status).toBe(201);
      expect(userByEmail(personas.vip).last_active_date).toBe('2026-10-08');
    });

    it('accepts the oldest allowed date and rejects one day earlier', async () => {
      expect((await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ date: '2025-10-07' }))).status).toBe(201);
      expect((await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ date: '2025-10-06' }))).status).toBe(400);
    });

    it('requires a token', async () => {
      expect((await api().post('/api/workouts').send(validWorkout())).status).toBe(401);
    });

    it.each([
      ['missing title', validWorkout({ title: undefined })],
      ['blank title', validWorkout({ title: '   ' })],
      ['title over 100', validWorkout({ title: 'x'.repeat(101) })],
      ['future date', validWorkout({ date: '2026-10-08' })],
      ['bad date format', validWorkout({ date: '07/10/2026' })],
      ['impossible date', validWorkout({ date: '2026-02-30' })],
      ['zero duration', validWorkout({ duration_minutes: 0 })],
      ['duration over 300', validWorkout({ duration_minutes: 301 })],
      ['string duration', validWorkout({ duration_minutes: '50' })],
      ['notes over 1000', validWorkout({ notes: 'x'.repeat(1001) })],
      ['sets not an array (regression: 500)', validWorkout({ sets: 'lots' })],
      ['no sets', validWorkout({ sets: [] })],
      ['101 sets', validWorkout({ sets: Array.from({ length: 101 }, (_, i) => ({ exercise_id: LIFTS[i % 3], set_number: Math.floor(i / 3) + 1, weight_kg: 100, reps: 5 })) })],
      ['unknown key', validWorkout({ user_id: 'usr_admin_1' })],
      ['negative weight (regression)', set({ weight_kg: -20 })],
      ['weight over 500', set({ weight_kg: 501 })],
      ['zero reps (regression)', set({ reps: 0 })],
      ['fractional reps', set({ reps: 5.5 })],
      ['reps over 100', set({ reps: 101 })],
      ['set_number 0', set({ set_number: 0 })],
      ['set_number 51', set({ set_number: 51 })],
      ['rpe 11', set({ rpe: 11 })],
      ['rpe 0', set({ rpe: 0 })],
      ['unknown key on a set', set({ exercise_name: 'Bench' })],
      ['missing exercise_id', set({ exercise_id: undefined })]
    ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body) => {
      const before = db.workouts.length;
      const res = await api().post('/api/workouts').set(authHeader(personas.member)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.data.issues)).toBe(true);
      expect(db.workouts.length).toBe(before);
    });

    it('rejects a set number repeated for the same exercise, naming the set', async () => {
      const body = validWorkout();
      body.sets[3] = { ...body.sets[3], set_number: 2 };
      const before = db.workouts.length;
      const res = await api().post('/api/workouts').set(authHeader(personas.member)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.data.issues.map((i: any) => i.path)).toEqual(['sets.3.set_number']);
      expect(db.workouts.length).toBe(before);
    });

    it('allows the same set number on different exercises', async () => {
      const res = await api().post('/api/workouts').set(authHeader(personas.member)).send(validWorkout({
        sets: [
          { exercise_id: 'ex_bench_press', set_number: 1, weight_kg: 60, reps: 8 },
          { exercise_id: 'ex_deadlift', set_number: 1, weight_kg: 120, reps: 5 }
        ]
      }));
      expect(res.status).toBe(201);
    });

    it('rejects an exercise that does not exist, naming the set', async () => {
      const res = await api().post('/api/workouts').set(authHeader(personas.member)).send(set({ exercise_id: 'ex_made_up' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.data.issues[0].path).toBe('sets.0.exercise_id');
    });
  });

  describe('reading and deleting', () => {
    let aaravWorkout: string;
    beforeEach(() => {
      aaravWorkout = db.workouts.find(w => w.user_id === userByEmail(personas.member).id)!.id;
    });

    it('lists only the caller\'s workouts, newest first', async () => {
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ date: '2026-09-30', title: 'Older' })).expect(201);
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ title: 'Newest' })).expect(201);
      const res = await api().get('/api/workouts').set(authHeader(personas.vip));
      expect(res.status).toBe(200);
      expect(res.body.data.map((w: any) => w.title)).toEqual(['Newest', 'Older']);

      const mine = await api().get('/api/workouts').set(authHeader(personas.member));
      const dates = mine.body.data.map((w: any) => w.date);
      expect(dates).toEqual([...dates].sort().reverse());
      expect(mine.body.data.every((w: any) => w.user_id === userByEmail(personas.member).id)).toBe(true);
    });

    it('returns a workout to its owner and to an admin, 403 to anyone else, 404 when missing', async () => {
      expect((await api().get(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.member))).status).toBe(200);
      expect((await api().get(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.admin))).status).toBe(200);
      const other = await api().get(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.vip));
      expect(other.status).toBe(403);
      expect(other.body.code).toBe('FORBIDDEN');
      expect((await api().get(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.trainer))).status).toBe(403);
      expect((await api().get('/api/workouts/wk_missing').set(authHeader(personas.member))).status).toBe(404);
      expect((await api().get(`/api/workouts/${aaravWorkout}`)).status).toBe(401);
    });

    it('deletes only the owner\'s workout (or as admin)', async () => {
      const forbiddenRes = await api().delete(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.vip));
      expect(forbiddenRes.status).toBe(403);
      expect(db.workouts.some(w => w.id === aaravWorkout)).toBe(true);

      const res = await api().delete(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.member));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });
      expect(db.workouts.some(w => w.id === aaravWorkout)).toBe(false);
      expect((await api().delete(`/api/workouts/${aaravWorkout}`).set(authHeader(personas.member))).status).toBe(404);

      const another = db.workouts.find(w => w.user_id === userByEmail(personas.member).id)!.id;
      expect((await api().delete(`/api/workouts/${another}`).set(authHeader(personas.admin))).status).toBe(200);
    });
  });

  describe('GET /workouts/analytics', () => {
    it('summarises the caller\'s workouts', async () => {
      db.workouts = db.workouts.filter(w => w.user_id !== userByEmail(personas.vip).id);
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({ date: '2026-10-01', duration_minutes: 40 })).expect(201);
      await api().post('/api/workouts').set(authHeader(personas.vip)).send(validWorkout({
        duration_minutes: 61,
        sets: [{ exercise_id: 'ex_bench_press', set_number: 1, weight_kg: 90, reps: 3 }, { exercise_id: 'ex_pullup', set_number: 1, weight_kg: 0, reps: 10 }]
      })).expect(201);

      const res = await api().get('/api/workouts/analytics').set(authHeader(personas.vip));
      expect(res.status).toBe(200);
      const a = res.body.data;
      expect(a.totalWorkouts).toBe(2);
      expect(a.totalVolumeKg).toBe(1352.5 + 270);
      expect(a.avgDurationMinutes).toBe(51);
      expect(a.volumeTimeline.map((p: any) => p.date)).toEqual(['2026-10-01', TODAY]);
      // Bench: best of 80x8 (101.3), 82.5x5 (96.3), 90x3 (99) -> 80x8.
      const bench = a.personalRecords.find((r: any) => r.exerciseId === 'ex_bench_press');
      expect(bench).toMatchObject({ e1rm: 101.3, weight: 80, reps: 8, date: '2026-10-01', exerciseName: 'Barbell Flat Bench Press' });
      // Bodyweight sets have no 1RM.
      expect(a.personalRecords.some((r: any) => r.exerciseId === 'ex_pullup')).toBe(false);
      const chest = a.muscleDistribution.find((m: any) => m.category === 'Chest');
      expect(chest.count).toBe(3); // working bench sets only
      expect(a.muscleDistribution.find((m: any) => m.category === 'Back').count).toBe(1);
    });

    it('returns zeros for someone with no workouts', async () => {
      const res = await api().get('/api/workouts/analytics').set(authHeader(personas.trainer));
      expect(res.body.data).toMatchObject({ totalWorkouts: 0, totalVolumeKg: 0, avgDurationMinutes: 0, volumeTimeline: [], personalRecords: [] });
    });

    it('requires a token', async () => {
      expect((await api().get('/api/workouts/analytics')).status).toBe(401);
    });
  });
});
