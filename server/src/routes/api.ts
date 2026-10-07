import { Router } from 'express';
import config, { googleSignInEnabled, paymentsEnabled } from '../config.js';
import { notFoundHandler } from '../middleware/errorHandler.js';
import authRoutes from './auth.js';
import paymentRoutes from './payments.js';
import classRoutes from './classes.js';
import memberRoutes from './members.js';
import activityRoutes from './activity.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// What the client needs to know about this deployment before rendering anything.
router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      demoMode: config.demoMode,
      googleClientId: googleSignInEnabled() ? config.googleClientId : null,
      payments: { enabled: paymentsEnabled(), keyId: paymentsEnabled() ? config.razorpay.keyId : null },
      gym: { name: 'PulseFit Athletics', timezone: config.gymTimezone, currency: 'INR' }
    }
  });
});

router.use(authRoutes);
router.use(paymentRoutes);
router.use(classRoutes);
router.use(memberRoutes);
router.use(activityRoutes);

router.use(notFoundHandler);

export default router;
