import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, conflict, forbidden, notFound, ok, parse } from '../lib/http.js';
import { newId } from '../lib/users.js';
import { effectiveStatus, isStaff, tierAllowsCategory } from '../lib/membership.js';
import { gymToday, startOfWeek, toGymDate } from '../lib/dates.js';
import { closeStaleSessions, creditSession, elapsedMinutes, MAX_SESSION_MINUTES, toFloorPresence } from '../lib/floor.js';
import { ActiveFloorStatus, TimeSession, UserTimeTrackingStats } from '../types/index.js';

const CATEGORIES = ['Workout & Strength', 'Zumba & Cardio'] as const;

const clockInSchema = z.object({
  category: z.enum(CATEGORIES, { error: `Choose a floor: ${CATEGORIES.join(' or ')}.` }),
  notes: z.string().trim().max(500).optional()
}).strict();

const clockOutSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  session_id: z.string().min(1).optional()
}).strict();

const byClockInDesc = (a: TimeSession, b: TimeSession) => b.clock_in_time.localeCompare(a.clock_in_time);

export const clockIn = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  const body = parse(clockInSchema, req.body);
  const now = new Date();
  closeStaleSessions(now);

  if (!isStaff(user)) {
    const status = effectiveStatus(user);
    if (status !== 'active') {
      throw forbidden(
        status === 'frozen'
          ? 'Your membership is frozen. Unfreeze it to use the gym floor.'
          : 'You need an active membership to use the gym floor.',
        'MEMBERSHIP_INACTIVE',
        { status }
      );
    }
    if (!tierAllowsCategory(user.membership_tier, body.category)) {
      throw forbidden(
        `Your plan does not include the ${body.category} floor. Upgrade your plan to use it.`,
        'PLAN_EXCLUDES_CATEGORY',
        { category: body.category, tier: user.membership_tier }
      );
    }
  }

  const open = db.time_sessions.find(s => s.user_id === user.id && s.status === 'active');
  if (open) {
    throw conflict(
      `You are already clocked in to the ${open.category} floor. Clock out before starting a new session.`,
      'ALREADY_CLOCKED_IN',
      open
    );
  }

  const session: TimeSession = {
    id: newId('ses'),
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    // Uploaded photos are data: URLs of up to 350 kB; copying one into every session would let a
    // member grow the database without limit. Staff views resolve the current photo instead.
    user_avatar: user.avatar_url.startsWith('data:') ? '' : user.avatar_url,
    user_tier: user.membership_tier,
    category: body.category,
    clock_in_time: now.toISOString(),
    clock_out_time: null,
    duration_minutes: 0,
    status: 'active',
    ...(body.notes ? { notes: body.notes } : {})
  };
  db.time_sessions = [session, ...db.time_sessions];

  return ok(res, session, `Clocked in to the ${session.category} floor.`, 201);
});

export const clockOut = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  const body = parse(clockOutSchema, req.body);
  const now = new Date();
  closeStaleSessions(now);

  let session: TimeSession | undefined;
  if (body.session_id) {
    session = db.time_sessions.find(s => s.id === body.session_id && s.status === 'active');
    if (session && session.user_id !== user.id && user.role !== 'admin') {
      throw forbidden('You can only clock out your own session.');
    }
  } else {
    session = db.time_sessions.find(s => s.user_id === user.id && s.status === 'active');
  }
  if (!session) throw notFound('There is no active session to clock out of.', 'NO_ACTIVE_SESSION');

  const target = session;
  const completed: TimeSession = {
    ...target,
    status: 'completed',
    clock_out_time: now.toISOString(),
    duration_minutes: Math.max(1, Math.min(MAX_SESSION_MINUTES, elapsedMinutes(target, now))),
    ...(body.notes !== undefined ? { notes: body.notes } : {})
  };
  db.time_sessions = db.time_sessions.map(s => (s.id === target.id ? completed : s));
  creditSession(target.user_id, toGymDate(target.clock_in_time));

  return ok(res, completed, `Clocked out after ${completed.duration_minutes} min on the ${completed.category} floor.`);
});

export const getActiveFloorStatus = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const now = new Date();
  closeStaleSessions(now);

  const active = db.time_sessions
    .filter(s => s.status === 'active')
    .sort((a, b) => a.clock_in_time.localeCompare(b.clock_in_time));
  const workout = active.filter(s => s.category === 'Workout & Strength');
  const zumba = active.filter(s => s.category === 'Zumba & Cardio');

  const status: ActiveFloorStatus = {
    totalActive: active.length,
    workoutActive: workout.length,
    zumbaActive: zumba.length
  };
  if (req.user && isStaff(req.user)) {
    status.workoutUsers = workout.map(s => toFloorPresence(s, now));
    status.zumbaUsers = zumba.map(s => toFloorPresence(s, now));
  }
  return ok(res, status);
});

export const getMyTimeTrackingStats = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const userId = req.user!.id;
  const now = new Date();
  closeStaleSessions(now);

  const mine = db.time_sessions.filter(s => s.user_id === userId);
  const open = mine.find(s => s.status === 'active');
  const completed = mine.filter(s => s.status === 'completed').sort(byClockInDesc);

  const today = gymToday(now);
  const weekStart = startOfWeek(today);
  const monthPrefix = today.slice(0, 7);
  const minutesSince = (pred: (date: string) => boolean) =>
    completed.filter(s => pred(toGymDate(s.clock_in_time))).reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  const stats: UserTimeTrackingStats = {
    // A copy: the live duration must never be written back into the stored session.
    activeSession: open ? { ...open, duration_minutes: elapsedMinutes(open, now) } : null,
    totalTimeMinutesThisWeek: minutesSince(d => d >= weekStart && d <= today),
    totalTimeMinutesThisMonth: minutesSince(d => d.startsWith(monthPrefix)),
    totalSessionsCompleted: completed.length,
    recentSessions: completed.slice(0, 15)
  };
  return ok(res, stats);
});
