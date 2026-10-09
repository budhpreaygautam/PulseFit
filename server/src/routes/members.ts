import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config.js';
import {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  resetMemberPassword
} from '../controllers/memberController.js';
import { checkIn, getAttendanceLogs, getMyAttendance } from '../controllers/attendanceController.js';
import { createTrial, listTrials } from '../controllers/trialController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Owner: member administration, turnstile check-in, attendance and free trials.
const router = Router();

const trialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Read on every request so the flag can be flipped at runtime (tests turn it on).
  skip: () => !config.rateLimit.enabled,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many free trial requests from this network. Please try again in an hour.',
      code: 'RATE_LIMITED'
    });
  }
});

const admin = [authenticate, requireRole(['admin'])];

router.get('/members', ...admin, getMembers);
router.post('/members', ...admin, createMember);
router.get('/members/:id', ...admin, getMemberById);
router.put('/members/:id', ...admin, updateMember);
router.delete('/members/:id', ...admin, deleteMember);
router.post('/members/:id/reset-password', ...admin, resetMemberPassword);

router.post('/attendance/check-in', authenticate, requireRole(['admin', 'trainer']), checkIn);
router.get('/attendance/logs', ...admin, getAttendanceLogs);
router.get('/attendance/my', authenticate, getMyAttendance);

router.post('/trials', trialLimiter, createTrial);
router.get('/trials', ...admin, listTrials);

export default router;
