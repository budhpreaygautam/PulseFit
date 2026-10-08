# Changelog

All notable changes to PulseFit. Versions follow [Semantic Versioning](https://semver.org/).

## [2.1.0] — 2026-10-07

v2.1 makes the app real and safe to run: every number on screen now comes from stored data,
money and access rules are enforced on the server, and the features the README already promised
(coach dashboard, real QR passes, payment history) exist.

### Security

- **Admin access without a password is gone.** `POST /api/auth/demo-login` and the persona switcher
  now exist only in demo mode, which is off by default outside local development.
- **No more account takeover by email.** `/auth/firebase-sync` trusted any email it was sent; it is
  replaced by `POST /api/auth/google`, which verifies a Google ID token against Google's keys.
- **No more free upgrades.** Registration creates an account without a plan, the profile endpoint
  accepts only name, phone and photo, and a plan is activated only by a verified payment or an admin.
- **Payments are priced by the server.** The amount, plan and billing cycle are fixed on a server-side
  order; the browser only chooses a plan. Signatures are checked in constant time, each payment
  activates once (checkout and webhook are idempotent), and annual plans charge the annual price.
- Password changes require the current password and revoke every older login token; password reset
  links are single-use and expire after 30 minutes.
- `JWT_SECRET` is required outside local development; the compiled build counts as production when
  `NODE_ENV` is unset; production never loads the demo accounts (first admin via `npm run create-admin`).
- Rate limits on sign-in, registration, password reset, Google sign-in and free trials; CORS
  allow-list; security headers (helmet); `TRUST_PROXY` setting; error details hidden in production.
- The public "who's on the floor" feed returns counts only; names are for staff and emails for no one.

### Added

- **Coach dashboard** (`/trainer`): upcoming classes, per-date rosters with attendance marking,
  clients, and assessment notes that can be shared with the member.
- **Payments ledger and invoices**: every payment is stored with an invoice number and period;
  members see their billing history and can print invoices; Razorpay webhook support.
- **Real QR passes**: each member's pass is a scannable QR code; the front-desk scanner can use the
  device camera, shows who was let in or refused and why, and accepts free-trial codes.
- **Free trials** are saved, give a code that works once on the chosen day, and appear as leads.
- **Admin pages** for the timetable and coaches, plans and pricing, and free-trial leads; member
  detail with visits and payments; admin password reset; attendance CSV export.
- **My bookings** with upcoming/past views; class capacity counted per date; bookings checked against
  the member's plan, membership dates and the 14-day window; cancellation keeps the history.
- Membership freeze/unfreeze that gives the frozen days back; renewals extend from the current expiry;
  switching plans credits unused days; memberships expire by date.
- Password reset page, 404 page, privacy/terms/refund pages, and real URLs for every page
  (refresh, back button and shared links work).
- `GET /api/config` so the client knows whether demo mode, Google sign-in and payments are available.
- 485 API tests (Vitest + supertest), 42 Playwright tests (every page, access rules, booking and
  cancelling, front-desk check-in, pricing) on desktop and mobile, and GitHub Actions CI.

### Changed

- Dashboards show only stored data: MRR, revenue, check-ins, fill rate, retention and peak hours are
  computed in India Standard Time from real records, with a one-line definition for each figure.
- Streaks count consecutive days with any activity (check-in, class, floor session, same-day workout).
- All dates and times use the gym's timezone (Asia/Kolkata) instead of UTC or the device clock.
- The client loads member, coach and admin areas on demand (first load 877 kB → 418 kB; charts load only where they are shown).
- The JSON database writes atomically, refuses to start on a corrupt file instead of wiping it,
  migrates v2.0 files on load, and is no longer tracked in git (seeded on first start).
- `docs/API.md` documents the whole API.

### Removed

- The simulated Firebase layer, the `firebase` and server-only `razorpay` packages from the client,
  `schema.sql`, and the payment test scripts that read a secret from one machine's disk.

### Fixed

- The API crashed on start without Razorpay keys; `npm run install:all` corrupted both package
  manifests; the old end-to-end script reported success when it failed.
- Every successful turnstile scan was shown as "Access denied"; new members' temporary passwords
  showed as "undefined"; "Join" buttons opened the sign-in form; bookings landed on the wrong day
  between midnight and 05:30 IST; and about 150 other defects found in the v2.0 audit.

## [2.0.0] — 2026-10-05

Published as the `version_2.0` pre-release: Strength and Zumba focus, Gurugram localisation,
INR pricing, member time tracking, fitness guide, Strength and Zumba pages.

## [1.0.0] — 2026-09-12

Initial release.
