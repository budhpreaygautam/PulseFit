import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import config from '../config.js';
import db from '../db/database.js';
import { AuthenticatedRequest, sessionIssuedAt, userFromMfaToken } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, ok, parse, unauthorized } from '../lib/http.js';
import { toSafeUser } from '../lib/users.js';
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyCode
} from '../lib/totp.js';
import { DEMO_ACCOUNT_LOCKED_MESSAGE, isLockedDemoAccount, session } from './authController.js';
import { User } from '../types/index.js';

// Optional authenticator-app MFA (docs/API.md, "Multi-factor authentication").

const RECENT_SIGN_IN_MS = 15 * 60_000;

const codeSchema = z
  .string({ error: 'Enter the 6-digit code from your authenticator app, or a backup code.' })
  .trim()
  .min(6, 'Enter the 6-digit code from your authenticator app, or a backup code.')
  .max(20, 'That code is too long.');

const setupSchema = z.object({ password: z.string().max(1000).optional() });
const enableSchema = z.object({ code: codeSchema });
const disableSchema = z.object({ code: codeSchema, password: z.string().max(1000).optional() });
const verifySchema = z.object({
  mfa_token: z.string({ error: 'This sign-in has expired. Please sign in again.' }).min(1).max(2000),
  code: codeSchema
});

function save(user: User): User {
  db.users = db.users.map(u => (u.id === user.id ? user : u));
  return user;
}

const current = (req: AuthenticatedRequest): User => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) throw unauthorized();
  return user;
};

/**
 * Changing MFA needs proof beyond the session: the password, or for accounts without one
 * (Google sign-in) a sign-in in the last 15 minutes. A stolen session alone cannot turn MFA on
 * (locking the owner out) or off.
 */
async function requireStepUp(req: Request, user: User, password: string | undefined): Promise<void> {
  if (user.password_hash) {
    if (!password) {
      throw badRequest('password: Enter your password.', 'VALIDATION_ERROR', { issues: [{ path: 'password', message: 'Enter your password.' }] });
    }
    if (!(await bcrypt.compare(password, user.password_hash))) throw badRequest('Your password is incorrect.', 'WRONG_PASSWORD');
    return;
  }
  const issuedAt = sessionIssuedAt(req);
  if (!issuedAt || Date.now() - issuedAt > RECENT_SIGN_IN_MS) {
    throw forbidden('For your security, sign out and sign in again, then try this within 15 minutes.', 'REAUTH_REQUIRED');
  }
}

/** The user after accepting an authenticator or backup code, or null when the code is wrong. */
function acceptSecondFactor(user: User, code: string): User | null {
  if (!user.mfa_enabled || !user.mfa_secret) return null;
  const digits = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(digits)) {
    const step = verifyCode(user.mfa_secret, digits, user.mfa_last_step ?? -1);
    return step === null ? null : { ...user, mfa_last_step: step };
  }
  const hash = hashRecoveryCode(code);
  const codes = user.mfa_recovery_codes ?? [];
  if (!codes.includes(hash)) return null;
  return { ...user, mfa_recovery_codes: codes.filter(c => c !== hash) };
}

const wrongCode = () => badRequest('That code is not right. Check the time on your phone and try a new code.', 'INVALID_MFA_CODE');

export const getMfaStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = current(req);
  return ok(res, { enabled: Boolean(user.mfa_enabled), recovery_codes_left: user.mfa_recovery_codes?.length ?? 0 });
});

export const setupMfa = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { password } = parse(setupSchema, req.body);
  const user = current(req);
  if (isLockedDemoAccount(user.email)) throw forbidden(DEMO_ACCOUNT_LOCKED_MESSAGE, 'DEMO_ACCOUNT_LOCKED');
  if (user.mfa_enabled) throw conflict('Two-step sign-in is already on.', 'MFA_ALREADY_ENABLED');
  await requireStepUp(req, user, password);

  const secret = generateSecret();
  save({ ...user, mfa_pending_secret: secret });
  return ok(res, { secret, otpauth_url: otpauthUrl(secret, user.email, 'PulseFit') });
});

