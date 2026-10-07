import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, notFound, ok, parse } from '../lib/http.js';
import { dayOfWeek, gymToday, isValidDate, isValidTime } from '../lib/dates.js';
import { newId } from '../lib/users.js';
import {
  bookedCount,
  byStart,
  hasStarted,
  isSessionDate,
  nextOccurrenceOf,
  occurrenceInWeek,
  presentClass,
  publicTrainer,
  toOccurrence
} from '../lib/occurrences.js';
import { GymClass } from '../types/index.js';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80';

// Query strings arrive as '' when a filter is cleared in a form; treat that as "no filter".
const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const dateString = z.string().refine(isValidDate, 'Use a real date in YYYY-MM-DD format');

const listQuery = z.object({
  day: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(6).optional()),
  category: z.preprocess(blankToUndefined, z.string().optional()),
  trainerId: z.preprocess(blankToUndefined, z.string().optional()),
  intensity: z.preprocess(blankToUndefined, z.string().optional()),
  search: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  week_start: z.preprocess(
    blankToUndefined,
    dateString.refine(d => dayOfWeek(d) === 1, 'week_start must be a Monday').optional()
  )
});

const classFields = {
  title: z.string().trim().min(2).max(100),
  category: z.enum(['Workout & Strength', 'Zumba & Cardio']),
  trainer_id: z.string().min(1),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().refine(isValidTime, 'Use a 24-hour time in HH:MM format'),
  duration_minutes: z.number().int().min(15).max(180),
  room: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(200),
  intensity: z.enum(['Low', 'Medium', 'High', 'Extreme']),
  description: z.string().trim().max(1000),
  image_url: z.url({ protocol: /^https?$/ }),
  calories_burn_est: z.number().int().min(0).max(3000)
};

const createSchema = z
  .object({
    ...classFields,
    intensity: classFields.intensity.default('Medium'),
    description: classFields.description.default(''),
    image_url: classFields.image_url.default(DEFAULT_IMAGE),
    calories_burn_est: classFields.calories_burn_est.default(0)
  })
  .strict();

const updateSchema = z.object(classFields).partial().strict();

function findTrainerOr400(trainerId: string) {
  const trainer = db.trainers.find(t => t.id === trainerId);
  if (!trainer) throw badRequest('That trainer does not exist.', 'TRAINER_NOT_FOUND');
  return trainer;
}

function matchesText(value: string | undefined, query: string) {
  return Boolean(value && value.toLowerCase().includes(query));
}

export const getClasses = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const q = parse(listQuery, req.query);
  const now = new Date();
  let classes = db.classes;

  if (q.day !== undefined) classes = classes.filter(c => c.day_of_week === q.day);
  if (q.category && q.category !== 'All') {
    const category = q.category.toLowerCase();
    classes = classes.filter(c => c.category.toLowerCase() === category);
  }
  if (q.trainerId) classes = classes.filter(c => c.trainer_id === q.trainerId);
  if (q.intensity && q.intensity !== 'All') {
    const intensity = q.intensity.toLowerCase();
    classes = classes.filter(c => c.intensity.toLowerCase() === intensity);
  }
  if (q.search) {
    const text = q.search.toLowerCase();
    classes = classes.filter(c => {
      const shown = presentClass(c);
      return matchesText(shown.title, text) || matchesText(shown.description, text) || matchesText(shown.trainer_name, text) || matchesText(shown.room, text);
    });
  }

  const occurrences = classes
    .map(c => toOccurrence(c, q.week_start ? occurrenceInWeek(c, q.week_start) : nextOccurrenceOf(c, now), req.user?.id))
    .sort(byStart);

  ok(res, occurrences);
});

