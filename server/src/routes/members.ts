import { Router } from 'express';
import { getMembers, getMemberById, createMember, updateMember, deleteMember, checkInMember, getAttendanceLogs } from '../controllers/memberController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Owner: member administration, turnstile check-in, attendance and free trials.
const router = Router();

router.get('/members', authenticate, requireRole(['admin']), getMembers);
router.get('/members/:id', authenticate, requireRole(['admin']), getMemberById);
router.post('/members', authenticate, requireRole(['admin']), createMember);
router.put('/members/:id', authenticate, requireRole(['admin']), updateMember);
router.delete('/members/:id', authenticate, requireRole(['admin']), deleteMember);

router.post('/attendance/check-in', authenticate, requireRole(['admin']), checkInMember);
router.get('/attendance/logs', authenticate, requireRole(['admin']), getAttendanceLogs);

export default router;
