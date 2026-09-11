import { Router } from 'express';
import { login, register, demoLogin, firebaseSync, getMe, updateProfile, getPlans } from '../controllers/authController.js';
import { getClasses, getClassById, createClass, updateClass, deleteClass } from '../controllers/classController.js';
import { getMyBookings, createBooking, cancelBooking, getClassRoster } from '../controllers/bookingController.js';
import { getExercises, getExerciseById, getWorkouts, getWorkoutById, createWorkout, deleteWorkout, getWorkoutAnalytics } from '../controllers/workoutController.js';
import { getMembers, getMemberById, createMember, updateMember, deleteMember, checkInMember, getAttendanceLogs } from '../controllers/memberController.js';
import { getTrainers, getTrainerById, createTrainer, updateTrainer, deleteTrainer } from '../controllers/trainerController.js';
import { getDashboardKPIs } from '../controllers/analyticsController.js';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// --- Auth & Profile ---
router.post('/auth/login', login);
router.post('/auth/register', register);
router.post('/auth/firebase-sync', firebaseSync);
router.post('/auth/demo-login', demoLogin);
router.get('/auth/me', authenticate, getMe);
router.put('/auth/profile', authenticate, updateProfile);
router.get('/plans', getPlans);

// --- Payment Routes ---
router.post('/payment/create-order', authenticate, createOrder);
router.post('/payment/verify', authenticate, verifyPayment);

// --- Classes ---
router.get('/classes', optionalAuth, getClasses);
router.get('/classes/:id', optionalAuth, getClassById);
router.post('/classes', authenticate, requireRole(['admin']), createClass);
router.put('/classes/:id', authenticate, requireRole(['admin']), updateClass);
router.delete('/classes/:id', authenticate, requireRole(['admin']), deleteClass);

// --- Bookings ---
router.get('/bookings/my', authenticate, getMyBookings);
router.post('/bookings', authenticate, createBooking);
router.delete('/bookings/:id', authenticate, cancelBooking);
router.get('/bookings/class/:classId/roster', authenticate, requireRole(['admin', 'trainer']), getClassRoster);

// --- Workouts & Exercises ---
router.get('/exercises', getExercises);
router.get('/exercises/:id', getExerciseById);

// --- Workouts ---
router.get('/workouts', authenticate, getWorkouts);
router.get('/workouts/analytics', authenticate, getWorkoutAnalytics);
router.get('/workouts/:id', authenticate, getWorkoutById);
router.post('/workouts', authenticate, createWorkout);
router.delete('/workouts/:id', authenticate, deleteWorkout);

// --- Trainers ---
router.get('/trainers', getTrainers);
router.get('/trainers/:id', getTrainerById);
router.post('/trainers', authenticate, requireRole(['admin']), createTrainer);
router.put('/trainers/:id', authenticate, requireRole(['admin']), updateTrainer);
router.delete('/trainers/:id', authenticate, requireRole(['admin']), deleteTrainer);

// --- Members & Attendance ---
router.get('/members', authenticate, requireRole(['admin']), getMembers);
router.get('/members/:id', authenticate, requireRole(['admin']), getMemberById);
router.post('/members', authenticate, requireRole(['admin']), createMember);
router.put('/members/:id', authenticate, requireRole(['admin']), updateMember);
router.delete('/members/:id', authenticate, requireRole(['admin']), deleteMember);
router.post('/attendance/check-in', authenticate, requireRole(['admin']), checkInMember);
router.get('/attendance/logs', authenticate, requireRole(['admin']), getAttendanceLogs);

// --- Admin Analytics ---
router.get('/analytics/dashboard', authenticate, requireRole(['admin']), getDashboardKPIs);

export default router;
