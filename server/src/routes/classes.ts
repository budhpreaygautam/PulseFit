import { Router } from 'express';
import { getClasses, getClassById, createClass, updateClass, deleteClass } from '../controllers/classController.js';
import { getMyBookings, createBooking, cancelBooking, getClassRoster } from '../controllers/bookingController.js';
import { getTrainers, getTrainerById, createTrainer, updateTrainer, deleteTrainer } from '../controllers/trainerController.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

// Owner: classes, bookings, trainers and the trainer portal.
const router = Router();

router.get('/classes', optionalAuth, getClasses);
router.get('/classes/:id', optionalAuth, getClassById);
router.post('/classes', authenticate, requireRole(['admin']), createClass);
router.put('/classes/:id', authenticate, requireRole(['admin']), updateClass);
router.delete('/classes/:id', authenticate, requireRole(['admin']), deleteClass);

router.get('/bookings/my', authenticate, getMyBookings);
router.post('/bookings', authenticate, createBooking);
router.delete('/bookings/:id', authenticate, cancelBooking);
router.get('/bookings/class/:classId/roster', authenticate, requireRole(['admin', 'trainer']), getClassRoster);

router.get('/trainers', getTrainers);
router.get('/trainers/:id', getTrainerById);
router.post('/trainers', authenticate, requireRole(['admin']), createTrainer);
router.put('/trainers/:id', authenticate, requireRole(['admin']), updateTrainer);
router.delete('/trainers/:id', authenticate, requireRole(['admin']), deleteTrainer);

export default router;
