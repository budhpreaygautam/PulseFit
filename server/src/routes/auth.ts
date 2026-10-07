import { Router } from 'express';
import { login, register, firebaseSync, demoLogin, getMe, updateProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

// Owner: auth & account security.
const router = Router();

router.post('/auth/login', login);
router.post('/auth/register', register);
router.post('/auth/firebase-sync', firebaseSync);
router.post('/auth/demo-login', demoLogin);
router.get('/auth/me', authenticate, getMe);
router.put('/auth/profile', authenticate, updateProfile);

export default router;
