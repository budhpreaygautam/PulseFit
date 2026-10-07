import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, ok, parse } from '../lib/http.js';
import { addDays, dayOfWeek, gymToday } from '../lib/dates.js';
import { effectiveStatus, tierAllowsCategory } from '../lib/membership.js';
import { recordActivity } from '../lib/streak.js';
import { newId } from '../lib/users.js';
import {
  ATTENDANCE_OPENS_MINUTES,
  BOOKING_WINDOW_DAYS,
  bookedCount,
  hasStarted,
  nextOccurrenceOf,
  presentClass,
  startsAt,
  toOccurrence,
  trainerOfUser
} from '../lib/occurrences.js';
import { dateString } from './classController.js';
import { Booking, GymClass, User } from '../types/index.js';

const myBookingsQuery = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming')
});

const createSchema = z
  .object({
    class_id: z.string().min(1),
    booking_date: dateString
  })
  .strict();

const attendanceSchema = z
  .object({
    status: z.enum(['attended', 'no_show', 'confirmed'])
  })
  .strict();

const rosterQuery = z.object({
  date: z.preprocess(v => (v === '' ? undefined : v), dateString.optional())
});

/** Admins may manage any class; a trainer only the classes they teach. */
function assertCanManageClass(user: User, gymClass: GymClass | undefined) {
  if (user.role === 'admin') return;
  const trainer = trainerOfUser(user.id);
  if (!gymClass || !trainer || trainer.id !== gymClass.trainer_id) {
    throw forbidden('Only the trainer who teaches this class can do that.', 'NOT_YOUR_CLASS');
  }
}

/** The class time of a booking, from the live class or, if the class was deleted, the booking's snapshot. */
function bookingStartTime(booking: Booking): string {
  return db.classes.find(c => c.id === booking.class_id)?.start_time ?? booking.start_time ?? '00:00';
}

export const getMyBookings = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { scope } = parse(myBookingsQuery, req.query);
  const now = new Date();

  const rows = db.bookings
    .filter(b => b.user_id === req.user!.id)
    .map(b => {
      const raw = db.classes.find(c => c.id === b.class_id);
      const cls = raw ? presentClass(raw) : undefined;
      const startTime = cls?.start_time ?? b.start_time ?? '00:00';
      const started = hasStarted(startTime, b.booking_date, now);
      return {
        ...b,
        class_title: cls?.title ?? b.class_title,
        category: cls?.category ?? b.category,
        start_time: startTime,
        room: cls?.room ?? b.room,
        trainer_name: cls?.trainer_name ?? b.trainer_name,
        image_url: cls?.image_url ?? null,
        duration_minutes: cls?.duration_minutes ?? null,
        starts_at: startsAt(startTime, b.booking_date).toISOString(),
        can_cancel: b.status === 'confirmed' && !started,
        started
      };
    })
    .filter(b => {
      if (scope === 'upcoming') return b.status === 'confirmed' && !b.started;
      // A booking marked attended in the 15 minutes before the start already belongs to history.
      if (scope === 'past') return b.status !== 'cancelled' && (b.started || b.status !== 'confirmed');
      return true;
    })
    .map(({ started: _started, ...b }) => b);

  rows.sort((a, b) => (scope === 'past' ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)));
  ok(res, rows);
});