export const enableMfa = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code } = parse(enableSchema, req.body);
  const user = current(req);
  if (user.mfa_enabled) throw conflict('Two-step sign-in is already on.', 'MFA_ALREADY_ENABLED');
  if (!user.mfa_pending_secret) throw badRequest('Start the set-up again to get a new QR code.', 'MFA_SETUP_REQUIRED');
  const step = verifyCode(user.mfa_pending_secret, code.replace(/\s/g, ''));
  if (step === null) throw wrongCode();

  const { codes, hashes } = generateRecoveryCodes();
  const { mfa_pending_secret, ...rest } = user;
  // Other devices are signed out: from now on every sign-in needs the second step.
  const updated = save({
    ...rest,
    mfa_enabled: true,
    mfa_secret: mfa_pending_secret,
    mfa_recovery_codes: hashes,
    mfa_last_step: step,
    token_version: (user.token_version || 0) + 1
  });
  return ok(
    res,
    { ...session(req, res, updated), recovery_codes: codes },
    'Two-step sign-in is on. Keep your backup codes somewhere safe: each works once if you lose your phone.'
  );
});

export const disableMfa = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code, password } = parse(disableSchema, req.body);
  const user = current(req);
  if (!user.mfa_enabled) throw conflict('Two-step sign-in is already off.', 'MFA_NOT_ENABLED');
  await requireStepUp(req, user, password);
  if (!acceptSecondFactor(user, code)) throw wrongCode();

  const { mfa_secret, mfa_pending_secret, mfa_recovery_codes, mfa_last_step, ...rest } = user;
  const updated = save({ ...rest, mfa_enabled: false });
  return ok(res, toSafeUser(updated), 'Two-step sign-in is off.');
});

export const regenerateRecoveryCodes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code } = parse(enableSchema, req.body);
  const user = current(req);
  if (!user.mfa_enabled) throw conflict('Turn on two-step sign-in first.', 'MFA_NOT_ENABLED');
  const accepted = acceptSecondFactor(user, code);
  if (!accepted) throw wrongCode();
  const { codes, hashes } = generateRecoveryCodes();
  save({ ...accepted, mfa_recovery_codes: hashes });
  return ok(res, { recovery_codes: codes }, 'New backup codes are ready. The old ones no longer work.');
});

/** Second step of a sign-in: the mfa_token from POST /auth/login or /auth/google, plus a code. */
export const verifyMfaSignIn = asyncHandler(async (req: Request, res: Response) => {
  const { mfa_token, code } = parse(verifySchema, req.body);
  const user = userFromMfaToken(mfa_token);
  if (!user) throw unauthorized('This sign-in has expired. Please sign in again.', 'MFA_TOKEN_EXPIRED');
  const accepted = acceptSecondFactor(user, code);
  if (!accepted) throw wrongCode();
  const updated = save(accepted);
  const left = updated.mfa_recovery_codes?.length ?? 0;
  const usedBackup = left < (user.mfa_recovery_codes?.length ?? 0);
  return ok(
    res,
    session(req, res, updated),
    usedBackup ? `You signed in with a backup code. ${left} left: create new ones in My account if you are running low.` : undefined
  );
});

/** Admin: turn MFA off for someone who lost their phone and backup codes. Signs them out everywhere. */
export const adminResetMfa = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) throw notFound('Member not found.');
  if (!user.mfa_enabled) throw conflict('Two-step sign-in is already off for this person.', 'MFA_NOT_ENABLED');
  const { mfa_secret, mfa_pending_secret, mfa_recovery_codes, mfa_last_step, ...rest } = user;
  const updated = save({ ...rest, mfa_enabled: false, token_version: (user.token_version || 0) + 1 });
  if (!config.isTest) console.log(`🔐 Two-step sign-in turned off for user ${updated.id} by admin ${req.user!.id}.`);
  return ok(res, toSafeUser(updated), `Two-step sign-in is off for ${updated.name}. They have been signed out everywhere.`);
});
