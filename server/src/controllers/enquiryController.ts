import { Request, Response } from 'express';
import { z } from 'zod';
import config, { emailConfigured } from '../config.js';
import db from '../db/database.js';
import { asyncHandler, notFound, ok, parse } from '../lib/http.js';
import { sendMail, type Mail } from '../lib/mailer.js';
import { GYM, escapeHtml, siteUrl } from '../lib/seo.js';
import { newId } from '../lib/users.js';
import { Enquiry } from '../types/index.js';
import { contactFields } from './trialController.js';

// The public enquiry form (/contact) and the admin Leads page. Enquiries are saved before any email.

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 365; // the privacy policy promises 12 months
const THANKS = 'Thanks! We have your enquiry and will get back to you during opening hours.';

const enquiryBody = z
  .object({
    ...contactFields,
    interest: z.enum(['Workout & Strength', 'Zumba & Cardio', 'All-Access', 'Not sure yet']),
    contact_time: z.enum(['Any time', 'Morning', 'Afternoon', 'Evening']),
    message: z.string().trim().max(1000, 'Keep your message to 1,000 characters.').default(''),
    consent: z.literal(true, 'Please agree to be contacted about your enquiry.'),
    // Trap field: people never see it (ContactPage), so anything in it means a bot.
    website: z.string().max(200).optional()
  })
  .strict();

const statusBody = z.object({ status: z.enum(['new', 'contacted', 'closed']) }).strict();

// shortcut: expired enquiries leave the file only when a new one arrives (the list already hides them); add a daily sweep if the form goes quiet for months.
const recentEnquiries = (now: Date) => db.enquiries.filter(e => now.getTime() - Date.parse(e.created_at) < KEEP_DAYS * DAY_MS);

const paragraphs = (lines: string[]) => lines.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

/** To the gym: every detail, with Reply-To set to the enquirer. No free text in the subject. */
function notification(e: Enquiry): Mail {
  const rows: [string, string][] = [
    ['Name', e.name],
    ['Mobile', e.phone],
    ['Email', e.email],
    ['Interested in', e.interest],
    ['Best time to call', e.contact_time],
    ['Message', e.message || '—']
  ];
  const site = siteUrl();
  const link = site ? `${site}/admin/trials` : '';
  const footer = ['Reply to this email to answer them.', ...(link ? [`All enquiries: ${link}`] : [])];
  return {
    to: config.mail.inbox,
    replyTo: e.email,
    // The phone also stops Gmail threading every enquiry into one conversation.
    subject: `New enquiry: ${e.interest} (${e.phone})`,
    text: [...rows.map(([label, value]) => `${label}: ${value}`), '', ...footer].join('\n'),
    html:
      '<table cellpadding="4">' +
      rows
        .map(([label, value]) => `<tr><th align="left" valign="top">${label}</th><td style="white-space:pre-wrap">${escapeHtml(value)}</td></tr>`)
        .join('') +
      '</table>' +
      paragraphs(footer.slice(0, 1)) +
      (link ? `<p>All enquiries: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : '')
  };
}

/** To the enquirer: fixed text only, since anyone can type someone else's address. */
function confirmation(e: Enquiry): Mail {
  const lines = [
    'Hello,',
    `Thank you for contacting ${GYM.name}. Our front desk will call you back during opening hours, at the time you asked for where we can.`,
    'To add anything, just reply to this email.',
    'If you did not contact us, you can ignore this email.',
    `${GYM.name}\n${GYM.streetAddress}, ${GYM.addressLocality}\n${GYM.telephone}`
  ];
  return {
    to: e.email,
    replyTo: config.mail.inbox,
    subject: `We have your enquiry · ${GYM.name}`,
    text: lines.join('\n\n'),
    html: paragraphs(lines)
  };
}

async function emailEnquiry(enquiry: Enquiry, confirm: boolean): Promise<void> {
  const mails = { notification: notification(enquiry), ...(confirm ? { confirmation: confirmation(enquiry) } : {}) };
  await Promise.all(
    Object.entries(mails).map(([kind, mail]) =>
      // The id and the reason only: no names or addresses in the log.
      sendMail(mail).catch((err: unknown) =>
        console.error(`✉️  Enquiry ${enquiry.id}: the ${kind} email failed (${err instanceof Error ? err.message : 'unknown error'})`)
      )
    )
  );
}

export const createEnquiry = asyncHandler((req: Request, res: Response) => {
  const { consent: _agreed, website, ...body } = parse(enquiryBody, req.body);
  if (website) return ok(res, null, THANKS, 201); // same answer as a real one; nothing stored or sent
  const now = new Date();
  const enquiry: Enquiry = { id: newId('enq'), ...body, status: 'new', created_at: now.toISOString() };
  // One confirmation per address a day, so the form cannot be used to flood someone else's inbox.
  const confirm = !db.enquiries.some(e => e.email === enquiry.email && now.getTime() - Date.parse(e.created_at) < DAY_MS);
  db.enquiries = [enquiry, ...recentEnquiries(now)];
  ok(res, null, THANKS, 201);
  // Saved first, emailed after the answer: a slow or failing mail service never delays or fails the form.
  if (emailConfigured()) void emailEnquiry(enquiry, confirm);
});

export const listEnquiries = asyncHandler((_req: Request, res: Response) => {
  return ok(res, recentEnquiries(new Date()).sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

export const updateEnquiryStatus = asyncHandler((req: Request, res: Response) => {
  const { status } = parse(statusBody, req.body);
  const existing = db.enquiries.find(e => e.id === req.params.id);
  if (!existing) throw notFound('This enquiry no longer exists.', 'ENQUIRY_NOT_FOUND');
  const updated: Enquiry = { ...existing, status };
  db.enquiries = db.enquiries.map(e => (e.id === updated.id ? updated : e));
  return ok(res, updated);
});
