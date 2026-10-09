import { Router } from 'express';
import { getExercises, getExerciseById, getWorkouts, getWorkoutById, createWorkout, deleteWorkout, getWorkoutAnalytics } from '../controllers/workoutController.js';
import { clockIn, clockOut, getActiveFloorStatus, getMyTimeTrackingStats } from '../controllers/timeTrackingController.js';
import { getDashboardKPIs } from '../controllers/analyticsController.js';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js';

// Owner: workouts & exercises, floor time tracking and admin analytics.
const router = Router();

router.get('/exercises', getExercises);
router.get('/exercises/:id', getExerciseById);

router.get('/workouts', authenticate, getWorkouts);
router.get('/workouts/analytics', authenticate, getWorkoutAnalytics);
router.get('/workouts/:id', authenticate, getWorkoutById);
router.post('/workouts', authenticate, createWorkout);
router.delete('/workouts/:id', authenticate, deleteWorkout);

router.post('/time-tracking/clock-in', authenticate, clockIn);
router.post('/time-tracking/clock-out', authenticate, clockOut);
// Public counts; staff (admin/trainer) with a token also get who is on the floor.
router.get('/time-tracking/active-floor', optionalAuth, getActiveFloorStatus);
router.get('/time-tracking/my-stats', authenticate, getMyTimeTrackingStats);

router.get('/analytics/dashboard', authenticate, requireRole(['admin']), getDashboardKPIs);

export default router;
