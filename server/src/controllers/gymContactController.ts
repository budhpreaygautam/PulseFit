import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, ok, parse } from '../lib/http.js';
import { SOCIAL_HOSTS, indianPhone, isLinkOn } from '../lib/gymContact.js';
import { GymContact } from '../types/index.js';
import { contactFields } from './trialController.js';

// Admin › Plans & rewards › Gym contact. Everyone sees the result in GET /config, so every value is
// checked: a typo would break every call, WhatsApp or email button.

const PHONE_HINT = 'Enter an Indian mobile or landline number, for example +91 98110 12345 or 0124 456 7890.';

const phoneField = z
  .string()
  .trim()
  .max(20, 'Phone number is too long.')
  .transform((value, ctx) => {
    if (value === '') return value;
    const phone = indianPhone(value);
    if (!phone) ctx.addIssue({ code: 'custom', message: PHONE_HINT });
    return phone ?? value;
  });

const linkField = (network: string, hosts: readonly string[]) =>
  z
    .string()
    .trim()
    .max(300, 'Link is too long.')
    .refine(link => link === '' || isLinkOn(link, hosts), `Paste the https:// address of the gym's ${network} page, on ${hosts.join(' or ')}.`)
    .default('');

const contactBody = z
  .object({
    phone: phoneField.refine(phone => phone !== '', 'Enter the phone number.'),
    whatsapp: phoneField.default(''),
    email: contactFields.email,
    instagram: linkField('Instagram', SOCIAL_HOSTS.instagram),
    facebook: linkField('Facebook', SOCIAL_HOSTS.facebook),
    youtube: linkField('YouTube', SOCIAL_HOSTS.youtube),
    x: linkField('X', SOCIAL_HOSTS.x)
  })
  .strict();

export const getGymContact = asyncHandler<AuthenticatedRequest>((_req, res: Response) => ok(res, db.gym_contact));

/** Replace the contact details; phones are stored as +91 and 10 digits. */
export const updateGymContact = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const next: GymContact = parse(contactBody, req.body);
  db.gym_contact = next;
  db.saveSync();
  return ok(res, next, 'Gym contact details saved.');
});
