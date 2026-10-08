# PulseFit API reference (v2.1)

Base path: `/api`. All bodies are JSON. Every endpoint is implemented by exactly one domain
(the "Owner" line under each section), in `server/src/routes/<owner>.ts`.

## Conventions

**Envelope.** Success: `{ "success": true, "data": …, "message"?: "…" }`.
Failure: `{ "success": false, "error": "<sentence a member can read>", "code"?: "UPPER_SNAKE", "data"?: … }`.
Clients branch on `code`, never on the `error` text.

Common codes: `VALIDATION_ERROR` (400, `data.issues = [{ path, message }]`), `UNAUTHORIZED` (401: missing,
invalid, expired or revoked token; the client signs the user out), `FORBIDDEN` (403), `NOT_FOUND` (404),
`RATE_LIMITED` (429), `INTERNAL` (500).

**Auth.** `Authorization: Bearer <token>`. Tokens last 7 days and are revoked when the password changes
or is reset (`token_version`).

**Dates.** `YYYY-MM-DD` strings are calendar days **at the gym** (`Asia/Kolkata`); `HH:MM` times are
gym-local; instants are ISO-8601 UTC strings. "Today" always means today at the gym.

**SafeUser** (the only user shape the API returns):

```ts
{
  id, email, name, role: 'member' | 'trainer' | 'admin', avatar_url, phone,
  membership_tier: 'none' | 'basic' | 'pro' | 'vip',
  membership_status: 'active' | 'expired' | 'pending' | 'frozen', // effective today: past expiry => 'expired'
  membership_expiry: string | null,  // last day of access, inclusive
  frozen_since?: string | null,
  qr_code_token: string,             // the member's turnstile pass, rendered as a QR code
  created_at, streak_days: number,   // current streak (0 once lapsed)
  last_active_date?: string | null
}
```

**Plans and entitlements.** `basic` = Workout & Strength Pass (books `Workout & Strength` classes),
`pro` = Zumba & Cardio Pass (books `Zumba & Cardio`), `vip` = Dual All-Access (books everything).
Read from `membership_plans[].categories` (empty = all). Prices live only in the plan catalogue.

---

## Runtime config — owner: platform

### `GET /config` (public)
`{ demoMode: boolean, googleClientId: string | null, payments: { enabled: boolean, keyId: string | null }, gym: { name, timezone, currency, hours: { opensAt: '06:00', closesAt: '22:00', closedWeekdays: [0], enforced: boolean } } }`.
The client hides the demo persona switcher, "Continue with Google" and checkout when they are off.
`hours` is the gym's opening hours in gym time (`closedWeekdays`: 0 = Sunday). `enforced` mirrors `ENFORCE_OPENING_HOURS`:
when on, check-ins, floor clock-ins and same-day free trials are refused while the gym is closed.

### `GET /health`
`{ status: 'ok', timestamp }`.

---

## Auth & account — owner: `auth` (routes/auth.ts, controllers/authController.ts)

Rate limits (per IP, disabled in tests): login 10 per 15 min, register 5 per hour, forgot-password 5 per hour,
google 20 per 15 min → `429 RATE_LIMITED`.

