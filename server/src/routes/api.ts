import { Router } from 'express';
import config, { googleSignInEnabled, paymentProvider } from '../config.js';
import { notFoundHandler } from '../middleware/errorHandler.js';
import { publicOpeningHours } from '../lib/hours.js';
import { GYM } from '../lib/seo.js';
import { androidAppInfo } from '../lib/androidApp.js';
import authRoutes from './auth.js';
import paymentRoutes from './payments.js';
import classRoutes from './classes.js';
import memberRoutes from './members.js';
import idCardRoutes from './idCards.js';
import activityRoutes from './activity.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// What the client needs to know about this deployment before rendering anything.
router.get('/config', (_req, res) => {
  const provider = paymentProvider();
  res.json({
    success: true,
    data: {
      demoMode: config.demoMode,
      googleClientId: googleSignInEnabled() ? config.googleClientId : null,
      payments: { enabled: provider !== null, provider, keyId: provider === 'razorpay' ? config.razorpay.keyId : null },
      gym: { name: GYM.name, timezone: config.gymTimezone, currency: 'INR', hours: publicOpeningHours() },
      // The Android app the website offers for download, or null while there is none.
      androidApp: androidAppInfo()
    }
  });
});

router.use(authRoutes);
router.use(paymentRoutes);
router.use(classRoutes);
router.use(memberRoutes);
router.use(idCardRoutes);
router.use(activityRoutes);

router.use(notFoundHandler);

export default router;
