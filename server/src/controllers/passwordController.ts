import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import config from '../config.js';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError, asyncHandler, badRequest, ok, parse, unauthorized } from '../lib/http.js';
import { findUserByEmail, newId } from '../lib/users.js';
import { BCRYPT_ROUNDS, DEMO_PERSONAS, emailSchema, newPasswordSchema, retireResetLinks, session } from './authController.js';
import { User } from '../types/index.js';

const RESET_TTL_MS = 30 * 60_000;
const FORGOT_MESSAGE = 'If an account exists for that email, a password reset link has been created. It is valid for 30 minutes.';
// Production has no email delivery: the link only reaches the server log, where staff can hand it out.
const FORGOT_MESSAGE_STAFF =
  'If an account exists for that email, a password reset link has been created. It is valid for 30 minutes; please ask the front desk for it.';

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

  retireResetLinks(user.id);
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

/**
 * Whether the response itself may carry the reset link. In local development it is the developer's
 * shortcut. A public demo (production + DEMO_MODE) shows it only for the shared demo personas, which
 * anyone can enter through demo-login anyway; every real account there goes through staff instead.
 */
function mayShowResetLink(email: string): boolean {
  if (config.isLocal) return true;
  return config.demoMode && (Object.values(DEMO_PERSONAS) as string[]).includes(email);
}

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  // Depends only on the server mode, never on whether the account exists.
  const message = config.isLocal ? FORGOT_MESSAGE : FORGOT_MESSAGE_STAFF;
  const user = findUserByEmail(email);
  if (!user) return ok(res, { message });

  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  // Only the newest link works; requesting another one retires the earlier ones.
  retireResetLinks(user.id, now.toISOString());
  db.password_resets = [
    ...db.password_resets,
    {
      id: newId('pwr'),
      user_id: user.id,
      token_hash: sha256(token),
      expires_at: new Date(now.getTime() + RESET_TTL_MS).toISOString(),
      created_at: now.toISOString()
    }
  ];

  const resetUrl = `${resetOrigin(req)}/reset-password?token=${token}`;
  // Always logged, in production too: with no email delivery the console is how staff get the link.
  console.log(`🔑 Password reset link for ${user.email} (valid 30 minutes): ${resetUrl}`);

  return ok(res, mayShowResetLink(user.email) ? { message, resetUrl } : { message });
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
