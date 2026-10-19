import { Router } from 'express';
import { login, logout, register, googleSignIn, demoLogin, getMe, updateProfile } from '../controllers/authController.js';
import { changePassword, forgotPassword, resetPassword } from '../controllers/passwordController.js';
import { disableMfa, enableMfa, getMfaStatus, regenerateRecoveryCodes, setupMfa, verifyMfaSignIn } from '../controllers/mfaController.js';
import { authenticate } from '../middleware/auth.js';
import {
  changePasswordLimiter,
  demoLoginLimiter,
  forgotPasswordLimiter,
  googleLimiter,
  loginAccountLimiter,
  loginLimiter,
  mfaSetupLimiter,
  mfaVerifyLimiter,
  registerLimiter,
  resetPasswordLimiter
} from '../lib/authRateLimits.js';

// Owner: auth & account security.
const router = Router();

router.post('/auth/login', loginLimiter, loginAccountLimiter, login);
router.post('/auth/register', registerLimiter, register);
router.post('/auth/google', googleLimiter, googleSignIn);
router.post('/auth/demo-login', demoLoginLimiter, demoLogin);
router.post('/auth/logout', logout);
router.get('/auth/me', authenticate, getMe);
router.put('/auth/profile', authenticate, updateProfile);
router.put('/auth/password', authenticate, changePasswordLimiter, changePassword);
router.post('/auth/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/auth/reset-password', resetPasswordLimiter, resetPassword);

router.post('/auth/mfa/verify', mfaVerifyLimiter, verifyMfaSignIn);
router.get('/auth/mfa', authenticate, getMfaStatus);
router.post('/auth/mfa/setup', authenticate, mfaSetupLimiter, setupMfa);
router.post('/auth/mfa/enable', authenticate, mfaSetupLimiter, enableMfa);
router.post('/auth/mfa/disable', authenticate, mfaSetupLimiter, disableMfa);
router.post('/auth/mfa/recovery-codes', authenticate, mfaSetupLimiter, regenerateRecoveryCodes);

export default router;
