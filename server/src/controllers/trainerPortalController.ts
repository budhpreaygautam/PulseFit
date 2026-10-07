import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, forbidden, notFound, ok, parse } from '../lib/http.js';
import { addDays, gymToday } from '../lib/dates.js';
import { effectiveStatus } from '../lib/membership.js';
import { newId } from '../lib/users.js';
import { byStart, hasStarted, nextOccurrenceOf, toOccurrence, trainerOfUser } from '../lib/occurrences.js';
import { Booking, TrainerNote, Trainer } from '../types/index.js';

const scopeQuery = z.object({
  trainer_id: z.preprocess(v => (v === '' ? undefined : v), z.string().optional())
});

const notesQuery = scopeQuery.extend({
  member_id: z.preprocess(v => (v === '' ? undefined : v), z.string().optional())
});

const createNoteSchema = z
  .object({
    member_id: z.string().min(1),
    category: z.enum(['assessment', 'progress', 'injury', 'general']),
    note: z.string().trim().min(1).max(2000),
    visible_to_member: z.boolean()
  })
  .strict();

/**
 * The trainer the request is about: a trainer's own linked record, or for an admin the one
 * named by ?trainer_id=. Returns null for an admin who names none (meaning "every trainer").
 */
function resolveTrainer(req: AuthenticatedRequest, trainerId: string | undefined): Trainer | null {
  const user = req.user!;
  if (user.role === 'admin') {
    if (!trainerId) return null;
    const trainer = db.trainers.find(t => t.id === trainerId);
    if (!trainer) throw notFound('That trainer does not exist.', 'NO_TRAINER_PROFILE');
    return trainer;
  }
  const trainer = trainerOfUser(user.id);
  if (!trainer) throw notFound('Your account is not linked to a trainer profile yet. Ask an admin to link it.', 'NO_TRAINER_PROFILE');
  return trainer;
}

/** Bookings for classes the trainer teaches (every class for an admin view without a trainer). */
function bookingsFor(trainer: Trainer | null): Booking[] {
  const classIds = new Set(db.classes.filter(c => !trainer || c.trainer_id === trainer.id).map(c => c.id));
  return db.bookings.filter(b => classIds.has(b.class_id));
}

function notesFor(trainer: Trainer | null): TrainerNote[] {
  if (!trainer) return db.trainer_notes;
  return trainer.user_id ? db.trainer_notes.filter(n => n.trainer_user_id === trainer.user_id) : [];
}

export const getTrainerMe = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { trainer_id } = parse(scopeQuery, req.query);
  const trainer = resolveTrainer(req, trainer_id);
  if (!trainer) throw notFound('Pass ?trainer_id= to view a trainer’s dashboard.', 'NO_TRAINER_PROFILE');

  const now = new Date();
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const classes = db.classes.filter(c => c.trainer_id === trainer.id);
  // Each weekly class occurs exactly once in the next 7 days.
  const upcoming = classes
    .map(c => toOccurrence(c, nextOccurrenceOf(c, now)))
    .filter(o => Date.parse(o.starts_at) < weekAhead)
    .sort(byStart);

  const today = gymToday(now);
  const monthAgo = addDays(today, -30);
  const recent = bookingsFor(trainer).filter(b => b.booking_date >= monthAgo && b.booking_date <= today);
  const attended = recent.filter(b => b.status === 'attended').length;
  const noShows = recent.filter(b => b.status === 'no_show').length;

  ok(res, {
    trainer,
    upcoming,
    stats: {
      classes_per_week: classes.length,
      booked_next_7_days: upcoming.reduce((sum, o) => sum + o.booked_count, 0),
      // Only sessions the trainer has marked count: unmarked bookings are unknown, not missed.
      attendance_rate_30d: attended + noShows > 0 ? Math.round((attended / (attended + noShows)) * 100) : null,
      clients_count: clientIds(trainer).size
    }
  });
});

/** Members who booked the trainer's classes or have a note from them. */
function clientIds(trainer: Trainer | null): Set<string> {
  const ids = new Set<string>();
  for (const b of bookingsFor(trainer)) if (b.status !== 'cancelled') ids.add(b.user_id);
  for (const n of notesFor(trainer)) ids.add(n.member_id);
  return new Set([...ids].filter(id => db.users.some(u => u.id === id)));
}

export const getTrainerClients = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { trainer_id } = parse(scopeQuery, req.query);
  const trainer = resolveTrainer(req, trainer_id);
  const now = new Date();
  const bookings = bookingsFor(trainer);
  const notes = notesFor(trainer);
  const startTimes = new Map(db.classes.map(c => [c.id, c.start_time]));

  const clients = [...clientIds(trainer)]
    .map(id => db.users.find(u => u.id === id)!)
    .map(user => {
      const mine = bookings.filter(b => b.user_id === user.id);
      const attendedDates = mine.filter(b => b.status === 'attended').map(b => b.booking_date).sort();
      return {
        user_id: user.id,
        name: user.name,
        avatar_url: user.avatar_url,
        membership_tier: user.membership_tier,
        membership_status: effectiveStatus(user),
        sessions_attended: attendedDates.length,
        last_attended: attendedDates.length ? attendedDates[attendedDates.length - 1] : null,
        upcoming_bookings: mine.filter(
          b => b.status === 'confirmed' && !hasStarted(startTimes.get(b.class_id) ?? '00:00', b.booking_date, now)
        ).length,
        notes_count: notes.filter(n => n.member_id === user.id).length
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  ok(res, clients);
});

export const getTrainerNotes = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { trainer_id, member_id } = parse(notesQuery, req.query);
  let notes = notesFor(resolveTrainer(req, trainer_id));
  if (member_id) notes = notes.filter(n => n.member_id === member_id);
  ok(res, [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

export const createTrainerNote = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const body = parse(createNoteSchema, req.body);
  const author = req.user!;
  const trainer = author.role === 'admin' ? trainerOfUser(author.id) ?? null : resolveTrainer(req, undefined);

  const member = db.users.find(u => u.id === body.member_id && u.role === 'member');
  if (!member) throw notFound('That member does not exist.');
  // A note makes the member one of the trainer's clients, which shows their plan and status;
  // so a trainer may only write about members who book their classes.
  if (author.role !== 'admin' && !bookingsFor(trainer).some(b => b.user_id === member.id && b.status !== 'cancelled')) {
    throw forbidden('You can only write notes about members who book your classes.', 'NOT_YOUR_CLIENT');
  }

  const note: TrainerNote = {
    id: newId('note'),
    trainer_user_id: author.id,
    trainer_name: trainer?.name ?? author.name,
    member_id: member.id,
    category: body.category,
    note: body.note,
    visible_to_member: body.visible_to_member,
    created_at: new Date().toISOString()
  };
  db.trainer_notes = [...db.trainer_notes, note];
  ok(res, note, 'Note saved.', 201);
});

export const deleteTrainerNote = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  const note = db.trainer_notes.find(n => n.id === req.params.id);
  if (!note) throw notFound('That note does not exist.');
  if (note.trainer_user_id !== user.id && user.role !== 'admin') {
    throw forbidden('Only the trainer who wrote this note can delete it.');
  }
  db.trainer_notes = db.trainer_notes.filter(n => n.id !== note.id);
  ok(res, { deleted: true }, 'Note deleted.');
});

export const getMyNotes = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const notes = db.trainer_notes
    .filter(n => n.member_id === req.user!.id && n.visible_to_member)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  ok(res, notes);
});