export const getClassById = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { date } = parse(z.object({ date: z.preprocess(blankToUndefined, dateString.optional()) }), req.query);
  const gymClass = db.classes.find(c => c.id === req.params.id);
  if (!gymClass) throw notFound('That class does not exist.');

  if (date && !isSessionDate(gymClass, date)) {
    throw badRequest('This class does not run on that day of the week.', 'DATE_MISMATCH');
  }
  const occurrenceDate = date ?? nextOccurrenceOf(gymClass);
  const record = db.trainers.find(t => t.id === gymClass.trainer_id);
  const trainer = record ? publicTrainer(record, req.user) : null;
  ok(res, { ...toOccurrence(gymClass, occurrenceDate, req.user?.id), trainer });
});

export const createClass = asyncHandler((req, res: Response) => {
  const body = parse(createSchema, req.body);
  const trainer = findTrainerOr400(body.trainer_id);

  const newClass: GymClass = {
    id: newId('cls'),
    ...body,
    // Stored copies kept in sync for older readers; responses always use the trainer record.
    trainer_name: trainer.name,
    trainer_avatar: trainer.avatar_url
  };
  db.classes = [...db.classes, newClass];
  ok(res, presentClass(newClass), 'Class created.', 201);
});

export const updateClass = asyncHandler((req, res: Response) => {
  const updates = parse(updateSchema, req.body);
  const existing = db.classes.find(c => c.id === req.params.id);
  if (!existing) throw notFound('That class does not exist.');

  const trainer = updates.trainer_id ? findTrainerOr400(updates.trainer_id) : undefined;
  const now = new Date();
  const today = gymToday(now);

  // Upcoming confirmed bookings of this class, to protect them from the change.
  const upcoming = db.bookings.filter(
    b => b.class_id === existing.id && b.status === 'confirmed' && b.booking_date >= today && !hasStarted(existing.start_time, b.booking_date, now)
  );

  if (updates.capacity !== undefined) {
    const dates = [...new Set(upcoming.map(b => b.booking_date))];
    const mostBooked = Math.max(0, ...dates.map(d => bookedCount(existing.id, d)));
    if (updates.capacity < mostBooked) {
      throw conflict(
        `An upcoming session already has ${mostBooked} bookings, so capacity cannot go below that.`,
        'CAPACITY_BELOW_BOOKINGS',
        { max_booked: mostBooked }
      );
    }
  }

  // Moving a class to another weekday removes the dates people booked, so those bookings are cancelled.
  let cancelled = 0;
  if (updates.day_of_week !== undefined && updates.day_of_week !== existing.day_of_week && upcoming.length > 0) {
    const ids = new Set(upcoming.map(b => b.id));
    const cancelledAt = now.toISOString();
    cancelled = ids.size;
    db.bookings = db.bookings.map(b => (ids.has(b.id) ? { ...b, status: 'cancelled' as const, cancelled_at: cancelledAt } : b));
  }

  const { booked_count: _ignored, ...base } = existing;
  const updated: GymClass = {
    ...base,
    ...updates,
    id: existing.id,
    ...(trainer ? { trainer_name: trainer.name, trainer_avatar: trainer.avatar_url } : {})
  };
  db.classes = db.classes.map(c => (c.id === existing.id ? updated : c));

  const message = cancelled > 0
    ? `Class updated. ${cancelled} upcoming booking${cancelled === 1 ? ' was' : 's were'} cancelled because the day changed.`
    : 'Class updated.';
  ok(res, presentClass(updated), message);
});

export const deleteClass = asyncHandler((req, res: Response) => {
  const existing = db.classes.find(c => c.id === req.params.id);
  if (!existing) throw notFound('That class does not exist.');

  const now = new Date();
  const cancelledAt = now.toISOString();
  let cancelled = 0;
  // Past bookings stay as history (they carry a snapshot of the class); future ones are cancelled.
  db.bookings = db.bookings.map(b => {
    if (b.class_id === existing.id && b.status === 'confirmed' && !hasStarted(existing.start_time, b.booking_date, now)) {
      cancelled++;
      return { ...b, status: 'cancelled' as const, cancelled_at: cancelledAt };
    }
    return b;
  });
  db.classes = db.classes.filter(c => c.id !== existing.id);

  ok(res, { cancelled_bookings: cancelled }, 'Class deleted.');
});
