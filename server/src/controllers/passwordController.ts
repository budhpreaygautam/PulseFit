import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import config from '../config.js';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError, asyncHandler, badRequest, ok, parse, unauthorized } from '../lib/http.js';
import { findUserByEmail, newId } from '../lib/users.js';
import { BCRYPT_ROUNDS, emailSchema, newPasswordSchema, session } from './authController.js';
import { User } from '../types/index.js';

const RESET_TTL_MS = 30 * 60_000;
const FORGOT_MESSAGE = 'If an account exists for that email, a password reset link has been created. It is valid for 30 minutes.';

const changePasswordSchema = z.object({
  currentPassword: z.string().max(1000).optional(),
  newPassword: newPasswordSchema
});

const forgotPasswordSchema = z.object({ email: emailSchema });

const resetPasswordSchema = z.object({
  token: z.string({ error: 'The reset link is incomplete.' }).min(1, 'The reset link is incomplete.').max(200),
  newPassword: newPasswordSchema
});

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Store the new password and bump token_version, which revokes every token issued before.
 * Outstanding reset links for the account stop working too.
 */
async function setPassword(user: User, newPassword: string): Promise<User> {
  const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const fresh = db.users.find(u => u.id === user.id) ?? user;
  const updated: User = { ...fresh, password_hash, token_version: (fresh.token_version || 0) + 1 };
  db.users = db.users.map(u => (u.id === updated.id ? updated : u));

  const now = new Date().toISOString();
  if (db.password_resets.some(r => r.user_id === user.id && !r.used_at)) {
    db.password_resets = db.password_resets.map(r => (r.user_id === user.id && !r.used_at ? { ...r, used_at: now } : r));
  }
  return updated;
}

export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) throw unauthorized();

  // Accounts created through Google have no password yet and may set one without it.
  if (user.password_hash) {
    if (!currentPassword) {
      throw badRequest('currentPassword: Enter your current password.', 'VALIDATION_ERROR', {
        issues: [{ path: 'currentPassword', message: 'Enter your current password.' }]
      });
    }
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw badRequest('Your current password is incorrect.', 'WRONG_PASSWORD');
    }
  }

  const updated = await setPassword(user, newPassword);
  return ok(res, session(updated), 'Password changed. You have been signed out on your other devices.');
});

function resetOrigin(req: Request): string {
  const origin = req.get('origin');
  if (origin && config.corsOrigins.includes(origin)) return origin;
  return config.corsOrigins[0] ?? '';
}

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const user = findUserByEmail(email);
  if (!user) return ok(res, { message: FORGOT_MESSAGE });

  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  // Only the newest link works; requesting another one retires the earlier ones.
  db.password_resets = [
    ...db.password_resets.map(r => (r.user_id === user.id && !r.used_at ? { ...r, used_at: now.toISOString() } : r)),
    {
      id: newId('pwr'),
      user_id: user.id,
      token_hash: sha256(token),
      expires_at: new Date(now.getTime() + RESET_TTL_MS).toISOString(),
      created_at: now.toISOString()
    }
  ];

  // There is no email delivery, so the link is only ever shown where that is safe.
  if (!(config.demoMode || !config.isProduction)) return ok(res, { message: FORGOT_MESSAGE });

  const resetUrl = `${resetOrigin(req)}/reset-password?token=${token}`;
  if (!config.isTest) console.log(`🔑 Password reset link for ${user.email}: ${resetUrl}`);
  return ok(res, { message: FORGOT_MESSAGE, resetUrl });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = parse(resetPasswordSchema, req.body);
  const tokenHash = sha256(token);
  const now = Date.now();

  const reset = db.password_resets.find(r => r.token_hash === tokenHash);
  const user = reset && db.users.find(u => u.id === reset.user_id);
  if (!reset || !user || reset.used_at || Date.parse(reset.expires_at) <= now) {
    throw new ApiError(400, 'This reset link is invalid or has expired. Please request a new one.', 'INVALID_RESET_TOKEN');
  }

  // Mark it used before the (async) hashing so the same link cannot be redeemed twice.
  db.password_resets = db.password_resets.map(r => (r.id === reset.id ? { ...r, used_at: new Date(now).toISOString() } : r));

  const updated = await setPassword(user, newPassword);
  return ok(res, session(updated), 'Your password has been reset.');
});