| Method & path | Body | Success `data` | Errors |
|---|---|---|---|
| `POST /auth/login` | `{ email, password }` | `{ token, user }` | 401 `INVALID_CREDENTIALS` |
| `POST /auth/register` | `{ name (2–60), email, password (8–72, ≥1 letter and ≥1 digit), phone? }` | 201 `{ token, user }` with `membership_tier:'none'`, `membership_status:'pending'`, `membership_expiry:null` | 409 `EMAIL_TAKEN` |
| `POST /auth/google` | `{ credential }` (Google Identity Services ID token) | `{ token, user, created: boolean }` | 503 `GOOGLE_SIGNIN_DISABLED`, 401 `INVALID_GOOGLE_TOKEN` |
| `POST /auth/demo-login` | `{ role: 'member' \| 'vip' \| 'trainer' \| 'admin' }` | `{ token, user }` | 404 `DEMO_DISABLED` when demo mode is off |
| `GET /auth/me` | — | `SafeUser` | 401 |
| `PUT /auth/profile` | `{ name?, phone?, avatar_url? }` **only** (unknown keys → 400). `avatar_url`: https URL or `data:image/(png\|jpeg\|webp);base64,…` ≤ 350 000 chars | `SafeUser` | 400 |
| `PUT /auth/password` | `{ currentPassword?, newPassword }` (`currentPassword` required when the account has a password) | `{ token, user }` (old tokens are revoked) | 400 `WRONG_PASSWORD` |
| `POST /auth/forgot-password` | `{ email }` | `{ message, resetUrl? }`. The same message whether or not the account exists. `resetUrl` (`<origin>/reset-password?token=…`) is returned only in demo mode or outside production, because this server has no email delivery; it is also logged to the server console | 429 |
| `POST /auth/reset-password` | `{ token, newPassword }` | `{ token, user }` | 400 `INVALID_RESET_TOKEN` (unknown, used, or older than 30 min) |

Google accounts are matched by Google subject id, then by verified email (linking the account). New Google
users are created like a registration (tier `none`, status `pending`). An existing user's name is never overwritten.
`POST /auth/firebase-sync` no longer exists.

Additional rules:
- `POST /auth/google` can also answer 409 `GOOGLE_ACCOUNT_CONFLICT` (the verified email belongs to an account already
  linked to a different Google account). Linking an existing password account to Google removes its password and
  revokes older tokens; `data.created` is `false` and the message says so. New and existing users both get 200.
- `PUT /auth/password`: a missing `currentPassword` on an account that has one is 400 `VALIDATION_ERROR`
  (`data.issues[0].path = "currentPassword"`); a wrong one is 400 `WRONG_PASSWORD`. Limited to 10 per 15 minutes per account.
- `POST /auth/forgot-password`: outside production `resetUrl` is returned for any existing account. In production it is
  returned only when `DEMO_MODE` is on **and** the email is one of the four demo personas; otherwise the message asks the
  member to get a reset link from the front desk. The message never reveals whether an account exists.
- `POST /auth/demo-login`: `role` is optional and defaults to `member`.

---

## Plans, payments & membership — owner: `payments` (routes/payments.ts, controllers/planController.ts, paymentController.ts, membershipController.ts)

