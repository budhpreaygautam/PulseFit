import { Request, Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, forbidden, notFound, ok, parse } from '../lib/http.js';
import { newId } from '../lib/users.js';
import { addDays, gymToday, isValidDate } from '../lib/dates.js';
import { recordActivity } from '../lib/streak.js';
import { Exercise, Workout, WorkoutSet } from '../types/index.js';

const EXERCISE_CATEGORIES: Exercise['category'][] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Full Body'];

/** Training volume: Σ weight × reps of the working (non-warmup) sets, to 2 decimals. */
export function workoutVolume(sets: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'is_warmup'>[]): number {
  const total = sets.reduce((sum, s) => (s.is_warmup ? sum : sum + s.weight_kg * s.reps), 0);
  return Math.round(total * 100) / 100;
}

const exerciseQuerySchema = z.object({
  category: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  difficulty: z.string().trim().optional(),
  search: z.string().trim().optional()
});

const setSchema = z.object({
  exercise_id: z.string().trim().min(1, 'Choose an exercise.'),
  set_number: z.number().int().min(1).max(50),
  weight_kg: z.number().min(0).max(500),
  reps: z.number().int().min(1).max(100),
  rpe: z.number().min(1).max(10).optional(),
  is_warmup: z.boolean().optional()
}).strict();

// Built per request: the allowed date window moves with "today" at the gym.
function workoutSchema(today: string) {
  const earliest = addDays(today, -365);
  return z.object({
    title: z.string().trim().min(1, 'Give the workout a title.').max(100),
    date: z.string()
      .refine(isValidDate, { error: 'Use a YYYY-MM-DD date.', abort: true })
      .refine(d => d <= today, 'A workout cannot be logged for a future date.')
      .refine(d => d >= earliest, 'A workout cannot be logged more than 365 days back.'),
    duration_minutes: z.number().int().min(1).max(300),
    notes: z.string().trim().max(1000).optional(),
    sets: z.array(setSchema).min(1, 'Add at least one set.').max(100)
  }).strict().superRefine((body, ctx) => {
    body.sets.forEach((s, i) => {
      if (!db.exercises.some(e => e.id === s.exercise_id)) {
        ctx.addIssue({ code: 'custom', path: ['sets', i, 'exercise_id'], message: 'Unknown exercise.' });
      }
    });
  });
}

function matches(value: string, filter: string | undefined): boolean {
  return !filter || filter.toLowerCase() === 'all' || value.toLowerCase() === filter.toLowerCase();
}

export const getExercises = asyncHandler((req: Request, res: Response) => {
  const q = parse(exerciseQuerySchema, req.query);
  const search = q.search?.toLowerCase();
  const list = db.exercises.filter(e =>
    matches(e.category, q.category) &&
    matches(e.equipment, q.equipment) &&
    matches(e.difficulty, q.difficulty) &&
    (!search || e.name.toLowerCase().includes(search) || e.target_muscles.some(m => m.toLowerCase().includes(search)))
  );
  return ok(res, list);
});

export const getExerciseById = asyncHandler((req: Request, res: Response) => {
  const exercise = db.exercises.find(e => e.id === req.params.id);
  if (!exercise) throw notFound('That exercise does not exist.');
  return ok(res, exercise);
});

const newestFirst = (a: Workout, b: Workout) =>
  b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || '');

export const getWorkouts = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const userId = req.user!.id;
  return ok(res, db.workouts.filter(w => w.user_id === userId).sort(newestFirst));
});

/** The workout if the caller owns it or is an admin; 404 / 403 otherwise. */
function findOwnWorkout(req: AuthenticatedRequest): Workout {
  const workout = db.workouts.find(w => w.id === req.params.id);
  if (!workout) throw notFound('That workout does not exist.');
  if (workout.user_id !== req.user!.id && req.user!.role !== 'admin') {
    throw forbidden('That workout belongs to someone else.');
  }
  return workout;
}

export const getWorkoutById = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  return ok(res, findOwnWorkout(req));
});

export const createWorkout = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  const today = gymToday();
  const body = parse(workoutSchema(today), req.body);

  const workoutId = newId('wk');
  const sets: WorkoutSet[] = body.sets.map(s => ({
    id: newId('set'),
    workout_id: workoutId,
    exercise_id: s.exercise_id,
    exercise_name: db.exercises.find(e => e.id === s.exercise_id)!.name,
    set_number: s.set_number,
    weight_kg: s.weight_kg,
    reps: s.reps,
    ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
    is_warmup: s.is_warmup ?? false
  }));

  const workout: Workout = {
    id: workoutId,
    user_id: user.id,
    title: body.title,
    date: body.date,
    duration_minutes: body.duration_minutes,
    notes: body.notes ?? '',
    total_volume_kg: workoutVolume(sets),
    created_at: new Date().toISOString(),
    sets
  };
  db.workouts = [workout, ...db.workouts];

  // Only a workout logged for today extends the streak; back-dated logs do not rewrite it.
  if (body.date === today) recordActivity(user.id, today);

  return ok(res, workout, 'Workout saved.', 201);
});

export const deleteWorkout = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const workout = findOwnWorkout(req);
  db.workouts = db.workouts.filter(w => w.id !== workout.id);
  return ok(res, { deleted: true }, 'Workout deleted.');
});

export const getWorkoutAnalytics = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const userId = req.user!.id;
  const workouts = db.workouts
    .filter(w => w.user_id === userId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at || '').localeCompare(b.created_at || ''));

  const volumeTimeline = workouts.map(w => ({
    date: w.date,
    volumeKg: w.total_volume_kg ?? workoutVolume(w.sets || []),
    durationMinutes: w.duration_minutes,
    title: w.title
  }));

  // Best estimated one-rep max per exercise (Epley: weight × (1 + reps / 30)) over working sets.
  const records = new Map<string, { exerciseId: string; exerciseName: string; e1rm: number; date: string; weight: number; reps: number }>();
  const muscleHits = new Map<string, number>(EXERCISE_CATEGORIES.map(c => [c, 0]));

  for (const w of workouts) {
    for (const s of w.sets || []) {
      if (s.is_warmup) continue;
      const exercise = db.exercises.find(e => e.id === s.exercise_id);
      if (exercise) muscleHits.set(exercise.category, (muscleHits.get(exercise.category) || 0) + 1);
      if (s.weight_kg <= 0) continue;
      const e1rm = Math.round(s.weight_kg * (1 + s.reps / 30) * 10) / 10;
      const best = records.get(s.exercise_id);
      if (!best || e1rm > best.e1rm) {
        records.set(s.exercise_id, {
          exerciseId: s.exercise_id,
          exerciseName: exercise?.name || s.exercise_name || s.exercise_id,
          e1rm,
          date: w.date,
          weight: s.weight_kg,
          reps: s.reps
        });
      }
    }
  }

  const totalDuration = workouts.reduce((sum, w) => sum + w.duration_minutes, 0);
  return ok(res, {
    totalWorkouts: workouts.length,
    totalVolumeKg: Math.round(volumeTimeline.reduce((sum, p) => sum + p.volumeKg, 0) * 100) / 100,
    avgDurationMinutes: workouts.length ? Math.round(totalDuration / workouts.length) : 0,
    volumeTimeline,
    personalRecords: [...records.values()].sort((a, b) => b.e1rm - a.e1rm),
    muscleDistribution: [...muscleHits].map(([category, count]) => ({ category, count }))
  });
});
