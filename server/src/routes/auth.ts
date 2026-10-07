import { Router } from 'express';
import { login, register, googleSignIn, demoLogin, getMe, updateProfile } from '../controllers/authController.js';
import { changePassword, forgotPassword, resetPassword } from '../controllers/passwordController.js';
import { authenticate } from '../middleware/auth.js';
import { forgotPasswordLimiter, googleLimiter, loginLimiter, registerLimiter } from '../lib/authRateLimits.js';

// Owner: auth & account security.
const router = Router();

router.post('/auth/login', loginLimiter, login);
router.post('/auth/register', registerLimiter, register);
router.post('/auth/google', googleLimiter, googleSignIn);
router.post('/auth/demo-login', demoLogin);
router.get('/auth/me', authenticate, getMe);
router.put('/auth/profile', authenticate, updateProfile);
router.put('/auth/password', authenticate, changePassword);
router.post('/auth/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/auth/reset-password', resetPassword);

export default router;
