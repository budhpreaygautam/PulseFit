import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import config from '../config.js';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, ok, parse } from '../lib/http.js';
import { addDays, addMonths, gymDateTime, gymToday, isValidDate } from '../lib/dates.js';
import { unfreezeMembership } from '../lib/billing.js';
import { effectiveStatus } from '../lib/membership.js';
import { defaultAvatar, findUserByEmail, generateQrToken, generateTempPassword, newId, toSafeUser } from '../lib/users.js';
import { closeOpenSession, releaseInvalidBookings } from '../lib/bookingRules.js';
import { DEMO_PERSONAS } from './authController.js';
import { MembershipStatus, MembershipTier, User, UserRole } from '../types/index.js';

const ROLES = ['member', 'trainer', 'admin'] as const satisfies readonly UserRole[];
const TIERS = ['none', 'basic', 'pro', 'vip'] as const satisfies readonly MembershipTier[];
const STATUSES = ['active', 'expired', 'pending', 'frozen'] as const satisfies readonly MembershipStatus[];

// Filters arrive from <select>s that may say 'All'; compare case-insensitively.
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  tier: z.preprocess(lower, z.enum([...TIERS, 'all'])).optional(),
  status: z.preprocess(lower, z.enum([...STATUSES, 'all'])).optional(),
  role: z.preprocess(lower, z.enum([...ROLES, 'all'])).default('member')
});

const nameField = z.string().trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name must be at most 60 characters.');
const phoneField = z.string().trim().max(20, 'Phone number is too long.');
// Trim before the format check: zod's z.email().trim() validates first and rejects pasted ' a@b.com '.
const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));
// Forms may send "3", but z.coerce would also turn true into 1 and null or '' into 0.
const monthsField = z.preprocess(
  v => (typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v),
  z.number('Months must be a number.').int('Months must be a whole number.').min(0).max(24)
);

const createBody = z
  .object({
    name: nameField,
    email: emailField,
    phone: phoneField.optional(),
    role: z.enum(ROLES).default('member'),
    membership_tier: z.enum(TIERS).default('none'),
    expiry_months: monthsField.default(0)
  })
  .strict();

const updateBody = z
  .object({
    name: nameField.optional(),
    phone: phoneField.optional(),
    role: z.enum(ROLES).optional(),
    membership_tier: z.enum(TIERS).optional(),
    membership_status: z.enum(STATUSES).optional(),
    membership_expiry: z.string().refine(isValidDate, 'Use a date in YYYY-MM-DD format.').nullable().optional()
  })
  .strict();

function findUserOr404(id: string): User {
  const user = db.users.find(u => u.id === id);
  if (!user) throw notFound('No member with that id.', 'NOT_FOUND');
  return user;
}

function emailTaken(): never {
  throw conflict('An account with this email already exists.', 'EMAIL_TAKEN');
}

function adminCount(): number {
  return db.users.filter(u => u.role === 'admin').length;
}

// On a public demo every visitor signs in through the same four personas (POST /auth/demo-login),
// so one visitor must not take them away from everyone else: no password reset, no delete, no
// change of role.
function isDemoPersona(user: User): boolean {
  return config.demoMode && (Object.values(DEMO_PERSONAS) as string[]).includes(user.email);
}

function demoAccountLocked(what: string): never {
  throw forbidden(
    `This is one of the shared demo accounts that every visitor uses, so ${what}. Try it on another member.`,
    'DEMO_ACCOUNT_LOCKED'
  );
}

export const getMembers = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { search, tier, status, role } = parse(listQuery, req.query);
  const today = gymToday();

  let list = db.users;
  if (role !== 'all') list = list.filter(u => u.role === role);
  if (tier && tier !== 'all') list = list.filter(u => u.membership_tier === tier);
  if (status && status !== 'all') list = list.filter(u => effectiveStatus(u, today) === status);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        u.qr_code_token.toLowerCase().includes(q)
    );
  }

  return ok(res, list.map(toSafeUser));
});

