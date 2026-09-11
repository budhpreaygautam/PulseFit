import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Workout, WorkoutSet } from '../types/index.js';

export const getExercises = async (req: Request, res: Response) => {
  try {
    const { category, equipment, difficulty, search } = req.query;
    let list = [...db.exercises];

    if (category && category !== 'All') {
      list = list.filter(e => e.category.toLowerCase() === (category as string).toLowerCase());
    }

    if (equipment && equipment !== 'All') {
      list = list.filter(e => e.equipment.toLowerCase() === (equipment as string).toLowerCase());
    }

    if (difficulty && difficulty !== 'All') {
      list = list.filter(e => e.difficulty.toLowerCase() === (difficulty as string).toLowerCase());
    }

    if (search) {
      const q = (search as string).toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.target_muscles.some(m => m.toLowerCase().includes(q))
      );
    }

    res.json({
      success: true,
      data: list
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getExerciseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ex = db.exercises.find(e => e.id === id);
    if (!ex) {
      return res.status(404).json({ success: false, error: 'Exercise not found' });
    }
    res.json({ success: true, data: ex });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getWorkouts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const workouts = db.workouts
      .filter(w => w.user_id === req.user!.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      success: true,
      data: workouts
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getWorkoutById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const workout = db.workouts.find(w => w.id === id && (w.user_id === req.user!.id || req.user!.role === 'admin'));

    if (!workout) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }

    res.json({
      success: true,
      data: workout
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createWorkout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { title, date, duration_minutes = 60, notes, sets = [] } = req.body;
    if (!title || !date) {
      return res.status(400).json({ success: false, error: 'Title and date are required' });
    }

    const workoutId = `wk_${uuidv4().substring(0, 8)}`;

    // Calculate total volume (sum of non-warmup sets: weight_kg * reps)
    let totalVolume = 0;
    const formattedSets: WorkoutSet[] = sets.map((s: any, idx: number) => {
      const weight = Number(s.weight_kg) || 0;
      const reps = Number(s.reps) || 0;
      if (!s.is_warmup) {
        totalVolume += weight * reps;
      }
      const ex = db.exercises.find(e => e.id === s.exercise_id);
      return {
        id: uuidv4(),
        workout_id: workoutId,
        exercise_id: s.exercise_id,
        exercise_name: ex ? ex.name : (s.exercise_name || 'Exercise'),
        set_number: idx + 1,
        weight_kg: weight,
        reps,
        rpe: s.rpe ? Number(s.rpe) : 8,
        is_warmup: !!s.is_warmup
      };
    });

    const newWorkout: Workout = {
      id: workoutId,
      user_id: req.user.id,
      title,
      date,
      duration_minutes: Number(duration_minutes),
      notes: notes || '',
      total_volume_kg: Math.round(totalVolume),
      created_at: new Date().toISOString(),
      sets: formattedSets
    };

    db.workouts = [newWorkout, ...db.workouts];

    // Update user streak if logged for today
    const todayStr = new Date().toISOString().split('T')[0];
    if (date === todayStr) {
      db.users = db.users.map(u => {
        if (u.id === req.user!.id) {
          return { ...u, streak_days: (u.streak_days || 0) + 1 };
        }
        return u;
      });
    }

    res.status(201).json({
      success: true,
      data: newWorkout
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteWorkout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const existing = db.workouts.find(w => w.id === id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Workout not found' });
    }

    if (existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete this workout' });
    }

    db.workouts = db.workouts.filter(w => w.id !== id);

    res.json({
      success: true,
      message: 'Workout deleted successfully'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getWorkoutAnalytics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const userWorkouts = db.workouts.filter(w => w.user_id === req.user!.id);

    // 1. Volume history by date
    const volumeTimeline = userWorkouts
      .map(w => ({
        date: w.date,
        volumeKg: w.total_volume_kg || 0,
        durationMinutes: w.duration_minutes,
        title: w.title
      }))
      .reverse();

    // 2. Estimated 1RM for big lifts (Epley formula: weight * (1 + reps/30))
    const e1rmRecords: Record<string, { exerciseName: string; e1rm: number; date: string; weight: number; reps: number }> = {};

    userWorkouts.forEach(w => {
      (w.sets || []).forEach(s => {
        if (!s.is_warmup && s.weight_kg > 0 && s.reps > 0) {
          const calculated1RM = Math.round(s.weight_kg * (1 + s.reps / 30));
          const current = e1rmRecords[s.exercise_id];
          if (!current || calculated1RM > current.e1rm) {
            e1rmRecords[s.exercise_id] = {
              exerciseName: s.exercise_name || s.exercise_id,
              e1rm: calculated1RM,
              date: w.date,
              weight: s.weight_kg,
              reps: s.reps
            };
          }
        }
      });
    });

    // 3. Muscle category frequency
    const muscleHits: Record<string, number> = {
      Chest: 0,
      Back: 0,
      Legs: 0,
      Shoulders: 0,
      Arms: 0,
      Core: 0
    };

    userWorkouts.forEach(w => {
      (w.sets || []).forEach(s => {
        const ex = db.exercises.find(e => e.id === s.exercise_id);
        if (ex && muscleHits[ex.category] !== undefined) {
          muscleHits[ex.category] += 1;
        }
      });
    });

    const muscleDistribution = Object.entries(muscleHits).map(([category, count]) => ({
      category,
      count
    }));

    res.json({
      success: true,
      data: {
        totalWorkouts: userWorkouts.length,
        totalVolumeKg: userWorkouts.reduce((sum, w) => sum + (w.total_volume_kg || 0), 0),
        avgDurationMinutes: userWorkouts.length ? Math.round(userWorkouts.reduce((sum, w) => sum + w.duration_minutes, 0) / userWorkouts.length) : 0,
        volumeTimeline,
        e1rmRecords: Object.values(e1rmRecords),
        muscleDistribution
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
