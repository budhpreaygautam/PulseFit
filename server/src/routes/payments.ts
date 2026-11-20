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
import {
  createCoupon,
  createOffer,
  getPromotions,
  getQuote,
  getQuotes,
  listCoupons,
  listOffers,
  updateCoupon,
  updateOffer
} from '../controllers/offerController.js';
import { freezeMembership, unfreezeMembership } from '../controllers/membershipController.js';
import { couponLimiter } from '../lib/authRateLimits.js';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js';

// Owner: plans, payments, offers and coupons, and the membership lifecycle.
const router = Router();
const admin = [authenticate, requireRole(['admin'])];

// Guests get the home page's trimmed catalogue (see getPlans).
router.get('/plans', optionalAuth, getPlans);
router.put('/plans/:id', authenticate, requireRole(['admin']), updatePlan);

// Prices come only from lib/pricing. Failed coupon codes are rate-limited per account.
router.post('/payment/quote', authenticate, couponLimiter, getQuote);
router.get('/payment/quotes', authenticate, getQuotes);
// The only offer data guests get: live sales' headlines and the joining gifts' names.
router.get('/promotions', getPromotions);
router.get('/offers', ...admin, listOffers);
router.post('/offers', ...admin, createOffer);
router.put('/offers/:id', ...admin, updateOffer);
router.get('/coupons', ...admin, listCoupons);
router.post('/coupons', ...admin, createCoupon);
router.put('/coupons/:code', ...admin, updateCoupon);

router.post('/payment/create-order', authenticate, couponLimiter, createOrder);
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
