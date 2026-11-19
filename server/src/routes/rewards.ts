import { Router } from 'express';
import {
  adjustPoints,
  attachReferrer,
  claimGift,
  createGift,
  deleteGift,
  getGifts,
  getMyLedger,
  getMyRewards,
  getRewardSettings,
  listClaims,
  updateClaim,
  updateGift,
  updateRewardSettings
} from '../controllers/rewardsController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Owner: rewards (points, gifts and claims). Mounted on the shared /api router, so middleware is
// attached per route.
const router = Router();
const admin = [authenticate, requireRole(['admin'])];
const member = [authenticate, requireRole(['member'])];

router.get('/rewards/me', ...member, getMyRewards);
router.get('/rewards/ledger', ...member, getMyLedger);
router.get('/rewards/gifts', authenticate, getGifts);
router.post('/rewards/gifts', ...admin, createGift);
router.put('/rewards/gifts/:id', ...admin, updateGift);
router.delete('/rewards/gifts/:id', ...admin, deleteGift);
router.get('/rewards/claims', ...admin, listClaims);
router.post('/rewards/claims', ...member, claimGift);
// Members pick sizes and cancel, staff hand over; updateClaim checks who may do what.
router.patch('/rewards/claims/:id', authenticate, updateClaim);
router.get('/rewards/settings', ...admin, getRewardSettings);
router.put('/rewards/settings', ...admin, updateRewardSettings);
router.post('/members/:id/points', ...admin, adjustPoints);
router.post('/members/:id/referrer', ...admin, attachReferrer);

export default router;
