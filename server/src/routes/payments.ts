import { Router } from 'express';
import { getPlans } from '../controllers/planController.js';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

// Owner: plans, payments and the membership lifecycle.
const router = Router();

router.get('/plans', getPlans);
router.post('/payment/create-order', authenticate, createOrder);
router.post('/payment/verify', authenticate, verifyPayment);

export default router;