export const createBooking = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  if (user.role !== 'member') {
    throw forbidden('Class bookings are for members. Staff accounts cannot book a spot.', 'MEMBERS_ONLY');
  }
  const { class_id, booking_date } = parse(createSchema, req.body);

  const gymClass = db.classes.find(c => c.id === class_id);
  if (!gymClass) throw notFound('That class does not exist.');

  const now = new Date();
  if (dayOfWeek(booking_date) !== gymClass.day_of_week) {
    throw badRequest('This class does not run on that day of the week.', 'DATE_MISMATCH');
  }
  if (hasStarted(gymClass.start_time, booking_date, now)) {
    throw badRequest('This class has already started, so it can no longer be booked.', 'CLASS_STARTED');
  }
  if (booking_date > addDays(gymToday(now), BOOKING_WINDOW_DAYS)) {
    throw badRequest(`Classes can be booked up to ${BOOKING_WINDOW_DAYS} days ahead.`, 'TOO_FAR_AHEAD');
  }

  const status = effectiveStatus(user);
  if (status !== 'active') {
    throw forbidden('Your membership is not active. Renew or unfreeze your plan to book classes.', 'MEMBERSHIP_INACTIVE', { status });
  }
  if (!tierAllowsCategory(user.membership_tier, gymClass.category)) {
    throw forbidden(`Your plan does not include ${gymClass.category} classes. Upgrade your plan to book this class.`, 'PLAN_EXCLUDES_CATEGORY');
  }
  if (bookedCount(gymClass.id, booking_date) >= gymClass.capacity) {
    throw conflict('This class is full on that date.', 'CLASS_FULL');
  }
  const duplicate = db.bookings.some(
    b => b.class_id === gymClass.id && b.user_id === user.id && b.booking_date === booking_date && b.status !== 'cancelled'
  );
  if (duplicate) {
    throw conflict('You have already booked this class on that date.', 'ALREADY_BOOKED');
  }

  const shown = presentClass(gymClass);
  const booking: Booking = {
    id: newId('bk'),
    class_id: gymClass.id,
    user_id: user.id,
    booking_date,
    status: 'confirmed',
    created_at: now.toISOString(),
    // Snapshot, so the member's history still reads well if the class is later deleted.
    class_title: shown.title,
    category: shown.category,
    start_time: shown.start_time,
    room: shown.room,
    trainer_name: shown.trainer_name
  };
  db.bookings = [...db.bookings, booking];
  ok(res, booking, 'Your spot is booked.', 201);
});

export const cancelBooking = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  const booking = db.bookings.find(b => b.id === req.params.id);
  if (!booking) throw notFound('That booking does not exist.');
  if (booking.user_id !== user.id && user.role !== 'admin') {
    throw forbidden('You can only cancel your own bookings.');
  }
  if (booking.status === 'cancelled') {
    throw conflict('This booking is already cancelled.', 'ALREADY_CANCELLED');
  }
  const now = new Date();
  if (booking.status !== 'confirmed' || hasStarted(bookingStartTime(booking), booking.booking_date, now)) {
    throw badRequest('This class has already started, so the booking can no longer be cancelled.', 'CLASS_STARTED');
  }

  const cancelled: Booking = { ...booking, status: 'cancelled', cancelled_at: now.toISOString() };
  db.bookings = db.bookings.map(b => (b.id === booking.id ? cancelled : b));
  ok(res, cancelled, 'Booking cancelled.');
});

export const markAttendance = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { status } = parse(attendanceSchema, req.body);
  const booking = db.bookings.find(b => b.id === req.params.id);
  if (!booking) throw notFound('That booking does not exist.');

  const gymClass = db.classes.find(c => c.id === booking.class_id);
  assertCanManageClass(req.user!, gymClass);

  if (booking.status === 'cancelled') {
    throw conflict('This booking was cancelled, so attendance cannot be recorded.', 'ALREADY_CANCELLED');
  }
  const opensAt = startsAt(bookingStartTime(booking), booking.booking_date).getTime() - ATTENDANCE_OPENS_MINUTES * 60_000;
  if (Date.now() < opensAt) {
    throw badRequest(`Attendance opens ${ATTENDANCE_OPENS_MINUTES} minutes before the class starts.`, 'CLASS_NOT_STARTED');
  }

  const updated: Booking = { ...booking, status };
  db.bookings = db.bookings.map(b => (b.id === booking.id ? updated : b));
  if (status === 'attended') recordActivity(booking.user_id, booking.booking_date);
  ok(res, updated, 'Attendance saved.');
});

export const getClassRoster = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { date } = parse(rosterQuery, req.query);
  const gymClass = db.classes.find(c => c.id === req.params.classId);
  if (!gymClass) throw notFound('That class does not exist.');
  assertCanManageClass(req.user!, gymClass);

  if (date && dayOfWeek(date) !== gymClass.day_of_week) {
    throw badRequest('This class does not run on that day of the week.', 'DATE_MISMATCH');
  }
  const occurrenceDate = date ?? nextOccurrenceOf(gymClass);

  const attendees = db.bookings
    .filter(b => b.class_id === gymClass.id && b.booking_date === occurrenceDate && b.status !== 'cancelled')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(b => {
      const member = db.users.find(u => u.id === b.user_id);
      return {
        booking_id: b.id,
        user_id: b.user_id,
        user_name: member?.name ?? 'Former member',
        user_email: member?.email ?? null,
        user_phone: member?.phone ?? null,
        user_avatar: member?.avatar_url ?? null,
        user_tier: member?.membership_tier ?? null,
        status: b.status,
        booked_at: b.created_at
      };
    });

  ok(res, { class: toOccurrence(gymClass, occurrenceDate), date: occurrenceDate, attendees });
});