export const getMemberById = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = findUserOr404(req.params.id);
  const now = Date.now();
  const today = gymToday();

  const bookings = db.bookings.filter(b => b.user_id === user.id);
  const upcoming = bookings.filter(b => {
    if (b.status !== 'confirmed') return false;
    const cls = db.classes.find(c => c.id === b.class_id);
    if (!cls) return b.booking_date >= today;
    return gymDateTime(b.booking_date, cls.start_time).getTime() > now;
  });
  const attendance = db.attendance_logs
    .filter(a => a.user_id === user.id)
    .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
  const payments = db.payments
    .filter(p => p.user_id === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return ok(res, {
    ...toSafeUser(user),
    bookings_count: bookings.length,
    attendance_count: attendance.length,
    workouts_count: db.workouts.filter(w => w.user_id === user.id).length,
    upcoming_bookings: upcoming.length,
    recent_attendance: attendance.slice(0, 10),
    payments
  });
});

export const createMember = asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
  const body = parse(createBody, req.body);
  if (findUserByEmail(body.email)) emailTaken();

  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, 10);
  // Another request (a double-clicked "Add Member") may have inserted this email during the
  // hash, so check again; from here to the insert nothing awaits.
  if (findUserByEmail(body.email)) emailTaken();

  const today = gymToday();
  const paid = body.membership_tier !== 'none' && body.expiry_months > 0;

  const member: User = {
    id: newId('usr'),
    email: body.email,
    password_hash,
    name: body.name,
    role: body.role,
    avatar_url: defaultAvatar(body.name),
    phone: body.phone ?? '',
    membership_tier: body.membership_tier,
    membership_status: paid ? 'active' : 'pending',
    // Inclusive last day: one month from 7 Oct runs until 6 Nov.
    membership_expiry: paid ? addDays(addMonths(today, body.expiry_months), -1) : null,
    frozen_since: null,
    qr_code_token: generateQrToken(body.name),
    created_at: new Date().toISOString(),
    streak_days: 0,
    last_active_date: null,
    token_version: 0
  };

  db.users = [...db.users, member];
  return ok(res, { member: toSafeUser(member), tempPassword }, `${member.name} was added.`, 201);
});

export const updateMember = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const existing = findUserOr404(req.params.id);
  const body = parse(updateBody, req.body);

  if (body.role !== undefined && body.role !== existing.role) {
    if (existing.id === req.user!.id) {
      throw badRequest('You cannot change your own role. Ask another admin to do it.', 'CANNOT_CHANGE_OWN_ROLE');
    }
    if (existing.role === 'admin' && adminCount() <= 1) {
      throw badRequest('This is the only admin account, so its role cannot be changed.', 'LAST_ADMIN');
    }
    if (isDemoPersona(existing)) demoAccountLocked('its role cannot be changed');
  }

  const today = gymToday();
  const next: User = { ...existing };
  if (body.name !== undefined) next.name = body.name;
  if (body.phone !== undefined) next.phone = body.phone;
  if (body.role !== undefined) next.role = body.role;
  if (body.membership_tier !== undefined) next.membership_tier = body.membership_tier;
  if (body.membership_expiry !== undefined) next.membership_expiry = body.membership_expiry;
  if (body.membership_status !== undefined && body.membership_status !== existing.membership_status) {
    next.membership_status = body.membership_status;
    // Keep frozen_since in step with the status so a later unfreeze computes the right extension.
    next.frozen_since = body.membership_status === 'frozen' ? today : null;
    // Unfreezing here follows the same rule as POST /membership/unfreeze (lib/billing): the open
    // days missed are given back. An expiry sent in the same request is the admin's explicit choice and wins.
    if (existing.membership_status === 'frozen' && body.membership_status === 'active' && body.membership_expiry === undefined) {
      next.membership_expiry = unfreezeMembership(existing, today).membership_expiry;
    }
  }

  // The expiry rule applies when this request makes or keeps the membership active: it sends
  // status 'active', or a new expiry for a membership stored as active. A lapsed member (stored
  // 'active' past the expiry, shown as 'expired') can have their plan, name or phone changed and
  // stays lapsed.
  const assertsActive =
    body.membership_status === 'active' || (body.membership_expiry !== undefined && next.membership_status === 'active');
  if (assertsActive && (!next.membership_expiry || next.membership_expiry < today)) {
    const message = 'An active membership needs an expiry date of today or later.';
    throw badRequest(`membership_expiry: ${message}`, 'VALIDATION_ERROR', {
      issues: [{ path: 'membership_expiry', message }]
    });
  }

  const touchesMembership = body.membership_status !== undefined || body.membership_expiry !== undefined || body.membership_tier !== undefined;
  if (touchesMembership && effectiveStatus(next, today) === 'active' && next.membership_tier === 'none') {
    const message = 'Choose a plan for an active membership.';
    throw badRequest(`membership_tier: ${message}`, 'VALIDATION_ERROR', { issues: [{ path: 'membership_tier', message }] });
  }

  db.users = db.users.map(u => (u.id === existing.id ? next : u));
  const changed =
    next.role !== existing.role ||
    next.membership_status !== existing.membership_status ||
    next.membership_expiry !== existing.membership_expiry ||
    next.membership_tier !== existing.membership_tier;
  // A member whose membership is no longer active (frozen, expired or pending) may not be on the
  // gym floor (POST /time-tracking/clock-in), so an open session ends now, as when they freeze
  // themselves. Staff skip that check and keep theirs.
  if (changed && next.role === 'member' && effectiveStatus(next, today) !== 'active') closeOpenSession(next.id);
  // Spots the booking rules would now refuse go back to others: a freeze, expiry or pending
  // status, an earlier last day, a plan without the class's category, or a move to a staff role.
  const released = changed ? releaseInvalidBookings(next.id) : 0;
  const message = released > 0 ? `Member updated. ${released} upcoming booking${released === 1 ? ' was' : 's were'} cancelled.` : undefined;
  // Re-read: ending a floor session may have counted a streak day.
  return ok(res, toSafeUser(db.users.find(u => u.id === next.id) ?? next), message);
});

