# Email sending, ready for the gym's work email — design (short)

Approved by the owner on 2026-11-21 ("Approved").

The owner asked whether email works (it does not: Brevo is not configured) and to set up a work email
and phone; they then picked "Email sending, ready for later". The server already sends contact-form
emails through Brevo's HTTP API (`server/src/lib/mailer.ts`, `emailConfigured()` = `BREVO_API_KEY` and
`MAIL_FROM` set). This adds three transactional emails on the same path.

## Goals

- **Password-reset links** by email when email is configured (today production tells people to ask
  the front desk). Same reply whether or not the account exists, link valid 30 minutes as now.
- **Booking confirmation** when a member books a class (class, coach, date and time, how to cancel).
- **Payment receipt** when a payment activates a plan (plan, amount, period, payment reference).
- Each email carries the gym's name, address and phone from the Gym contact setting; replies go to
  the gym's inbox (`ENQUIRY_INBOX`, else `MAIL_FROM`).
- Until the owner adds the Brevo key, nothing changes: no email, the desk message for resets.

## Non-goals and anti-goals

- Non-goals: marketing emails, cancellation or reminder emails (the owner chose "Approved", not the
  extra option), an email preferences page, setting up Brevo itself.
- Anti-goals: an action failing or waiting because email failed (send after the response, log only the
  record id and the error, never addresses or names); revealing whether an account exists; personal
  data in logs; an email sent when the key is missing.

## Approaches

- **A, Brevo HTTP API through the existing mailer (picked):** already used for enquiries; Railway
  blocks SMTP on the current plan.
- B, SMTP: blocked on Railway below its Pro plan. C, another provider: a second integration for nothing.

## Left to the builder

- The plain-text and HTML layout (match the enquiry emails), subject lines, the reset link's address
  (the site's public URL), tests with the mailer's sender stubbed, and the deploy docs listing the
  variables.