| Method & path | Body | Success `data` | Errors |
|---|---|---|---|
| `GET /plans` | — | `MembershipPlan[]` sorted by monthly price | |
| `PUT /plans/:id` (admin) | `{ name?, description?, price_monthly? (int 1–100000), price_annual? (int), features?: string[], categories?: ClassCategory[], is_popular?, badge? }` | `MembershipPlan` | 404 |
| `POST /payment/create-order` | `{ tier: 'basic'\|'pro'\|'vip', billing_cycle: 'monthly'\|'annual' }` | `{ orderId, amount (paise), amount_inr, currency:'INR', keyId, tier, billing_cycle, plan_name, description }` | 503 `PAYMENTS_DISABLED` |
| `POST /payment/verify` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ user, token, payment, message }` | 400 `INVALID_SIGNATURE`, 404 `ORDER_NOT_FOUND`, 403 `ORDER_NOT_YOURS`, 409 `ALREADY_PROCESSED` (`data.user` = current user) |
| `POST /payment/webhook` | raw Razorpay webhook, header `X-Razorpay-Signature` | `{ received: true }` | 400 bad signature, 503 no webhook secret |
| `GET /payments/my` | — | `Payment[]` newest first (the member's invoices) | |
| `GET /payments` (admin) | query `user_id?` | `Payment[]` newest first | |
| `POST /membership/freeze` | `{}` | `SafeUser` (status `frozen`, `frozen_since` today) | 409 `NOT_ACTIVE` |
| `POST /membership/unfreeze` | `{}` | `SafeUser` (status `active`, expiry pushed back by the days frozen) | 409 `NOT_FROZEN` |

The amount is always taken from the plan, never from the client. The tier and cycle are fixed on the server-side
order record when it is created; verify reads them from that record. A signature can activate an order only once
(checkout and webhook are idempotent with each other).

Additional rules:
- `POST /payment/create-order` answers 502 `PAYMENT_PROVIDER_ERROR` when Razorpay cannot be reached.
- `POST /payment/verify` answers 409 `ORDER_REJECTED` when the webhook already reported a payment for the order with a
  wrong amount or currency; such an order never activates a membership.
- `POST /payment/webhook`: 503 `WEBHOOK_DISABLED`, 400 `INVALID_SIGNATURE`, 400 `BAD_PAYLOAD`. Events for unknown orders,
  repeats and mismatched amounts are acknowledged with 200 so Razorpay stops retrying.
- `PUT /plans/:id` rejects unknown keys (`id` and `tier` are immutable); limits: name 2–80, description ≤ 500,
  price_annual 1–1 200 000, ≤ 20 features of ≤ 200 chars, badge ≤ 30 (an empty badge removes it).
- Invoice numbers come from one global sequence; the year prefix is the gym-local year of the payment.
- A payment captured after its member was deleted marks the order `orphaned` (with the Razorpay payment id) and is
  logged for a manual refund; it activates nothing.
- Buying a plan and freezing are open to any signed-in account.

**Activation rules.** `months` = 1 (monthly) or 12 (annual), using calendar months.
- Same tier, membership active: the new period starts the day after the current expiry.
- Otherwise the period starts today. Any unused days of a still-active different plan are credited:
  `floor(remaining_days × old_price_monthly ÷ new_price_monthly)` extra days.
- A frozen member who pays is unfrozen first (expiry extended by the frozen days).
- Result: `membership_tier` = purchased tier, `membership_status` = `active`, `membership_expiry` = period end.
  A `Payment` is stored with invoice number `PF-<year>-<6-digit sequence>`.

---

## Classes, bookings, trainers & trainer portal — owner: `classes` (routes/classes.ts, controllers/classController.ts, bookingController.ts, trainerController.ts, trainerPortalController.ts)

Classes are weekly templates. **Capacity is per occurrence** (class + date): `booked_count` = bookings with
status `confirmed` or `attended` for that date. Stored classes carry no counter.

**ClassOccurrence** = `GymClass` fields + `{ occurrence_date, starts_at (ISO), booked_count, spots_left, is_full, my_booking_id: string | null }`.
`trainer_name` / `trainer_avatar` always come from the current trainer record.

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /classes` | `day?, category?, trainerId?, intensity?, search?, week_start?` (a Monday). Without `week_start`, `occurrence_date` is the next occurrence that has not started yet | `ClassOccurrence[]` sorted by `starts_at` | 400 |
| `GET /classes/:id` | `date?` | `ClassOccurrence & { trainer }` | 404 |
| `POST /classes` (admin) | `{ title, category, trainer_id, day_of_week (0–6), start_time (HH:MM), duration_minutes (15–180), room, capacity (1–200), intensity, description, image_url, calories_burn_est }` | `GymClass` | 400 `TRAINER_NOT_FOUND` |
| `PUT /classes/:id` (admin) | any subset of the above (id is immutable) | `GymClass` | |
| `DELETE /classes/:id` (admin) | — | `{ cancelled_bookings: number }` (future confirmed bookings are cancelled) | |
| `GET /bookings/my` | `scope = upcoming (default) \| past \| all` | `MyBooking[]`: booking + `class_title, category, start_time, room, trainer_name, image_url, duration_minutes, starts_at, can_cancel`. `upcoming` = confirmed and not started; `past` = started (any status but cancelled); `all` includes cancelled | |
| `POST /bookings` (members only) | `{ class_id, booking_date }` | 201 `Booking` | 403 `MEMBERS_ONLY`, 400 `DATE_MISMATCH` (wrong weekday), 400 `CLASS_STARTED`, 400 `TOO_FAR_AHEAD` (> 14 days), 403 `MEMBERSHIP_INACTIVE` (`data.status`), 403 `MEMBERSHIP_ENDS_BEFORE_CLASS` (`data.membership_expiry`), 403 `PLAN_EXCLUDES_CATEGORY`, 409 `CLASS_FULL`, 409 `ALREADY_BOOKED`, 404 |
| `DELETE /bookings/:id` | — (owner or admin) | `Booking` with status `cancelled` | 409 `ALREADY_CANCELLED`, 400 `CLASS_STARTED` |
| `PATCH /bookings/:id/attendance` | `{ status: 'attended' \| 'no_show' \| 'confirmed' }` (admin or the class's trainer; from 15 min before start) | `Booking` | 400 `CLASS_NOT_STARTED`, 403 `NOT_YOUR_CLASS` |
| `GET /bookings/class/:classId/roster` | `date?` (default next occurrence) (admin or the class's trainer) | `{ class: ClassOccurrence, date, attendees: [{ booking_id, user_id, user_name, user_email, user_phone, user_avatar, user_tier, status, booked_at }] }` | 403 `NOT_YOUR_CLASS` |
| `GET /trainers` | — | `Trainer[]` + `classes_count` (real) | |
| `GET /trainers/:id` | — | `Trainer & { classes: ClassOccurrence[] }` | 404 |
| `POST/PUT /trainers(/:id)` (admin) | trainer fields, validated | `Trainer` | |
| `DELETE /trainers/:id` (admin) | `reassign_to?` (query) | `{ deleted: true, reassigned_classes }` | 409 `TRAINER_HAS_CLASSES` (`data.classes = [{ id, title }]`) |

**Trainer portal** (role `trainer`, linked through `trainers.user_id`; admins may pass `?trainer_id=`):

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /trainer/me` | — | `{ trainer, upcoming: ClassOccurrence[] (next 7 days), stats: { classes_per_week, booked_next_7_days, attendance_rate_30d: number \| null, clients_count } }` | 404 `NO_TRAINER_PROFILE` |
| `GET /trainer/clients` | — | `[{ user_id, name, avatar_url, membership_tier, membership_status, sessions_attended, last_attended: string \| null, upcoming_bookings, notes_count }]` | |
| `GET /trainer/notes` | `member_id?` | `TrainerNote[]` (a trainer sees their own; an admin sees all) | |
| `POST /trainer/notes` | `{ member_id, category: 'assessment'\|'progress'\|'injury'\|'general', note (1–2000), visible_to_member: boolean }` | 201 `TrainerNote` | 404 member |
| `DELETE /trainer/notes/:id` | — (author or admin) | `{ deleted: true }` | |
| `GET /notes/my` (member) | — | `TrainerNote[]` about me where `visible_to_member` | |

When a booking is marked `attended`, it counts towards the member's streak for that day.

Additional rules:
- `GET /classes/:id?date=` and the roster answer 400 `DATE_MISMATCH` for a date that is not a session of the class
  (its current weekday, or a date that still has bookings for it).
- `POST /bookings` checks `ALREADY_BOOKED` before `CLASS_FULL`, so a retry always gets the same answer.
- Spots a member can no longer use are released automatically: freezing a membership (by the member or an admin)
  cancels their upcoming confirmed bookings and closes an open floor session; changing a class's category, a
  member's tier, or a plan's categories cancels upcoming bookings the member's plan no longer covers. The response
  `message` says how many were cancelled.
- `PUT /classes/:id`: 409 `CAPACITY_BELOW_BOOKINGS` (`data.max_booked`) when the new capacity is below an occurrence's
  bookings; moving a class to another weekday cancels its upcoming confirmed bookings.
- `POST/PUT /trainers`: 409 `EMAIL_TAKEN`, 400 `USER_NOT_TRAINER`, 409 `USER_ALREADY_LINKED`; `user_id: null` unlinks the account.
- Public trainer data (`GET /trainers`, `GET /trainers/:id`, the `trainer` in `GET /classes/:id`) leaves out email, phone
  and user_id unless the caller is an admin.
- `PATCH /bookings/:id/attendance` on a cancelled booking: 409 `ALREADY_CANCELLED`. `DELETE /bookings/:id` on an attended
  or no-show booking: 400 `CLASS_STARTED`.
- Trainer notes: 404 `NO_TRAINER_PROFILE` for a trainer account not linked to a trainer record; 403 `NOT_YOUR_CLIENT` when
  the member has never booked one of the trainer's classes (admins are exempt).

---

## Members, check-in, attendance & trials — owner: `members` (routes/members.ts, controllers/memberController.ts, attendanceController.ts, trialController.ts)

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /members` (admin) | `search?, tier?, status?` (effective status), `role?` (default `member`; `all` = everyone) | `SafeUser[]` | |
| `GET /members/:id` (admin) | — | `SafeUser & { bookings_count, attendance_count, workouts_count, upcoming_bookings, recent_attendance: AttendanceLog[] (10), payments: Payment[] }` | 404 |
| `POST /members` (admin) | `{ name, email, phone?, role? = 'member', membership_tier? = 'none', expiry_months? = 0 (0–24) }`. Tier ≠ none and months > 0 ⇒ active until the day before today + months | 201 `{ member: SafeUser, tempPassword }` | 409 `EMAIL_TAKEN` |
| `PUT /members/:id` (admin) | `{ name?, phone?, role?, membership_tier?, membership_status?, membership_expiry? (date \| null) }` | `SafeUser` | 400 `CANNOT_CHANGE_OWN_ROLE`, 400 `LAST_ADMIN` |
| `DELETE /members/:id` (admin) | — | `{ deleted: true }`. Removes bookings, workouts, attendance, floor sessions, notes about them and reset tokens; keeps payments (financial records) | 400 `CANNOT_DELETE_SELF`, 400 `LAST_ADMIN` |
| `POST /members/:id/reset-password` (admin) | — | `{ tempPassword }` (old tokens revoked) | |
| `POST /attendance/check-in` (admin, trainer) | `{ code, method?: 'qr'\|'manual'\|'kiosk'\|'camera' }` (`tokenOrId` accepted as an alias of `code`). `code` = QR token, member id, email, or trial code | `{ result: 'granted', already_checked_in: boolean, kind: 'member'\|'trial', member?: { id, name, email, avatar_url, membership_tier, membership_status, membership_expiry, streak_days }, trial?: TrialPass, log: AttendanceLog }`. A second scan on the same gym day lets the member through without a new log or streak day | 403 `MEMBERSHIP_EXPIRED` \| `MEMBERSHIP_FROZEN` \| `MEMBERSHIP_PENDING` \| `TRIAL_NOT_VALID_TODAY` \| `TRIAL_ALREADY_USED` (with `data.member` or `data.trial`), 404 `PASS_NOT_FOUND` |
| `GET /attendance/logs` (admin) | `date?, user_id?, limit? (1–200, default 50), offset?, format? = 'json'\|'csv'` | `{ items: AttendanceLog[], total }`, or a `text/csv` download | |
| `GET /attendance/my` | — | the caller's `AttendanceLog[]`, newest first (≤ 100) | |
| `POST /trials` (public, 5 per hour per IP) | `{ name, email, phone, interest: ClassCategory, preferred_date }` (today … today + 14, not a Sunday) | 201 `TrialPass` (`code` = `PULSE-TRIAL-XXXXXX`, valid only on `valid_on`, once) | 409 `TRIAL_ALREADY_CLAIMED` (same email or phone), 400 `GYM_CLOSED` |
| `GET /trials` (admin) | — | `TrialPass[]` newest first | |

Additional rules:
- `PUT /members/:id` refuses (400 `VALIDATION_ERROR` on `membership_expiry`) a change that would leave a member active
  without a future expiry date, and (on `membership_tier`) an active membership with tier `none`. Moving from `frozen` to `active` gives back the frozen days, like `/membership/unfreeze`.
- A trial pass scanned again on the day it was redeemed is let through with `already_checked_in: true`.
- A trial `preferred_date` outside today … today + 14 is 400 `VALIDATION_ERROR`. The CSV export ignores `limit`/`offset`.
- Request bodies are strict: unknown keys are 400 `VALIDATION_ERROR`. Staff skip membership checks at check-in.

---

## Workouts, floor time & analytics — owner: `activity` (routes/activity.ts, controllers/workoutController.ts, timeTrackingController.ts, analyticsController.ts)

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /exercises`, `GET /exercises/:id` | filters `category, equipment, difficulty, search` | `Exercise[]` / `Exercise` | 404 |
| `GET /workouts` | — | own `Workout[]` newest first | |
| `GET /workouts/:id` | — | `Workout` (owner or admin) | 404, 403 |
| `POST /workouts` | `{ title (1–100), date (not after today, not more than 365 days ago), duration_minutes (1–300), notes? (≤ 1000), sets: [{ exercise_id (must exist), set_number (1–50), weight_kg (0–500), reps (1–100), rpe? (1–10), is_warmup? }] (1–100 items) }` | 201 `Workout`; `set_number` is kept as sent (per exercise); volume = Σ weight × reps of working sets | 400 |
| `DELETE /workouts/:id` | — | `{ deleted: true }` | |
| `GET /workouts/analytics` | — | `{ volumeTimeline, personalRecords, muscleDistribution, … }` | |
| `POST /time-tracking/clock-in` | `{ category: ClassCategory, notes? }` | 201 `TimeSession` | 403 `MEMBERSHIP_INACTIVE`, 403 `PLAN_EXCLUDES_CATEGORY`, 409 `ALREADY_CLOCKED_IN` |
| `POST /time-tracking/clock-out` | `{ notes? }` (own active session; an admin may pass `session_id`) | `TimeSession` | 404 `NO_ACTIVE_SESSION` |
| `GET /time-tracking/active-floor` | optional auth | `{ totalActive, workoutActive, zumbaActive }`; staff also get `workoutUsers` / `zumbaUsers` (`user_name, user_avatar, user_tier, clock_in_time, duration_minutes`; no emails) | |
| `GET /time-tracking/my-stats` | — | `UserTimeTrackingStats` | |
| `GET /analytics/dashboard` (admin) | — | see below | |

Sessions still open 4 hours after clock-in are closed automatically at clock-in + 4 h (`auto_closed: true`).
A completed session counts towards the streak; so does a workout logged for today.

Additional rules:
- `GET /workouts/analytics` returns `{ totalWorkouts, totalVolumeKg, avgDurationMinutes, volumeTimeline, personalRecords,
  muscleDistribution }`; `personalRecords` = best estimated 1RM (Epley) per exercise.
- `POST /workouts` rejects a repeated (`exercise_id`, `set_number`) pair. Floor notes are capped at 500 characters.
- `POST /time-tracking/clock-out`: a member may pass the `session_id` of their own session; someone else's is 403.

**Dashboard** (`GET /analytics/dashboard`). Every number comes from stored data; nothing is invented:
```ts
{
  kpis: { totalMembers, activeMembers, frozenMembers, expiredMembers, pendingMembers,
          monthlyRevenue /* MRR */, revenueThisMonth, todayCheckIns, avgFillRate /* % */,
          retentionRate /* % or null */, totalTrainers, classesScheduled, trialsThisMonth },
  weeklyAttendanceChart: [{ day: 'Mon'…'Sun', visits }],   // check-ins in the last 28 days
  hourlyPeakCurve: [{ hour: '06:00'…'22:00', checkIns }],  // check-ins in the last 30 days
  tierDistribution: [{ name, tier, count, revenue, color }],
  topClasses: [{ id, title, category, trainer, booked, capacity, occupancy }],
  revenueByMonth: [{ month: 'YYYY-MM', revenue }],         // last 6 months, from payments
  definitions: { monthlyRevenue, avgFillRate, retentionRate }, // one plain sentence each
  generatedAt
}
```
- MRR: for each active member, their latest payment's monthly equivalent (annual ÷ 12), or the plan's monthly price if they have no payment.
- Fill rate: booked ÷ capacity across this week's class occurrences.
- Retention: of memberships whose period ended in the last 90 days, the % that were renewed; `null` when there are none.
