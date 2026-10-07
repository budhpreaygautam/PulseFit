import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, notFound, ok, parse } from '../lib/http.js';
import { newId, defaultAvatar } from '../lib/users.js';
import { byStart, nextOccurrenceOf, publicTrainer, toOccurrence } from '../lib/occurrences.js';
import { Trainer } from '../types/index.js';

const trainerFields = {
  name: z.string().trim().min(2).max(60),
  email: z.email().max(120),
  phone: z.string().trim().max(30),
  specialties: z.array(z.string().trim().min(1).max(60)).max(10),
  bio: z.string().trim().min(1).max(1000),
  experience_years: z.number().int().min(0).max(60),
  rating: z.number().min(0).max(5),
  reviews_count: z.number().int().min(0),
  avatar_url: z.url({ protocol: /^https?$/ }),
  instagram: z.string().trim().max(60),
  // Links the trainer record to a user account with role 'trainer' (the trainer portal login).
  user_id: z.string().min(1).nullable()
};

const createSchema = z
  .object({
    ...trainerFields,
    phone: trainerFields.phone.default(''),
    specialties: trainerFields.specialties.default([]),
    experience_years: trainerFields.experience_years.default(0),
    rating: trainerFields.rating.default(0),
    reviews_count: trainerFields.reviews_count.default(0),
    avatar_url: trainerFields.avatar_url.optional(),
    instagram: trainerFields.instagram.default(''),
    user_id: trainerFields.user_id.optional()
  })
  .strict();

const updateSchema = z.object(trainerFields).partial().strict();

const deleteQuery = z.object({
  reassign_to: z.preprocess(v => (v === '' ? undefined : v), z.string().optional())
});

function assertEmailFree(email: string, exceptId?: string) {
  const taken = db.trainers.some(t => t.id !== exceptId && t.email.toLowerCase() === email.toLowerCase());
  if (taken) throw conflict('Another trainer already uses that email address.', 'EMAIL_TAKEN');
}

function assertLinkableUser(userId: string, exceptTrainerId?: string) {
  const user = db.users.find(u => u.id === userId);
  if (!user || user.role !== 'trainer') {
    throw badRequest('user_id must be an account with the trainer role.', 'USER_NOT_TRAINER');
  }
  if (db.trainers.some(t => t.id !== exceptTrainerId && t.user_id === userId)) {
    throw conflict('That account is already linked to another trainer.', 'USER_ALREADY_LINKED');
  }
}

export const getTrainers = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const trainers = db.trainers.map(t => ({
    ...publicTrainer(t, req.user),
    classes_count: db.classes.filter(c => c.trainer_id === t.id).length
  }));
  ok(res, trainers);
});

export const getTrainerById = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const trainer = db.trainers.find(t => t.id === req.params.id);
  if (!trainer) throw notFound('That trainer does not exist.');

  const now = new Date();
  const classes = db.classes
    .filter(c => c.trainer_id === trainer.id)
    .map(c => toOccurrence(c, nextOccurrenceOf(c, now), req.user?.id))
    .sort(byStart);
  ok(res, { ...publicTrainer(trainer, req.user), classes });
});

export const createTrainer = asyncHandler((req, res: Response) => {
  const body = parse(createSchema, req.body);
  assertEmailFree(body.email);
  if (body.user_id) assertLinkableUser(body.user_id);

  const { user_id, avatar_url, ...fields } = body;
  const trainer: Trainer = {
    id: newId('trn'),
    ...fields,
    avatar_url: avatar_url ?? defaultAvatar(body.name),
    ...(user_id ? { user_id } : {})
  };
  db.trainers = [...db.trainers, trainer];
  ok(res, trainer, 'Trainer added.', 201);
});

export const updateTrainer = asyncHandler((req, res: Response) => {
  const updates = parse(updateSchema, req.body);
  const existing = db.trainers.find(t => t.id === req.params.id);
  if (!existing) throw notFound('That trainer does not exist.');
  if (updates.email) assertEmailFree(updates.email, existing.id);
  if (updates.user_id) assertLinkableUser(updates.user_id, existing.id);

  const { user_id, ...fields } = updates;
  const { user_id: _oldLink, ...base } = existing;
  const updated: Trainer = {
    ...base,
    ...fields,
    id: existing.id,
    // null unlinks the account; omitted keeps the current link.
    ...(user_id === null ? {} : { user_id: user_id ?? existing.user_id })
  };
  if (updated.user_id === undefined) delete updated.user_id;
  db.trainers = db.trainers.map(t => (t.id === existing.id ? updated : t));

  if (updated.name !== existing.name || updated.avatar_url !== existing.avatar_url) {
    db.classes = db.classes.map(c =>
      c.trainer_id === existing.id ? { ...c, trainer_name: updated.name, trainer_avatar: updated.avatar_url } : c
    );
  }
  ok(res, updated, 'Trainer updated.');
});

export const deleteTrainer = asyncHandler((req, res: Response) => {
  const { reassign_to } = parse(deleteQuery, req.query);
  const existing = db.trainers.find(t => t.id === req.params.id);
  if (!existing) throw notFound('That trainer does not exist.');

  const assigned = db.classes.filter(c => c.trainer_id === existing.id);
  if (assigned.length > 0) {
    if (!reassign_to) {
      throw conflict(
        `${existing.name} still teaches ${assigned.length} class${assigned.length === 1 ? '' : 'es'}. Choose a trainer to take them over.`,
        'TRAINER_HAS_CLASSES',
        { classes: assigned.map(c => ({ id: c.id, title: c.title })) }
      );
    }
    const replacement = db.trainers.find(t => t.id === reassign_to);
    if (!replacement || replacement.id === existing.id) {
      throw badRequest('The trainer to reassign the classes to does not exist.', 'TRAINER_NOT_FOUND');
    }
    db.classes = db.classes.map(c =>
      c.trainer_id === existing.id
        ? { ...c, trainer_id: replacement.id, trainer_name: replacement.name, trainer_avatar: replacement.avatar_url }
        : c
    );
  }

  db.trainers = db.trainers.filter(t => t.id !== existing.id);
  ok(res, { deleted: true, reassigned_classes: assigned.length }, 'Trainer removed.');
});
