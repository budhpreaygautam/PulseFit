import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { ApiError, asyncHandler, badRequest, conflict, ok, parse } from '../lib/http.js';
import { addDays, dayOfWeek, gymToday, isValidDate } from '../lib/dates.js';
import { newId } from '../lib/users.js';
import { TrialPass } from '../types/index.js';

export const TRIAL_WINDOW_DAYS = 14;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const trialBody = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name must be at most 60 characters.'),
    email: z.email('Enter a valid email address.').trim().toLowerCase(),
    phone: z
      .string()
      .trim()
      .max(20, 'Phone number is too long.')
      .refine(p => /^\+?[\d\s()-]+$/.test(p) && digits(p).length >= 10 && digits(p).length <= 15, 'Enter a valid phone number.'),
    interest: z.enum(['Workout & Strength', 'Zumba & Cardio']),
    preferred_date: z.string().refine(isValidDate, 'Use a date in YYYY-MM-DD format.')
  })
  .strict();

function digits(phone: string): string {
  return phone.replace(/\D/g, '');
}

// '+91 98111 23456' and '9811123456' are the same number.
function samePhone(a: string, b: string): boolean {
  const x = digits(a);
  const y = digits(b);
  return x.length >= 10 && y.length >= 10 && x.slice(-10) === y.slice(-10);
}

function newTrialCode(): string {
  for (;;) {
    const bytes = crypto.randomBytes(6);
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    const code = `PULSE-TRIAL-${suffix}`;
    if (!db.trial_passes.some(t => t.code === code)) return code;
  }
}

export const createTrial = asyncHandler((req: Request, res: Response) => {
  const body = parse(trialBody, req.body);
  const today = gymToday();
  const lastDay = addDays(today, TRIAL_WINDOW_DAYS);

  if (body.preferred_date < today || body.preferred_date > lastDay) {
    const message = `Pick a day between ${today} and ${lastDay}.`;
    throw new ApiError(400, `preferred_date: ${message}`, 'VALIDATION_ERROR', {
      issues: [{ path: 'preferred_date', message }]
    });
  }
  if (dayOfWeek(body.preferred_date) === 0) {
    throw badRequest('The gym is closed on Sundays. Please pick another day.', 'GYM_CLOSED');
  }
  if (db.trial_passes.some(t => t.email.toLowerCase() === body.email || samePhone(t.phone, body.phone))) {
    throw conflict('A free trial has already been claimed with this email or phone number.', 'TRIAL_ALREADY_CLAIMED');
  }

  const trial: TrialPass = {
    id: newId('trial'),
    code: newTrialCode(),
    name: body.name,
    email: body.email,
    phone: body.phone,
    interest: body.interest,
    valid_on: body.preferred_date,
    status: 'issued',
    created_at: new Date().toISOString()
  };
  db.trial_passes = [trial, ...db.trial_passes];

  return ok(res, trial, `Your free trial pass is ready for ${trial.valid_on}.`, 201);
});

export const listTrials = asyncHandler((_req: Request, res: Response) => {
  return ok(res, [...db.trial_passes].sort((a, b) => b.created_at.localeCompare(a.created_at)));
});
