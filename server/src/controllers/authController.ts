import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import config, { googleSignInEnabled } from '../config.js';
import db from '../db/database.js';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError, asyncHandler, conflict, notFound, ok, parse, unauthorized, unavailable } from '../lib/http.js';
import { defaultAvatar, findUserByEmail, generateQrToken, newId, toSafeUser } from '../lib/users.js';
import { InvalidGoogleTokenError, verifyGoogleCredential } from '../lib/google.js';
import { User } from '../types/index.js';

export const BCRYPT_ROUNDS = 10;

// A real cost-10 hash of a throwaway string. Unknown emails are compared against it so a
// failed sign-in takes as long whether or not the account exists.
const DUMMY_HASH = '$2a$10$C9adwVDYgOx0myGVXHzRK.y/vwed0byodrWpO2tY9J4.A7bvk01AC';

export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }));

export const newPasswordSchema = z
  .string({ error: 'Enter a password.' })
  .min(8, 'Use at least 8 characters for your password.')
  .max(72, 'Use at most 72 characters for your password.')
  // bcrypt ignores everything after 72 bytes, so accented or non-Latin characters must count by byte.
  .refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Your password is too long. Use fewer or simpler characters.')
  .regex(/[A-Za-z]/, 'Your password needs at least one letter.')
  .regex(/\d/, 'Your password needs at least one digit.');

const nameSchema = z
  .string({ error: 'Enter your name.' })
  .trim()
  .min(2, 'Your name needs at least 2 characters.')
  .max(60, 'Your name can be at most 60 characters.');

const phoneSchema = z
  .string()
  .trim()
  .max(20, 'Enter a valid phone number.')
  .refine(v => v === '' || /^\+?[0-9][0-9\s()-]{6,19}$/.test(v), 'Enter a valid phone number, for example +91 98110 12345.');

const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const avatarSchema = z
  .string()
  .max(350_000, 'The profile photo is too large. Please choose a smaller image.')
  .refine(v => {
    if (v.startsWith('data:')) return AVATAR_DATA_URL.test(v);
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'The profile photo must be an https link or a PNG, JPEG or WebP image.');

const loginSchema = z.object({
  email: z.string({ error: 'Enter your email address.' }).trim().toLowerCase().min(1, 'Enter your email address.').max(254),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(1000)
});

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  phone: phoneSchema.optional()
});

const googleSchema = z.object({
  credential: z.string({ error: 'The Google sign-in response is missing.' }).min(1, 'The Google sign-in response is missing.').max(10_000)
});

export const DEMO_PERSONAS = {
  member: 'member@pulsefit.com',
  vip: 'vip@pulsefit.com',
  trainer: 'trainer@pulsefit.com',
  admin: 'admin@pulsefit.com'
} as const;

/**
 * Whether an account is a shared demo persona whose password nobody may change or reset. In demo
 * mode anyone can sign in as one, so a changed password would sign every other visitor out and
 * break the published password.
 */
export function isLockedDemoAccount(email: string): boolean {
  return config.demoMode && (Object.values(DEMO_PERSONAS) as string[]).includes(email.toLowerCase());
}

export const DEMO_ACCOUNT_LOCKED_MESSAGE =
  'This is a shared demo account, so its password cannot be changed or reset. Register your own account to try this.';

const demoLoginSchema = z.object({
  role: z.enum(['member', 'vip', 'trainer', 'admin']).default('member')
});

const profileSchema = z.strictObject(
  {
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    avatar_url: avatarSchema.optional()
  },
  {
    error: issue =>
      issue.code === 'unrecognized_keys' ? 'Only your name, phone number and photo can be changed here.' : undefined
  }
);

/** What every successful sign-in returns. */
export function session(user: User) {
  return { token: generateToken(user), user: toSafeUser(user) };
}

/** A new member account: no plan until they pay (or an admin grants one). */
function newMember(fields: { name: string; email: string; phone?: string; password_hash?: string; google_sub?: string }): User {
  return {
    id: newId('usr'),
    name: fields.name,
    email: fields.email,
    ...(fields.password_hash ? { password_hash: fields.password_hash } : {}),
    ...(fields.google_sub ? { google_sub: fields.google_sub } : {}),
    role: 'member',
    avatar_url: defaultAvatar(fields.name),
    phone: fields.phone ?? '',
    membership_tier: 'none',
    membership_status: 'pending',
    membership_expiry: null,
    qr_code_token: generateQrToken(fields.name),
    created_at: new Date().toISOString(),
    streak_days: 0,
    last_active_date: null,
    token_version: 0
  };
}

