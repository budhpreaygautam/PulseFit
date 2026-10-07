import { Router } from 'express';
import { getClasses, getClassById, createClass, updateClass, deleteClass } from '../controllers/classController.js';
import { getMyBookings, createBooking, cancelBooking, markAttendance, getClassRoster } from '../controllers/bookingController.js';
import { getTrainers, getTrainerById, createTrainer, updateTrainer, deleteTrainer } from '../controllers/trainerController.js';
import {
  getTrainerMe,
  getTrainerClients,
  getTrainerNotes,
  createTrainerNote,
  deleteTrainerNote,
  getMyNotes
} from '../controllers/trainerPortalController.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

// Owner: classes, bookings, trainers and the trainer portal.
// This router is mounted on the shared /api router, so middleware is attached per route,
// never with router.use (that would run for every other domain's routes too).
const router = Router();
const staff = [authenticate, requireRole(['admin', 'trainer'])];
const admin = [authenticate, requireRole(['admin'])];

router.get('/classes', optionalAuth, getClasses);
router.get('/classes/:id', optionalAuth, getClassById);
router.post('/classes', ...admin, createClass);
router.put('/classes/:id', ...admin, updateClass);
router.delete('/classes/:id', ...admin, deleteClass);

router.get('/bookings/my', authenticate, getMyBookings);
router.post('/bookings', authenticate, createBooking);
router.delete('/bookings/:id', authenticate, cancelBooking);
router.patch('/bookings/:id/attendance', ...staff, markAttendance);
router.get('/bookings/class/:classId/roster', ...staff, getClassRoster);

router.get('/trainers', getTrainers);
router.get('/trainers/:id', optionalAuth, getTrainerById);
router.post('/trainers', ...admin, createTrainer);
router.put('/trainers/:id', ...admin, updateTrainer);
router.delete('/trainers/:id', ...admin, deleteTrainer);

router.get('/trainer/me', ...staff, getTrainerMe);
router.get('/trainer/clients', ...staff, getTrainerClients);
router.get('/trainer/notes', ...staff, getTrainerNotes);
router.post('/trainer/notes', ...staff, createTrainerNote);
router.delete('/trainer/notes/:id', ...staff, deleteTrainerNote);
router.get('/notes/my', authenticate, getMyNotes);

export default router;