export const deleteMember = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const existing = findUserOr404(req.params.id);
  if (existing.id === req.user!.id) {
    throw badRequest('You cannot delete your own account.', 'CANNOT_DELETE_SELF');
  }
  if (existing.role === 'admin' && adminCount() <= 1) {
    throw badRequest('This is the only admin account, so it cannot be deleted.', 'LAST_ADMIN');
  }
  if (isDemoPersona(existing)) demoAccountLocked('it cannot be deleted');

  const id = existing.id;
  const workoutIds = new Set(db.workouts.filter(w => w.user_id === id).map(w => w.id));

  // Seats free themselves: capacity is counted from bookings, so dropping the bookings is enough.
  // Payments and payment orders stay as financial records (they carry a name/email snapshot).
  db.bookings = db.bookings.filter(b => b.user_id !== id);
  db.workouts = db.workouts.filter(w => w.user_id !== id);
  db.workout_sets = db.workout_sets.filter(s => !s.workout_id || !workoutIds.has(s.workout_id));
  db.attendance_logs = db.attendance_logs.filter(a => a.user_id !== id);
  db.time_sessions = db.time_sessions.filter(s => s.user_id !== id);
  db.trainer_notes = db.trainer_notes.filter(n => n.member_id !== id);
  db.password_resets = db.password_resets.filter(r => r.user_id !== id);
  if (db.trainers.some(t => t.user_id === id)) {
    db.trainers = db.trainers.map(t => (t.user_id === id ? { ...t, user_id: undefined } : t));
  }
  db.users = db.users.filter(u => u.id !== id);

  return ok(res, { deleted: true }, `${existing.name} was removed.`);
});

export const resetMemberPassword = asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
  const existing = findUserOr404(req.params.id);
  if (isDemoPersona(existing)) demoAccountLocked('its password cannot be reset');
  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, 10);

  db.users = db.users.map(u =>
    u.id === existing.id ? { ...u, password_hash, token_version: (u.token_version || 0) + 1 } : u
  );
  // A reset link sent earlier would otherwise still overwrite the password the admin just set.
  db.password_resets = db.password_resets.filter(r => r.user_id !== existing.id);

  return ok(res, { tempPassword }, `A new temporary password was set for ${existing.name}.`);
});
