import { Router } from 'express';
import { deactivateIdCard, getIdCards, getMyIdCard, issueIdCard, reactivateIdCard } from '../controllers/idCardController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Owner: physical ID cards. Admins issue, deactivate and reactivate them; anyone signed in can
// see their own. Mounted on the shared /api router, so middleware is attached per route.
const router = Router();
const admin = [authenticate, requireRole(['admin'])];

// Registered before every /id-cards/:cardId route, so 'mine' is never taken for a card id.
router.get('/id-cards/mine', authenticate, getMyIdCard);
router.get('/id-cards', ...admin, getIdCards);
router.post('/members/:id/id-cards', ...admin, issueIdCard);
router.post('/id-cards/:cardId/deactivate', ...admin, deactivateIdCard);
router.post('/id-cards/:cardId/reactivate', ...admin, reactivateIdCard);

export default router;
