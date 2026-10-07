import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError, asyncHandler, forbidden, ok, parse } from '../lib/http.js';
import { gymToday, isValidDate, toGymDate } from '../lib/dates.js';
import { effectiveStatus, isStaff } from '../lib/membership.js';
import { recordActivity } from '../lib/streak.js';
import { newId, toSafeUser } from '../lib/users.js';
import { AttendanceLog, TrialPass, User } from '../types/index.js';

const METHODS = ['qr', 'manual', 'kiosk', 'camera'] as const;

const checkInBody = z
  .object({
    code: z.string().trim().min(1).max(200).optional(),
    // Older scanners send the pass as tokenOrId.
    tokenOrId: z.string().trim().min(1).max(200).optional(),
    method: z.enum(METHODS).default('qr')
  })
  .strict()
  .refine(b => b.code || b.tokenOrId, { message: 'Enter a pass code, member id or email.', path: ['code'] });

const logsQuery = z.object({
  date: z.string().refine(isValidDate, 'Use a date in YYYY-MM-DD format.').optional(),
  user_id: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  format: z.enum(['json', 'csv']).default('json')
});

const newestFirst = (a: AttendanceLog, b: AttendanceLog) => b.check_in_time.localeCompare(a.check_in_time);

function memberSummary(user: User) {
  const safe = toSafeUser(user);
  return {
    id: safe.id,
    name: safe.name,
    email: safe.email,
    avatar_url: safe.avatar_url,
    membership_tier: safe.membership_tier,
    membership_status: safe.membership_status,
    membership_expiry: safe.membership_expiry,
    streak_days: safe.streak_days ?? 0
  };
}

/**
 * Look the code up in a fixed order so an ambiguous value always resolves the same way:
 * pass token, then member id, then email, then trial code.
 */
function resolveCode(code: string): { user: User } | { trial: TrialPass } | null {
  const user =
    db.users.find(u => u.qr_code_token === code) ||
    db.users.find(u => u.id === code) ||
    db.users.find(u => u.email.toLowerCase() === code.toLowerCase());
  if (user) return { user };
  const trial = db.trial_passes.find(t => t.code.toUpperCase() === code.toUpperCase());
  return trial ? { trial } : null;
}

function denyMember(user: User, status: 'expired' | 'frozen' | 'pending'): ApiError {
  const member = memberSummary(user);
  if (status === 'expired') {
    const when = user.membership_expiry ? ` on ${user.membership_expiry}` : '';
    return forbidden(`${user.name}'s membership expired${when}. Please renew at the front desk.`, 'MEMBERSHIP_EXPIRED', { member });
  }
  if (status === 'frozen') {
    return forbidden(`${user.name}'s membership is frozen. Unfreeze it to use the gym.`, 'MEMBERSHIP_FROZEN', { member });
  }
  return forbidden(`${user.name} has no active plan yet. Buy a membership to use the gym.`, 'MEMBERSHIP_PENDING', { member });
}

export const checkIn = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const body = parse(checkInBody, req.body);
  const code = (body.code || body.tokenOrId)!;
  const now = new Date();
  const today = gymToday(now);

  const match = resolveCode(code);
  if (!match) {
    throw new ApiError(404, 'That pass was not recognised. Check the code or search the member by email.', 'PASS_NOT_FOUND');
  }

  if ('trial' in match) {
    const trial = match.trial;
    if (trial.status === 'redeemed') {
      throw forbidden(`This free trial pass was already used${trial.redeemed_at ? ` on ${toGymDate(trial.redeemed_at)}` : ''}.`, 'TRIAL_ALREADY_USED', { trial });
    }
    if (trial.valid_on !== today) {
      throw forbidden(`This free trial pass is valid only on ${trial.valid_on}.`, 'TRIAL_NOT_VALID_TODAY', { trial });
    }

    const redeemed: TrialPass = { ...trial, status: 'redeemed', redeemed_at: now.toISOString() };
    const log: AttendanceLog = {
      id: newId('att'),
      user_id: trial.id,
      user_name: trial.name,
      user_email: trial.email,
      user_tier: 'trial',
      check_in_time: now.toISOString(),
      check_in_method: body.method,
      trial_pass_id: trial.id
    };
    db.trial_passes = db.trial_passes.map(t => (t.id === trial.id ? redeemed : t));
    db.attendance_logs = [log, ...db.attendance_logs];

    return ok(
      res,
      { result: 'granted', already_checked_in: false, kind: 'trial', trial: redeemed, log },
      `Welcome to PulseFit, ${trial.name}! Enjoy your free trial.`
    );
  }

  const user = match.user;
  const status = effectiveStatus(user, today);
  if (status !== 'active' && !isStaff(user)) throw denyMember(user, status);

  const existing = db.attendance_logs
    .filter(a => a.user_id === user.id && toGymDate(a.check_in_time) === today)
    .sort(newestFirst)[0];
  if (existing) {
    return ok(
      res,
      { result: 'granted', already_checked_in: true, kind: 'member', member: memberSummary(user), log: existing },
      `${user.name} already checked in today. Come on through!`
    );
  }

  const log: AttendanceLog = {
    id: newId('att'),
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    user_tier: user.membership_tier,
    check_in_time: now.toISOString(),
    check_in_method: body.method
  };
  db.attendance_logs = [log, ...db.attendance_logs];
  recordActivity(user.id, today);

  const refreshed = db.users.find(u => u.id === user.id) ?? user;
  return ok(
    res,
    { result: 'granted', already_checked_in: false, kind: 'member', member: memberSummary(refreshed), log },
    `Welcome to PulseFit, ${user.name}!`
  );
});

const CSV_COLUMNS = ['id', 'gym_date', 'check_in_time', 'kind', 'user_id', 'user_name', 'user_email', 'user_tier', 'check_in_method'] as const;

function csvCell(value: unknown): string {
  let s = value === undefined || value === null ? '' : String(value);
  // Names come from public forms; a leading = + - @ would run as a formula in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(logs: AttendanceLog[]): string {
  const rows = logs.map(l =>
    [
      l.id,
      toGymDate(l.check_in_time),
      l.check_in_time,
      l.trial_pass_id ? 'trial' : 'member',
      l.user_id,
      l.user_name,
      l.user_email,
      l.user_tier,
      l.check_in_method
    ]
      .map(csvCell)
      .join(',')
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

export const getAttendanceLogs = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const q = parse(logsQuery, req.query);

  let logs = db.attendance_logs;
  if (q.date) logs = logs.filter(l => toGymDate(l.check_in_time) === q.date);
  if (q.user_id) logs = logs.filter(l => l.user_id === q.user_id);
  logs = [...logs].sort(newestFirst);

  if (q.format === 'csv') {
    // An export is every matching row; limit/offset only page the on-screen list.
    const name = `attendance-${q.date ?? gymToday()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    return res.status(200).send(toCsv(logs));
  }

  return ok(res, { items: logs.slice(q.offset, q.offset + q.limit), total: logs.length });
});

export const getMyAttendance = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const mine = db.attendance_logs.filter(l => l.user_id === req.user!.id).sort(newestFirst).slice(0, 100);
  return ok(res, mine);
});
