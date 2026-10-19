import { Router } from 'express';
import { getPlans, updatePlan } from '../controllers/planController.js';
import {
  confirmYoupiPayment,
  createOrder,
  getMyPayments,
  getPayments,
  paymentWebhook,
  verifyPayment,
  youpiWebhook
} from '../controllers/paymentController.js';
import { freezeMembership, unfreezeMembership } from '../controllers/membershipController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Owner: plans, payments and the membership lifecycle.
const router = Router();

router.get('/plans', getPlans);
router.put('/plans/:id', authenticate, requireRole(['admin']), updatePlan);

router.post('/payment/create-order', authenticate, createOrder);
router.post('/payment/verify', authenticate, verifyPayment);
// Called by Razorpay, authenticated by its HMAC signature instead of a user token.
router.post('/payment/webhook', paymentWebhook);
// YouPI (self-hosted UPI gateway): the member's page asks for the status; YouPI posts signed webhooks.
router.post('/payment/youpi/confirm', authenticate, confirmYoupiPayment);
router.post('/payment/youpi/webhook', youpiWebhook);

router.get('/payments/my', authenticate, getMyPayments);
router.get('/payments', authenticate, requireRole(['admin']), getPayments);

router.post('/membership/freeze', authenticate, freezeMembership);
router.post('/membership/unfreeze', authenticate, unfreezeMembership);

export default router;