/** Retire every open reset link of a user, so a link handed out earlier can no longer be redeemed. */
export function retireResetLinks(userId: string, at: string = new Date().toISOString()): void {
  if (!db.password_resets.some(r => r.user_id === userId && !r.used_at)) return;
  db.password_resets = db.password_resets.map(r => (r.user_id === userId && !r.used_at ? { ...r, used_at: at } : r));
}

function emailTaken(): ApiError {
  return conflict('An account with this email already exists. Please sign in instead.', 'EMAIL_TAKEN');
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = findUserByEmail(email);

  const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !matches) {
    throw new ApiError(401, 'The email or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  return ok(res, session(user));
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  // Any tier, role or status in the body is ignored: the schema strips unknown keys.
  const { name, email, password, phone } = parse(registerSchema, req.body);
  if (findUserByEmail(email)) throw emailTaken();

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Another request may have registered the same email while we were hashing.
  if (findUserByEmail(email)) throw emailTaken();

  const user = newMember({ name, email, phone, password_hash });
  db.users = [...db.users, user];

  return ok(res, session(user), 'Welcome to PulseFit! Choose a plan to start training.', 201);
});

export const googleSignIn = asyncHandler(async (req: Request, res: Response) => {
  if (!googleSignInEnabled()) {
    throw unavailable('Google sign-in is not available on this server.', 'GOOGLE_SIGNIN_DISABLED');
  }
  const { credential } = parse(googleSchema, req.body);

  let profile;
  try {
    profile = await verifyGoogleCredential(credential, config.googleClientId);
  } catch (err) {
    if (err instanceof InvalidGoogleTokenError) throw unauthorized(err.message, 'INVALID_GOOGLE_TOKEN');
    throw unauthorized('The Google sign-in could not be verified. Please try again.', 'INVALID_GOOGLE_TOKEN');
  }

  const bySub = db.users.find(u => u.google_sub === profile.sub);
  if (bySub) return ok(res, { ...session(bySub), created: false });

  const byEmail = findUserByEmail(profile.email);
  if (byEmail) {
    if (byEmail.google_sub) {
      throw conflict('This email is already linked to a different Google account.', 'GOOGLE_ACCOUNT_CONFLICT');
    }
    // Registration never proves that the email belongs to the registrant, so Google's verified email
    // is the first real proof of ownership. Whoever registered it before loses their way in: the
    // password goes, older tokens are revoked and open reset links die. Name and photo stay.
    const { password_hash, ...rest } = byEmail;
    const linked: User = { ...rest, google_sub: profile.sub, token_version: (byEmail.token_version || 0) + 1 };
    db.users = db.users.map(u => (u.id === linked.id ? linked : u));
    retireResetLinks(linked.id);
    const message = password_hash
      ? 'Your Google account is now linked. For your security the old password was removed and other devices were signed out. You can set a new password in your profile.'
      : 'Your Google account is now linked.';
    return ok(res, { ...session(linked), created: false }, message);
  }

  const name = (profile.name?.trim() || profile.email.split('@')[0]).slice(0, 60);
  const user = newMember({ name, email: profile.email, google_sub: profile.sub });
  db.users = [...db.users, user];
  return ok(res, { ...session(user), created: true });
});

export const demoLogin = asyncHandler(async (req: Request, res: Response) => {
  if (!config.demoMode) throw notFound('Demo accounts are turned off on this server.', 'DEMO_DISABLED');
  const { role } = parse(demoLoginSchema, req.body);

  const user = findUserByEmail(DEMO_PERSONAS[role]);
  if (!user) throw notFound('That demo account does not exist. Run "npm run seed" to restore the demo data.');

  return ok(res, session(user));
});

export const getMe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  return ok(res, toSafeUser(req.user!));
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const changes = parse(profileSchema, req.body);
  const current = db.users.find(u => u.id === req.user!.id);
  if (!current) throw unauthorized();

  const updated: User = {
    ...current,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
    ...(changes.avatar_url !== undefined ? { avatar_url: changes.avatar_url } : {})
  };
  db.users = db.users.map(u => (u.id === updated.id ? updated : u));

  return ok(res, toSafeUser(updated), 'Profile updated.');
});
