# PulseFit API reference (v2.2)

Base path: `/api`. All bodies are JSON. Every endpoint is implemented by exactly one domain
(the "Owner" line under each section), in `server/src/routes/<owner>.ts`.

## Conventions

**Envelope.** Success: `{ "success": true, "data": …, "message"?: "…" }`.
Failure: `{ "success": false, "error": "<sentence a member can read>", "code"?: "UPPER_SNAKE", "data"?: … }`.
Clients branch on `code`, never on the `error` text.

Common codes: `VALIDATION_ERROR` (400, `data.issues = [{ path, message }]`), `UNAUTHORIZED` (401: missing,
invalid, expired or revoked token; the client signs the user out), `FORBIDDEN` (403), `NOT_FOUND` (404; also an unknown
route, or a request without the app header: see **App header**),
`RATE_LIMITED` (429), `INTERNAL` (500).

**Guests.** The website's service pages (`/strength`, `/zumba`, `/guide`, `/schedule`, `/pricing`, `/coaches`) need an
account, so the only API answers a guest (no session) gets are what the public pages show: the home page reads
`GET /plans`, `GET /classes` and `GET /trainers` in a **guest view** (an allowlist of fields, listed with each endpoint)
the floor counts and `GET /promotions` (sale headlines and joining-gift names, for its sale banner); the exercise
library, the app config and the auth endpoints stay open. Everything else the
service pages read needs a session (401 `UNAUTHORIZED`). Answers that differ by session carry
`Cache-Control: private, no-cache`, so no shared cache hands one account's answer to another.

**Auth.** A sign-in starts a session in one of two forms, chosen by the request's `Origin`:
- **Website** (any other browser origin): an httpOnly cookie `pulsefit_session` (`Path=/api`, `SameSite=Lax`, `Secure` in
  production, `Max-Age` = the token's lifetime). The response body has **no** `token`; page scripts never see it.
- **Android/iOS apps** (`APP_ORIGINS`, default `https://localhost` and `capacitor://localhost`) and API clients that send
  no `Origin` (curl, tests): `data.token`, sent back as `Authorization: Bearer <token>`. The apps keep it in the Android
  Keystore / iOS Keychain, never in `localStorage`. No cookie is set for the apps.

The API accepts the bearer header first, then the cookie. **CSRF:** a `POST`/`PUT`/`PATCH`/`DELETE` that carries the session
cookie (and no bearer header) must send `X-Requested-With: PulseFit`, else 403 `CSRF_REJECTED`. Cross-site pages cannot add
that header without a CORS preflight, which the origin allowlist refuses; CORS never allows credentials.

**App header.** Every other `/api` request must send `X-Requested-With: PulseFit` too (exactly that value; the website
and the apps send it on every call), signed in or not, else the same 404 `NOT_FOUND` as an unknown route
(`No API route for GET /api/plans.`), before anything is read or written. Exempt paths, matched ignoring case and a
trailing slash: `/health` (uptime checks) and the payment webhooks `/payment/webhook` and `/payment/youpi/webhook`
(Razorpay and YouPI call them server to server). CORS preflights from allowed origins (the website and the apps), and
any `OPTIONS` request without an `Origin` header, are answered with 204 before this check (identically for every path);
an `OPTIONS` request from any other origin without the header gets the same 404, so it cannot tell real routes from
unknown ones. The CSRF check runs first, so a cookie-authenticated write without the header still gets
403 `CSRF_REJECTED`. This keeps API answers away from the address bar, links and other sites' requests; it is a deterrent,
not a security boundary (anyone can add the header, and a signed-in person's browser shows them the app's own requests),
so what an answer may contain is decided by authentication, roles and each endpoint's response shape. Scripts and
monitors that call the API directly must send it.

Tokens are HS256 JWTs (`iss: pulsefit`, `aud: pulsefit-session`). Members' last 7 days (`JWT_EXPIRES_IN`), admins' and
coaches' 12 hours. They are revoked when the password changes or is reset, when two-step sign-in is switched on, or
when an admin resets it (`token_version`). `POST /auth/logout` clears the cookie.

**Dates.** `YYYY-MM-DD` strings are calendar days **at the gym** (`Asia/Kolkata`); `HH:MM` times are
gym-local; instants are ISO-8601 UTC strings. "Today" always means today at the gym.

**SafeUser** (the only user shape the API returns):

```ts
{
  id, email, name, role: 'member' | 'trainer' | 'admin', phone,
  avatar_url: string,                // their photo; '' = none (the apps show a default picture, see GET /avatars/…)
  gender?: 'male' | 'female' | 'other', // absent = not given
  membership_tier: 'none' | 'basic' | 'pro' | 'vip',
  membership_status: 'active' | 'expired' | 'pending' | 'frozen', // effective today: past expiry => 'expired'
  membership_expiry: string | null,  // last day of access, inclusive
  frozen_since?: string | null,
  qr_code_token: string,             // the member's turnstile pass, rendered as a QR code
  created_at, streak_days: number,   // current streak (0 once lapsed)
  last_active_date?: string | null,
  mfa_enabled: boolean,              // two-step sign-in is on
  has_password: boolean              // false for Google-only accounts
}
```

Never included: the password hash, `token_version`, the Google subject id, MFA secrets and backup-code hashes, and the
rewards referral fields (`referral_code`, `referred_by`).

A `SafeUser` goes only to the person themselves and to admins. Coaches, other members and guests get the narrower
shapes listed with each endpoint (roster attendees, `GET /trainer/clients`, the check-in `member`, the floor, trainers
and classes), and none of them carries `gender`, not even as a picture address. `gender` only picks the default
picture; it is absent for Google sign-ups, sign-ups from apps that do not send it (2.3.0), accounts from
`npm run create-admin`, accounts an admin made without one and accounts from before the question. When a database from
v2.3 or older loads, its generated DiceBear pictures (`https://api.dicebear.com/…` on people, coaches, classes'
`trainer_avatar` and floor sessions) become `''`; no gender is added. This runs on every load, so nothing may store a
new one: `PUT /auth/profile` takes no addresses and `POST/PUT /trainers` refuse DiceBear ones.

**Plans and entitlements.** `basic` = Workout & Strength Pass (books `Workout & Strength` classes),
`pro` = Zumba & Cardio Pass (books `Zumba & Cardio`), `vip` = Dual All-Access (books everything).
Read from `membership_plans[].categories` (empty = all). Prices live only in the plan catalogue.

---

## Runtime config — owner: platform

### `GET /config` (public)
`{ demoMode: boolean, googleClientId: string | null, payments: { enabled: boolean, provider: 'razorpay' | 'youpi' | null, keyId: string | null (Razorpay only) }, gym: { name, timezone, currency, hours: { opensAt: '06:00', closesAt: '22:00', closedWeekdays: [0], enforced: boolean }, classesPerWeek: number }, androidApp: { url: '/downloads/pulsefit.apk', version?: string, size: number } | null }`.
The client hides the demo persona switcher, "Continue with Google" and checkout when they are off.
`hours` is the gym's opening hours in gym time (`closedWeekdays`: 0 = Sunday). `classesPerWeek` is the number of classes
on the weekly timetable, the home page's "Classes a week" (guests get only the next 4 sessions from `GET /classes`).
`enforced` mirrors `ENFORCE_OPENING_HOURS`: when on, check-ins, floor clock-ins and same-day free trials are refused
while the gym is closed.
`androidApp` is the APK the website offers (see `GET /downloads/pulsefit.apk`), with its size in bytes and `version` =
`versionName` from `pulsefit.json` when present; `null` while there is none. Android browsers then show a "Get the PulseFit
app" bar, and the footer a "Get the Android app" link (neither inside the app).

### `GET /health`
`{ status: 'ok', timestamp }`. Answers without the app header (Railway and `deploy/install-release.sh` call it).

---

## Website, crawlers & HTTPS — owner: platform (server.ts, lib/seo.ts)

These live outside `/api`. Every `/api` response carries `X-Robots-Tag: noindex, nofollow`; with
`ALLOW_INDEXING` off (the default outside production, and the setting for staging) every response does.

### `GET /robots.txt` (text/plain)
Indexing on and the client served (`SERVE_CLIENT`): `Allow: /`, an `Allow` line for each API answer the public pages
render from (`/api/config`, `/api/plans`, `/api/classes`, `/api/trainers` (their guest views, for the home page),
`/api/exercises`, `/api/time-tracking/active-floor`, `/api/promotions` (the home page's sale banner)) and a `Disallow` line for each one's sub-paths
(`/api/classes/<id>` and `/api/trainers/<id>` need a session), a `Disallow` line for `/api/`, `/downloads/` and for each
page that needs an account (`/strength`, `/zumba`, `/guide`, `/schedule`, `/pricing`, `/coaches`, `/admin`, `/trainer`,
`/dashboard`, `/bookings`, `/log-workout`, `/rewards`, `/pass`, `/profile`) or a link (`/reset-password`, `/payment-status`), and
`Sitemap: <PUBLIC_URL>/sitemap.xml`. Scripts, styles and images are never blocked.
`/api/guide` stays disallowed: the pages read it only for a signed-in account, and crawlers are guests. Google's renderer
runs the app, which sends the app header (see **App header**); fetched directly, the allowed API addresses answer 404.
Indexing off, or an API-only host: `User-agent: *` / `Disallow: /`.

### `GET /downloads/pulsefit.apk` (application/vnd.android.package-archive)
The Android app, from the `downloads` folder next to the database (`dirname(PULSEFIT_DB_PATH)/downloads`, on the data
volume in production), so copying a new `pulsefit.apk` there puts it live without a redeploy. An optional
`pulsefit.json` beside it (`{ versionName, versionCode, sha256 }`) names the version for `GET /config`.
`Content-Disposition: attachment; filename="PulseFit.apk"`, `Cache-Control: no-cache` (with `ETag`/`Last-Modified`, so a
repeat check is a 304), `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`; ranges are honoured. No APK
(or an empty file): plain-text **404**, as is any other path under `/downloads/`.

### `GET /sitemap.xml` (application/xml)
A `<urlset>` (sitemaps.org 0.9) with one absolute, XML-escaped `<loc>` per indexable page (`/`, `/exercises`,
`/contact`, `/privacy`, `/terms`, `/refund-policy`; the pages that need an account are `noindex` and left out) and
`<lastmod>` = the day `client/dist/index.html` was built. 404 when indexing is off,
the client is not served, or neither `PUBLIC_URL` nor `CLIENT_ORIGIN` is set.

### `GET /<any page>` (text/html)
`client/dist/index.html`, with the page's `<title>`, `meta description`, `og:title` and `og:description`
replaced in place, and at the `<!--app-head-->` marker: `link rel="canonical"` and `og:url`
(`PUBLIC_URL` + the page's path, no query string) on indexable pages, `meta robots noindex, nofollow` on the
others, and a JSON-LD `@graph` (Organization, WebSite, ExerciseGym with address, phone, email, opening hours
and the monthly price range the home page shows, WebPage; no plan, class or coach details on any page). `/`,
`/strength` and `/zumba` also preload their hero photo, and a demo deployment adds `meta name="pulsefit-demo-mode"`. Addresses
are matched like the client's `tabForPath` (trailing slashes ignored). An unknown address answers **404**
with the same app (it shows "Page not found") and `noindex`. `Cache-Control: no-cache`; hashed files under
`/assets/` are `immutable` for a year, sent Brotli- or gzip-compressed when the client accepts it (compressed once,
kept in memory), and a missing one is a plain-text 404. Any address whose decoded path ends in `.map`, or has `.map` followed by a
slash, dot, space or `:` (`x.js%2Emap`, `x.js.map/`), is a plain-text 404 as well: the build has no source maps, and one
that does still never serves them. Base URL: `PUBLIC_URL`, else the first `CLIENT_ORIGIN`, never the
request's Host header.

### `GET /avatars/male.svg`, `/avatars/female.svg`, `/avatars/neutral.svg` (image/svg+xml)
The default pictures, static files of the client (`client/public/avatars`, copied into the web and app builds), served
from the site itself and self-contained, so showing one sends nothing to another service. The client shows a person's
photo when `avatar_url` is set. Otherwise, where the answer carries `gender` (the person's own `SafeUser`, an admin's
member list and details and `GET /id-cards`) it shows the picture for it (`male`, `female`, else `neutral`), and everywhere
else (rosters, coach lists, the check-in scanner, the public coach and class pages) `neutral`.

### HTTPS
`Strict-Transport-Security: max-age=31536000; includeSubDomains` (`HSTS`, off in local development). In
production with an `https://` `PUBLIC_URL`, `TRUST_PROXY` set and `HTTPS_REDIRECT` on, a request the proxy
reports as plain HTTP (`X-Forwarded-Proto: http`) gets a 301 (`GET`/`HEAD`) or 308 (other methods) to
`PUBLIC_URL` + the original path and query. `/api/health` is never redirected.

---

## Auth & account — owner: `auth` (routes/auth.ts, controllers/authController.ts)

Rate limits (disabled in tests) → `429 RATE_LIMITED`: login 10 per 15 min per IP **and** 10 failed attempts per 15 min per
account, register 5 per hour, forgot-password 5 per hour, reset-password 10 per 15 min, google 20 per 15 min,
demo-login 30 per 15 min, `POST /auth/mfa/verify` 10 per 15 min per IP, the other MFA writes 10 per 15 min per account.
Every `/api` route also shares a limit of 300 requests per minute per IP (except `GET /health` and the Razorpay webhook).

"Session" below means the cookie or `token` described under **Auth**, plus `user` (`SafeUser`).

| Method & path | Body | Success `data` | Errors |
|---|---|---|---|
| `POST /auth/login` | `{ email, password }` | a session, or `{ mfa_required: true, mfa_token }` when two-step sign-in is on (no session yet; see below) | 401 `INVALID_CREDENTIALS`, 403 `DEMO_PASSWORD_BLOCKED` (the published demo password, outside demo mode) |
| `POST /auth/register` | `{ name (2–60), email, password, phone?, gender?, referral_code? }` | 201 session, with `gender` as sent (absent when not sent), `avatar_url:''`, `membership_tier:'none'`, `membership_status:'pending'`, `membership_expiry:null` | 400 `VALIDATION_ERROR` (`gender` sent but not one of the three, `''` and `null` included: `data.issues = [{ path: 'gender', message: 'Choose your gender.' }]`), 400 `REFERRAL_CODE_INVALID`, 409 `EMAIL_TAKEN` |
| `POST /auth/google` | `{ credential, referral_code? }` (Google Identity Services ID token) | a session or MFA challenge, plus `created: boolean` | 503 `GOOGLE_SIGNIN_DISABLED`, 401 `INVALID_GOOGLE_TOKEN`, 400 `REFERRAL_CODE_INVALID` (only when the call would create the account) |
| `POST /auth/demo-login` | `{ role: 'member' \| 'vip' \| 'trainer' \| 'admin' }` | a session | 404 `DEMO_DISABLED` when demo mode is off |
| `POST /auth/logout` | — | `{ signedOut: true }`; clears the session cookie | — |
| `GET /auth/me` | — | `SafeUser` plus `active_days_this_week` (days this gym week, Monday–Sunday, with streak activity: staff check-in, attended class, completed floor session, workout logged on its own day) and `longest_streak_days` (the longest run by the streak rule over all history); no other answer carries these two | 401 |
| `PUT /auth/profile` | `{ name?, phone?, gender?, avatar_url? }` **only** (unknown keys → 400, "Only your name, phone number, gender and photo can be changed here."). `gender`: one of the three (`null` and `''` are refused; only an admin can clear it). `avatar_url`: a real PNG/JPEG/WebP image as `data:image/(png\|jpeg\|webp);base64,…` (magic bytes must match, at most 2048×2048 and 300 KB), one of the ten avatars bundled with the apps (exactly `/avatars/preset-01.svg` … `/avatars/preset-10.svg`, the choices under "Change avatar" on My account), or `''` to remove the photo; no other addresses (DiceBear ones included) | `SafeUser` | 400 |
| `PUT /auth/password` | `{ currentPassword?, newPassword }` (`currentPassword` required when the account has a password) | a session (old tokens are revoked) | 400 `WRONG_PASSWORD`, 403 `DEMO_ACCOUNT_LOCKED`, 403 `REAUTH_REQUIRED` (a Google-only account setting its first password more than 15 minutes after signing in) |
| `POST /auth/forgot-password` | `{ email }` | `{ message, resetUrl? }`. The same message whether or not the account exists. `resetUrl` (`<address>/reset-password?token=…`) is returned only in local development (`NODE_ENV` development or test), because this server has no email delivery; it is always logged to the server console | 429 |
| `POST /auth/reset-password` | `{ token, newPassword }` | a session, or an MFA challenge when two-step sign-in is on | 400 `INVALID_RESET_TOKEN` (unknown, used, or older than 30 min), 403 `DEMO_ACCOUNT_LOCKED` |

**Passwords** (`newPassword`, `password` on register): 8–72 characters (≤ 72 UTF-8 bytes), at least one letter and one
digit, and not on the built-in list of common passwords (which includes the published demo password) → 400 `VALIDATION_ERROR`.

**Gender** (`gender`): `'male' | 'female' | 'other'`, exactly as written. Its only use is the default
picture (see `GET /avatars/…`). Optional on `POST /auth/register`: the website and the apps ask for it at sign-up, but
the apps released in 2.3.0 do not send it and their sign-ups must keep working, so an account registered without one
has none, like one created by `POST /auth/google`. The person can set it later with `PUT /auth/profile`.

**Referral code** (`referral_code`, optional): a friend's code from their Rewards page, trimmed (≤ 32 characters) and
matched ignoring case; empty means none. It sets the new account's referrer (see the referral rules under **Rewards**).
A code that names no member is 400 `REFERRAL_CODE_INVALID` and creates no account. `POST /auth/google` uses it only
when the call creates the account; signing in to an existing account ignores it, valid or not.

### Two-step sign-in (MFA, optional for every account)

Authenticator-app codes (TOTP, RFC 6238: SHA-1, 6 digits, 30 s, ±1 step) plus 10 one-time backup codes (`xxxx-xxxx`).
Secrets and backup-code hashes never leave the server. A code is accepted once (replays are refused).

| Method & path | Body | Success `data` | Errors |
|---|---|---|---|
| `POST /auth/mfa/verify` (public) | `{ mfa_token, code }`: `mfa_token` from login/google/reset (valid 5 minutes, `aud: pulsefit-mfa`, never accepted as a session); `code` = a 6-digit code or a backup code | a session; `message` says how many backup codes are left when one was used | 400 `INVALID_MFA_CODE`, 401 `MFA_TOKEN_EXPIRED` |
| `GET /auth/mfa` | — | `{ enabled, recovery_codes_left }` | 401 |
| `POST /auth/mfa/setup` | `{ password? }` (required when the account has a password; Google-only accounts must have signed in within 15 minutes) | `{ secret, otpauth_url }` (shown once; scan as a QR code) | 400 `WRONG_PASSWORD`, 403 `REAUTH_REQUIRED`, 403 `DEMO_ACCOUNT_LOCKED`, 409 `MFA_ALREADY_ENABLED` |
| `POST /auth/mfa/enable` | `{ code }` from the app | a fresh session plus `recovery_codes: string[10]` (shown once). Other devices are signed out | 400 `INVALID_MFA_CODE`, 400 `MFA_SETUP_REQUIRED` |
| `POST /auth/mfa/disable` | `{ code, password? }` (code or backup code; password as for setup) | `SafeUser` | 400 `INVALID_MFA_CODE`, 400 `WRONG_PASSWORD`, 409 `MFA_NOT_ENABLED` |
| `POST /auth/mfa/recovery-codes` | `{ code }` | `{ recovery_codes }`; the old ones stop working | 400 `INVALID_MFA_CODE`, 409 `MFA_NOT_ENABLED` |
| `POST /members/:id/mfa/reset` (admin) | — | `SafeUser` with `mfa_enabled:false`; signs the person out everywhere. For someone who lost their phone and backup codes | 404, 409 `MFA_NOT_ENABLED` |

Demo personas cannot turn MFA on while demo mode is on. `POST /auth/demo-login` never asks for a code.

Google accounts are matched by Google subject id, then by verified email (linking the account). New Google
users are created like a registration (tier `none`, status `pending`, `avatar_url: ''`) but without a gender. An existing
user's name is never overwritten.
`POST /auth/firebase-sync` no longer exists.

Additional rules:
- `POST /auth/google` can also answer 409 `GOOGLE_ACCOUNT_CONFLICT` (the verified email belongs to an account already
  linked to a different Google account). Linking an existing password account to Google removes its password and
  revokes older tokens; `data.created` is `false` and the message says so. New and existing users both get 200.
  `data.created` is `true` only when the call made the account; the client then sends a new account without a gender
  to My account to choose one (unless a plan was picked before signing in).
- `PUT /auth/password`: a missing `currentPassword` on an account that has one is 400 `VALIDATION_ERROR`
  (`data.issues[0].path = "currentPassword"`); a wrong one is 400 `WRONG_PASSWORD`. Limited to 10 per 15 minutes per account.
- `POST /auth/forgot-password`: in local development `resetUrl` is returned for any existing account. Everywhere else it
  is never returned and the message asks the member to get the link from the front desk. The message never reveals whether
  an account exists.
- Reset links point at `PUBLIC_URL` (server/.env, the address people open the app at). Without it: the address the request
  came in on when the API serves the client (`SERVE_CLIENT`, the production default). Behind a trusted proxy
  (`TRUST_PROXY`) that address is `X-Forwarded-Host` and the scheme is `X-Forwarded-Proto`; otherwise `Host` and the
  connection's scheme. A host that is not a plain name or IP address (with an optional port) is ignored. Without
  `SERVE_CLIENT`: the request's `Origin` when it is in `CLIENT_ORIGIN`, else the first `CLIENT_ORIGIN` (local development
  with Vite). A link built on the request's address is logged with "(address taken from the request; check it before
  handing it out)", since a client can fake those headers. A production server without `PUBLIC_URL` logs a warning at
  start-up; set it.
- `POST /auth/demo-login`: `role` is optional and defaults to `member`.
- Demo personas are locked while `DEMO_MODE` is on: anyone can sign in as them, so nobody may change or reset their
  password. `PUT /auth/password` and `POST /auth/reset-password` answer 403 `DEMO_ACCOUNT_LOCKED` for the four persona
  emails, and `POST /auth/forgot-password` issues no link for them (with the same answer as for any other email).
  With `DEMO_MODE` off they are ordinary accounts.

---

## Plans, payments & membership — owner: `payments` (routes/payments.ts, controllers/planController.ts, paymentController.ts, membershipController.ts)

| Method & path | Body | Success `data` | Errors |
|---|---|---|---|
| `GET /plans` | optional auth | `MembershipPlan[]` sorted by monthly price. **Guest view** (no session): `{ id, tier, name, description, price_monthly, features (the first 4), categories, is_popular?, badge? }`, what the home page shows (`categories` picks the plan named under each discipline); no `price_annual` | |
| `PUT /plans/:id` (admin) | `{ name?, description?, price_monthly? (int 1–100000), price_annual? (int), features?: string[], categories?: ClassCategory[], is_popular?, badge? }` | `MembershipPlan` | 404 |
| `POST /payment/quote` (signed in) | `{ tier, billing_cycle, coupon_code? }` | `Quote` (below): what create-order would charge now | 400 `COUPON_*`, 429 `RATE_LIMITED` |
| `GET /payment/quotes` (signed in) | — | `Quote[]` for all 3 tiers × 2 cycles (basic, pro, vip; monthly before annual), sales applied, no coupon | 401 |
| `GET /promotions` (public) | — | `{ sales: { title, banner_text, percent_off, amount_off, ends_at }[] (live sales, soonest end first), joining_gifts: { tier, billing_cycle, gifts: string[] /* active gift names */ }[] }`. The guest view: no coupons, ids, claims, stock or referral data | |
| `GET /offers` (admin) | — | `Offer[]` newest first | |
| `POST /offers` (admin) | offer fields (below) | 201 `Offer` | 400 `VALIDATION_ERROR` |
| `PUT /offers/:id` (admin) | any offer fields, checked together with the stored ones; `active: false` retires a sale | `Offer` | 404 `OFFER_NOT_FOUND` |
| `GET /coupons` (admin) | — | `Coupon[]` newest first | |
| `POST /coupons` (admin) | coupon fields (below) with `code` | 201 `Coupon` (`uses: 0`) | 409 `COUPON_EXISTS`, 400 `VALIDATION_ERROR` |
| `PUT /coupons/:code` (admin) | any coupon fields except `code` and `uses`, checked together with the stored ones; `:code` ignores case | `Coupon` | 404 `COUPON_NOT_FOUND`, 400 (`code` or `uses` in the body) |
| `POST /payment/create-order` | `{ tier: 'basic'\|'pro'\|'vip', billing_cycle: 'monthly'\|'annual', coupon_code? }` | `{ provider, orderId, amount (paise), amount_inr, base_amount_inr, discount_inr, applied: AppliedDiscount \| null, currency:'INR', tier, billing_cycle, plan_name, description }` plus `keyId` (Razorpay) or `checkoutUrl` (YouPI). `amount_inr` is the quote's `total` | 503 `PAYMENTS_DISABLED`, 502 `PAYMENT_PROVIDER_ERROR`, 400 `COUPON_*` (no order is made), 429 `RATE_LIMITED` |
| `POST /payment/verify` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ user, payment, message, cancelled_bookings }` (the session is unchanged) | 400 `INVALID_SIGNATURE`, 404 `ORDER_NOT_FOUND`, 403 `ORDER_NOT_YOURS`, 409 `ALREADY_PROCESSED` (`data = { user, cancelled_bookings, message? }`: the current user and what the earlier activation did) |
| `POST /payment/webhook` | raw Razorpay webhook, header `X-Razorpay-Signature` | `{ received: true }` | 400 bad signature, 503 no webhook secret |
| `POST /payment/youpi/confirm` | `{ order_id }` (a `ypo_…` id) | `{ status: 'pending' }`, `{ status: 'failed', reason: 'EXPIRED'\|'CANCELLED'\|'FAILED' }` or `{ status: 'paid', user, payment?, message?, cancelled_bookings }` | 404 `ORDER_NOT_FOUND`, 403 `ORDER_NOT_YOURS`, 409 `ORDER_REJECTED`, 502 `PAYMENT_PROVIDER_ERROR` |
| `POST /payment/youpi/webhook` | raw YouPI webhook, header `X-Gateway-Signature: sha256=<hex>` | `{ received: true }` | 400 bad signature, 503 no webhook secret |
| `GET /payments/my` | — | `Payment[]` newest first (the member's invoices) | |
| `GET /payments` (admin) | query `user_id?` | `Payment[]` newest first | |
| `POST /membership/freeze` | `{}` | `SafeUser` (status `frozen`, `frozen_since` today); see the freeze rules below for `message` | 409 `NOT_ACTIVE` |
| `POST /membership/unfreeze` | `{}` | `SafeUser` (status `active`, expiry moved forward by the open days missed; see the freeze rules below) | 409 `NOT_FROZEN` |

The amount is always worked out on the server (the plan's price less a sale or coupon, see **Offers and coupons**),
never taken from the client: prices or discounts in a body are ignored. The tier, cycle and amount are fixed on the
server-side order record when it is created; verify reads them from that record. A signature can activate an order only
once (checkout and webhook are idempotent with each other).

```ts
Quote = { tier, billing_cycle, base /* list price */, discount, total /* base − discount, at least 1 */,
          applied: AppliedDiscount | null, offer_ends_at? /* only when a sale applies */ }
AppliedDiscount = { type: 'offer', id, label /* '15% off' | '₹500 off' */ } | { type: 'coupon', code, label /* 'WELCOME10: 10% off' */ }
Offer = { id, title, banner_text, percent_off: number | null, amount_off: number | null, tiers: Tier[], billing_cycles: Cycle[],
          starts_at, ends_at /* ISO instants */, active, created_at }
Coupon = { code, percent_off: number | null, amount_off: number | null, tiers: Tier[], billing_cycles: Cycle[],
           valid_from, valid_until /* gym dates, inclusive */, max_uses: number | null, per_member_limit, uses, active, created_at }
```

**Offers and coupons.**
- **Price:** `base` = the plan's price for the cycle. The live sale for the tier and cycle with the largest discount
  (`active`, `starts_at` ≤ now < `ends_at`) competes with the coupon, if one is given: the larger discount applies, never
  both, and a tie goes to the sale. `percent_off` rounds down to whole rupees; `amount_off` is at most the price.
  `total = max(1, base − discount)` and `discount = base − total`; a discount that comes to 0 applies nothing
  (`applied: null`). Empty `tiers` or `billing_cycles` on a sale or coupon mean all of them.
- **Coupon codes** are trimmed and upper-cased before matching (`' welcome10 '` is `WELCOME10`). An empty or blank
  `coupon_code` means no coupon and the normal price. A typed code is checked in this order, each a 400: unknown,
  inactive, not 4–16 letters and digits, or before `valid_from` → `COUPON_INVALID`; after `valid_until` →
  `COUPON_EXPIRED`; tier or cycle not covered → `COUPON_NOT_FOR_PLAN`; `uses` ≥ `max_uses`, or the member's paid
  payments with this `coupon_code` ≥ `per_member_limit` → `COUPON_USED_UP`. A refused code makes no order.
- **Rate limit:** 10 failed coupon attempts (any 4xx/5xx answer to quote or create-order with a non-blank
  `coupon_code`) per account per 10 minutes, then 429 `RATE_LIMITED` ("Too many coupon attempts. Please wait 10 minutes
  and try again.") for any request with a code. Requests without a code and successful ones never count.
- **Coupon uses** grow only when an order is paid, inside the same once-only activation as the payment (verify, the
  webhook and YouPI together count one use), even past `max_uses`: a coupon that ran out between the order and the
  payment is honoured.
- **A discount is checked again when the money arrives.** A paid order is `rejected` (409 `ORDER_REJECTED`, left for
  the desk to apply or refund) when the member has meanwhile paid for `per_member_limit` other orders with its coupon,
  or when it is paid more than 30 minutes after it was made and its sale is no longer live or its coupon is inactive or
  outside its dates.
- **Orders and payments record the pricing:** a new `PaymentOrder` stores `base_amount_inr` and `discount_inr`
  (`amount_inr = base_amount_inr − discount_inr`) and `offer_id` or `coupon_code` when one applied; the `Payment` its
  activation creates copies them. Orders from before sales and coupons, and desk sales, have none of these. Razorpay's
  `amount`, YouPI's session amount and both webhooks' amount checks all use the discounted `amount_inr`, so a payment for
  the list price of a discounted order is rejected.
- Desk sales charge what staff collect (no sale or coupon). Plan credit on upgrades uses list prices, except that days
  bought at a sale or coupon price count only for the share of their list price that was paid.
- Offer fields (strict): `title` 2–80, `banner_text` ≤ 160 (default `''`), exactly one of `percent_off` (integer 1–90)
  and `amount_off` (integer rupees 1–100 000), `tiers` and `billing_cycles` (no repeats, default `[]` = all),
  `starts_at` and `ends_at` (ISO date-times with a zone, stored as UTC; `ends_at` after `starts_at`), `active` (default
  `true`). Coupon fields (strict): `code` (4–16 letters and digits after trimming and upper-casing; fixed once made),
  the same discount, `tiers` and `billing_cycles` rules, `valid_from` and `valid_until` (`YYYY-MM-DD`, until ≥ from),
  `max_uses` (integer ≥ 1, or `null` = unlimited, the default), `per_member_limit` (integer ≥ 1, default 1), `active`
  (default `true`). `uses` is never in a body. Sales and coupons are retired with `active: false`, never deleted.

Additional rules:
- `POST /payment/create-order` uses the gateway `GET /config` reports as `payments.provider` (`PAYMENT_PROVIDER`;
  default Razorpay when configured, else YouPI) and answers 502 `PAYMENT_PROVIDER_ERROR` when it cannot be reached.
- **YouPI** (self-hosted UPI, experimental): create-order opens a YouPI session for our own `ypo_…` order id
  (`Idempotency-Key` = that id, no personal details sent) and returns its `checkoutUrl`; YouPI sends the member back to
  `/payment-status?order=<id>`. The order activates on a signed `SUCCESS` webhook (HMAC-SHA256 of the raw body with
  `YOUPI_WEBHOOK_SECRET`) or when `confirm` looks the session up on YouPI (`GET /api/v1/payments/:id` with
  `X-Merchant-Key`), whichever comes first, and only for the exact amount in INR (otherwise the order is `rejected`).
  `FAILED`/`EXPIRED`/`CANCELLED` mark a `created` order `failed`; a later `SUCCESS` still activates it. The payment
  records `provider: 'youpi'` and the `utr` when YouPI reports one.
- `POST /payment/verify` answers 409 `ORDER_REJECTED` when the webhook already reported a payment for the order with a
  wrong amount or currency, or its discount no longer holds (see **Offers and coupons**); such an order never activates
  a membership.
- `POST /payment/webhook`: 503 `WEBHOOK_DISABLED`, 400 `INVALID_SIGNATURE`, 400 `BAD_PAYLOAD`. Events for unknown orders,
  repeats and mismatched amounts are acknowledged with 200 so Razorpay stops retrying.
- `PUT /plans/:id` rejects unknown keys (`id` and `tier` are immutable); limits: name 2–80, description ≤ 500,
  price_annual 1–1 200 000, ≤ 20 features of ≤ 200 chars, badge ≤ 30 (an empty badge removes it).
- A `Payment` records its `source`: `checkout` or `webhook` (online), `seed` (demo data) or `desk` (a front-desk sale
  recorded with `POST /members/:id/desk-sale` or `POST /members`: `order_id` and `razorpay_payment_id` are `''`, and it
  carries `desk_method: 'cash' | 'upi' | 'card'` and `recorded_by: { id, name }`, the admin who recorded it). Desk sales
  charge what staff collected and activate through the same activation rules as online payments.
- Invoice numbers come from one global sequence; the year prefix is the gym-local year of the payment.
- A payment captured after its member was deleted marks the order `orphaned` (with the Razorpay payment id) and is
  logged for a manual refund; it activates nothing.
- Buying a plan and freezing are open to any signed-in account.

**Freeze rules.**
- `POST /membership/freeze` cancels the member's upcoming confirmed bookings and ends an open floor session. `message` is
  `Membership frozen.`, followed by `N upcoming class booking(s) was/were cancelled.` when any were and
  `Your gym-floor session was ended.` when one was open.
- Unfreezing (by the member, by an admin moving `frozen` to `active`, or by paying while frozen) gives back the open
  days strictly between `frozen_since` and today: closed days (Sundays) never count, and neither do the day of the
  freeze and the day of the return, because the member could still use the gym on both. The expiry moves forward by
  that many open days, stepping over Sundays. So a freeze from 21:00 to the next morning, or from Saturday evening to
  Monday, gives back nothing.
- The unfreeze `message` names the new end date (`N gym day(s) added ... runs until 6 Nov 2026`), says the end date
  stays the same when nothing was given back, and says the plan has ended when the new end date is already past.

**Activation rules.** `months` = 1 (monthly) or 12 (annual), using calendar months.
- Same tier, membership active: the new period starts the day after the current expiry.
- Otherwise the period starts today. Any unused days of a still-active different plan are credited:
  `floor(remaining_days × old_price_monthly ÷ new_price_monthly)` extra days, where a remaining day of a period paid
  below list price counts as `amount_inr ÷ base_amount_inr` of a day.
- A frozen member who pays is unfrozen first (expiry moved forward by the open days missed, as in the freeze rules).
- Result: `membership_tier` = purchased tier, `membership_status` = `active`, `membership_expiry` = period end.
  A `Payment` is stored with invoice number `PF-<year>-<6-digit sequence>`.
- A change of tier (through verify or the webhook) cancels the member's upcoming bookings in categories the new plan
  does not include, as an admin's tier change does. Verify's `cancelled_bookings` is the count (0 when none), and its
  `message` adds `N upcoming class booking(s) was/were cancelled because your new plan does not include ...` when any were.
  The count is kept on the paid order, so when the webhook activated the order first, verify's 409 `ALREADY_PROCESSED`
  carries the same `cancelled_bookings` and `message` in `data`.
  Dates in `message` read like `30 Nov 2026`; `payment.period_end` stays `YYYY-MM-DD`.

---

## Classes, bookings, trainers & trainer portal — owner: `classes` (routes/classes.ts, controllers/classController.ts, bookingController.ts, trainerController.ts, trainerPortalController.ts)

Classes are weekly templates. **Capacity is per occurrence** (class + date): `booked_count` = bookings with
status `confirmed` or `attended` for that date. Stored classes carry no counter.

**ClassOccurrence** = `GymClass` fields + `{ occurrence_date, starts_at (ISO), booked_count, spots_left, is_full, my_booking_id: string | null }`.
`trainer_name` / `trainer_avatar` always come from the current trainer record.

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /classes` | optional auth. `day?, category?, trainerId?, intensity?, search?, week_start?` (a Monday). Without `week_start`, `occurrence_date` is the next occurrence that has not started yet | `ClassOccurrence[]` sorted by `starts_at`. **Guest view** (no session, and no query: the home page's list): the next 4 sessions only (the week's timetable is for signed-in accounts; the weekly count is `GET /config` › `gym.classesPerWeek`), each as `{ id, title, category, day_of_week, start_time, duration_minutes, room, capacity, trainer_name?, occurrence_date, starts_at, spots_left, is_full }`; no description, intensity, photo, calories, coach id or photo, booked count or booking | 400; 401 `UNAUTHORIZED` for a guest sending any query parameter (a filter would let a guest search fields the guest view leaves out) |
| `GET /classes/:id` (signed in) | `date?` | `ClassOccurrence & { trainer }` | 401, 404 |
| `POST /classes` (admin) | `{ title, category, trainer_id, day_of_week (0–6), start_time (HH:MM), duration_minutes (15–180), room, capacity (1–200), intensity, description, image_url, calories_burn_est }`. The slot must fit opening hours (see below) | `GymClass` | 400 `TRAINER_NOT_FOUND`, 400 `VALIDATION_ERROR` |
| `PUT /classes/:id` (admin) | any subset of the above (id is immutable) | `GymClass` | 400 `VALIDATION_ERROR` |
| `DELETE /classes/:id` (admin) | — | `{ cancelled_bookings: number }` (future confirmed bookings are cancelled) | |
| `GET /bookings/my` | `scope = upcoming (default) \| past \| all` | `MyBooking[]`: booking + `class_title, category, start_time, room, trainer_name, image_url, duration_minutes, starts_at, can_cancel`. `upcoming` = confirmed and not started; `past` = started (any status but cancelled); `all` includes cancelled | |
| `POST /bookings` (members only) | `{ class_id, booking_date }` | 201 `Booking` | 403 `MEMBERS_ONLY`, 400 `DATE_MISMATCH` (wrong weekday), 400 `CLASS_STARTED`, 400 `TOO_FAR_AHEAD` (> 14 days), 403 `MEMBERSHIP_INACTIVE` (`data.status`), 403 `MEMBERSHIP_ENDS_BEFORE_CLASS` (`data.membership_expiry`), 403 `PLAN_EXCLUDES_CATEGORY`, 409 `CLASS_FULL`, 409 `ALREADY_BOOKED`, 404 |
| `DELETE /bookings/:id` | — (owner or admin) | `Booking` with status `cancelled` | 409 `ALREADY_CANCELLED`, 400 `CLASS_STARTED` |
| `PATCH /bookings/:id/attendance` | `{ status: 'attended' \| 'no_show' \| 'confirmed' }` (admin or the class's trainer; from 15 min before start) | `Booking` | 400 `CLASS_NOT_STARTED`, 403 `NOT_YOUR_CLASS` |
| `GET /bookings/class/:classId/roster` | `date?` (default next occurrence) (admin or the class's trainer) | `{ class: ClassOccurrence, date, attendees: [{ booking_id, user_id, user_name, user_email, user_phone, user_avatar, user_tier, status, booked_at }] }`; `user_email` and `user_phone` are `null` unless the caller is an admin | 403 `NOT_YOUR_CLASS` |
| `GET /trainers` | optional auth | `Trainer[]` + `classes_count` (real). **Guest view** (no session): the first 4 coaches, as the home page's "Meet the team" shows them: `{ id, name, avatar_url, bio, specialties (the first 2), experience_years, rating, reviews_count }`; no Instagram, class count or other coaches | |
| `GET /trainers/:id` (signed in) | — | `Trainer & { classes: ClassOccurrence[] }` | 401, 404 |
| `POST/PUT /trainers(/:id)` (admin) | trainer fields, validated | `Trainer` | |
| `DELETE /trainers/:id` (admin) | `reassign_to?` (query) | `{ deleted: true, reassigned_classes }` | 409 `TRAINER_HAS_CLASSES` (`data.classes = [{ id, title }]`) |

**Trainer portal** (role `trainer`, linked through `trainers.user_id`; admins may pass `?trainer_id=`, which is how the
coach dashboard at `/trainer?trainer=<id>` shows an admin any coach, including coaches without a login):

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /trainer/me` | — | `{ trainer, upcoming: ClassOccurrence[] (next 7 days, not started), recent_sessions: RecentSession[], stats: { classes_per_week, booked_next_7_days, attendance_rate_30d: number \| null, clients_count } }` | 404 `NO_TRAINER_PROFILE` |
| `GET /trainer/clients` | — | `[{ user_id, name, avatar_url, membership_tier, membership_status, sessions_attended, last_attended: string \| null, upcoming_bookings, notes_count }]` (the trainer's clients, see below) | |
| `GET /trainer/notes` | `member_id?` | `(TrainerNote & { member_name: string \| null })[]` newest first (a trainer sees their own; an admin sees all). `member_name` is the member's current name | |
| `POST /trainer/notes` | `{ member_id, category: 'assessment'\|'progress'\|'injury'\|'general', note (1–2000), visible_to_member: boolean }` | 201 `TrainerNote` | 404 member |
| `DELETE /trainer/notes/:id` | — (author or admin) | `{ deleted: true }` | |
| `GET /notes/my` (member) | — | `[{ id, trainer_name, category, note, created_at }]` newest first: the notes about me where `visible_to_member`, with only what the dashboard shows (no `trainer_user_id`, `member_id` or `visible_to_member`) | |

When a booking is marked `attended`, it counts towards the member's streak for that day. Changing it back to `no_show`
or `confirmed` takes the day back unless other activity on that day also counted it (the streak is rebuilt from history).

`GET /trainer/me` details:
- `recent_sessions`: the trainer's sessions that have started, from today and the 13 days before (14 days), newest
  first: `[{ class_id, class_title, category, room, date, start_time, duration_minutes, starts_at, booked, unmarked }]`.
  A session is listed when it has at least one booking that was not cancelled; `booked` counts those bookings
  (confirmed, attended and no-show: a no-show still held a spot) and `unmarked` the ones still `confirmed`. Sessions
  come from bookings, so one held before its class moved to another weekday is listed too. Attendance can be taken
  for any of them through the roster (`GET /bookings/class/:classId/roster?date=`) and `PATCH /bookings/:id/attendance`.
- `attendance_rate_30d`: of the bookings marked `attended` or `no_show` with a `booking_date` from today and the 29
  days before (exactly 30 days), the percentage attended; `null` when none were marked.
- A trainer's clients: a member is one of a trainer's clients exactly when they hold at least one booking in one of
  the trainer's classes that was not cancelled (confirmed, attended or no-show). `GET /trainer/clients`,
  `stats.clients_count` and the right to write a note (`POST /trainer/notes`) all use this one rule; a note on its
  own does not make someone a client. An admin view without `trainer_id` covers every class. Notes about someone
  who is no longer a client stay readable through `GET /trainer/notes` (with `member_name`); the coach dashboard
  offers such members under "Earlier clients" in its notes filter.

Additional rules:
- `GET /classes/:id?date=` and the roster answer 400 `DATE_MISMATCH` for a date that is not a session of the class
  (its current weekday, or a date that still has bookings for it).
- `POST /bookings` checks `ALREADY_BOOKED` before `CLASS_FULL`, so a retry always gets the same answer.
- Spots a member can no longer use are released automatically: freezing a membership (by the member or an admin)
  cancels their upcoming confirmed bookings and closes an open floor session; changing a class's category, a
  member's tier (by an admin or by buying another plan), or a plan's categories cancels upcoming bookings the
  member's plan no longer covers; an admin edit that ends or shortens a membership or makes the account staff
  cancels the bookings it no longer allows (see `PUT /members/:id`). The response `message` says how many were cancelled.
- `MEMBERSHIP_ENDS_BEFORE_CLASS`: the error names the last day as people read it (`8 Oct 2026`); `data.membership_expiry`
  is `YYYY-MM-DD`.
- `PUT /classes/:id`: 409 `CAPACITY_BELOW_BOOKINGS` (`data.max_booked`) when the new capacity is below an occurrence's
  bookings; moving a class to another weekday cancels its upcoming confirmed bookings.
- Classes run inside opening hours: Monday to Saturday, starting at 06:00 or later and ending (start + duration) by 22:00.
  `POST /classes`, and a `PUT /classes/:id` that changes `day_of_week`, `start_time` or `duration_minutes`, answer 400
  `VALIDATION_ERROR` with `data.issues` naming `day_of_week` (closed day), `start_time` (before opening, or at or after
  closing time) or `end_time` (runs past closing). Classes stored before this rule stay listed and can still be renamed
  or otherwise edited.
- `POST/PUT /trainers`: 409 `EMAIL_TAKEN`, 400 `USER_NOT_TRAINER`, 409 `USER_ALREADY_LINKED`; `user_id: null` unlinks the account.
  `avatar_url` is an `https://` image address on a public website, or `''` for no photo (the apps show the neutral default
  picture); `POST` without one stores `''`. A DiceBear address (`https://api.dicebear.com/…`) is 400 `VALIDATION_ERROR` on
  `avatar_url`: the server clears those whenever it loads the database (see `SafeUser`).
- Trainer data for signed-in accounts (`GET /trainers`, `GET /trainers/:id`, the `trainer` in `GET /classes/:id`) leaves
  out email, phone and user_id unless the caller is an admin.
- `PATCH /bookings/:id/attendance` on a cancelled booking: 409 `ALREADY_CANCELLED`. `DELETE /bookings/:id` on an attended
  or no-show booking: 400 `CLASS_STARTED`.
- Trainer notes: 404 `NO_TRAINER_PROFILE` for a trainer account not linked to a trainer record; 403 `NOT_YOUR_CLIENT` when
  the member is not one of the trainer's clients, e.g. they never booked the trainer's classes or every such booking
  was cancelled (admins are exempt).

---

## Members, check-in, attendance, trials & enquiries — owner: `members` (routes/members.ts, controllers/memberController.ts, attendanceController.ts, trialController.ts, enquiryController.ts)

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /members` (admin) | `search?, tier?, status?` (effective status), `role?` (default `member`; `all` = everyone) | `SafeUser[]` | |
| `GET /members/:id` (admin) | — | `SafeUser & { bookings_count, attendance_count, workouts_count, upcoming_bookings, recent_attendance: AttendanceLog[] (10), payments: Payment[], id_cards: IdCard[] (newest first), rewards: { balance, recent_points: PointsEntry[] (20 newest), claims: GiftClaim[] (newest first), referred_by: { id, name } | null, can_add_referrer } }` (`can_add_referrer`: what `POST /members/:id/referrer` would allow) | 404 |\| null } }` | 404 |
| `POST /members` (admin) | `{ name, email, phone?, gender?, role? = 'member', membership_tier? = 'none', expiry_months? = 0 (0–24), desk_sale?: DeskSale, referral_code? }`. Tier ≠ none and months > 0 ⇒ active until the day before today + months. With `desk_sale` the account is created without a plan and the sale activates it, as `POST /members/:id/desk-sale` does; with `referral_code` too, that sale credits the referral in the same request. Without `gender` the account has none; `avatar_url` is `''` | 201 `{ member: SafeUser, tempPassword, payment?: Payment, gifts?: GiftClaim[] }` (`payment` and `gifts` with `desk_sale`) | 409 `EMAIL_TAKEN`, 400 `REFERRAL_CODE_INVALID` (nothing is created), 400 `VALIDATION_ERROR` on `desk_sale` (together with `expiry_months > 0`, or with a `membership_tier` other than `none` or the sale's tier) |
| `PUT /members/:id` (admin) | `{ name?, phone?, gender? (or null to clear it back to "not given"), role?, membership_tier?, membership_status?, membership_expiry? (date \| null) }` | `SafeUser` | 400 `CANNOT_CHANGE_OWN_ROLE`, 400 `LAST_ADMIN`, 403 `DEMO_ACCOUNT_LOCKED` (role change of a demo persona in demo mode) |
| `DELETE /members/:id` (admin) | — | `{ deleted: true }`. Removes bookings, workouts, attendance, floor sessions, notes about them, ID cards, reset tokens, points history and gift claims (the stock their `ready` claims held goes back, to the oldest waiting claims first), clears `referred_by` on the members they referred, and re-keys their referrer's `referral:<id>` points entry to `referral:deleted:…`; keeps payments (financial records) | 400 `CANNOT_DELETE_SELF`, 400 `LAST_ADMIN`, 403 `DEMO_ACCOUNT_LOCKED` (demo mode, one of the four demo personas) |
| `POST /members/:id/desk-sale` (admin) | `DeskSale` = `{ tier: 'basic'\|'pro'\|'vip', billing_cycle: 'monthly'\|'annual', amount_inr: integer 1–1 200 000 (what was collected), method: 'cash'\|'upi'\|'card' }` (strict). Records a front-desk sale as a `Payment` with `source: 'desk'` and an invoice, activated like an online payment (see the activation rules) with its joining gifts | `{ user: SafeUser, payment: Payment, gifts: GiftClaim[] }`; `message` names the plan, its last day and any joining gifts | 409 `DESK_SALE_DUPLICATE` (a desk sale for the same member, tier, cycle and amount was recorded in the last 2 minutes; nothing is written), 404 |
| `POST /members/:id/referrer` (admin) | `{ referral_code }` (1–32 characters, ignoring case and spaces around it; strict). Links a referrer the member forgot to name at sign-up | `{ referred_by: { id, name } | null, can_add_referrer } }` (`can_add_referrer`: what `POST /members/:id/referrer` would allow) | 404 |}` | 400 `REFERRAL_CODE_INVALID`, 400 `REFERRAL_SELF` (the member's own code), 409 `REFERRAL_LOCKED` (the member already has a referrer, has a paid payment, has had a membership, or was created before rewards launched: desk sales were not recorded before then), 404 |
| `POST /members/:id/points` (admin) | `{ points: integer −100 000…100 000, not 0; note: 1–200 chars }`. Adds (or, negative, removes) points; any account, whatever its plan | `{ balance, entry: PointsEntry }` (`key` `adjust:<uuid>`, `reason: 'admin_adjust'`) | 400 `POINTS_NEGATIVE` (the balance would drop below 0), 404 |
| `POST /members/:id/reset-password` (admin) | — | `{ tempPassword }` (old tokens revoked) | 403 `DEMO_ACCOUNT_LOCKED` (demo mode, one of the four demo personas), 404 |
| `POST /attendance/check-in` (admin, trainer) | `{ code, method?: 'qr'\|'manual'\|'kiosk'\|'camera' }` (`tokenOrId` accepted as an alias of `code`). `code` = QR token, ID card number, member id, email, or trial code, looked up in that order (tokens, emails and trial codes ignore case; card numbers also ignore spaces and hyphens) | `{ result: 'granted', already_checked_in: boolean, kind: 'member'\|'trial', member?: { id, name, email, avatar_url, membership_tier, membership_status, membership_expiry, streak_days }, trial?: TrialPass, log: AttendanceLog, gifts_to_collect?: GiftClaim[] }` (`gifts_to_collect`, on member check-ins: the member's `ready` and `needs_size` claims, oldest first). A second scan on the same gym day lets the member through without a new log or streak day. An active ID card works exactly like the QR token | 403 `CARD_DEACTIVATED` (with `data.member` and `data.card: { card_number, status, deactivated_at, deactivation_reason }`; checked before the hours and membership) \| `GYM_CLOSED` \| `MEMBERSHIP_EXPIRED` \| `MEMBERSHIP_FROZEN` \| `MEMBERSHIP_PENDING` \| `TRIAL_NOT_VALID_TODAY` \| `TRIAL_ALREADY_USED` (with `data.member` or `data.trial`), 404 `PASS_NOT_FOUND` |
| `GET /attendance/logs` (admin) | `date?, user_id?, limit? (1–200, default 50), offset?, format? = 'json'\|'csv'` | `{ items: AttendanceLog[], total }`, or a `text/csv` download | |
| `GET /attendance/my` | — | the caller's `AttendanceLog[]`, newest first (≤ 100) | |
| `POST /trials` (public, 5 per hour per IP) | `{ name, email, phone, interest: ClassCategory, preferred_date }` (today … today + 14, not a Sunday, not today once the gym has closed) | 201 `TrialPass` (`code` = `PULSE-TRIAL-XXXXXX`, valid only on `valid_on`, once) | 409 `TRIAL_ALREADY_CLAIMED` (same email or phone), 400 `GYM_CLOSED` |
| `GET /trials` (admin) | — | `TrialPass[]` newest first | |
| `POST /enquiries` (public, 5 per hour per IP) | `{ name, email, phone, interest: ClassCategory \| 'All-Access' \| 'Not sure yet', contact_time: 'Any time' \| 'Morning' \| 'Afternoon' \| 'Evening', message? (≤ 1000, default ''), consent: true, website? }` | 201 `null` with `message` | 400 `VALIDATION_ERROR`, 429 `RATE_LIMITED` |
| `GET /enquiries` (admin) | — | `Enquiry[]` newest first, last 12 months | |
| `PATCH /enquiries/:id` (admin) | `{ status: 'new' \| 'contacted' \| 'closed' }` | `Enquiry` | 404 `ENQUIRY_NOT_FOUND` |

Additional rules:
- `PUT /members/:id` answers 400 `VALIDATION_ERROR` on `membership_expiry` when the request sends
  `membership_status: 'active'`, or sends a `membership_expiry` while the stored status after the edit is `active`, and
  the resulting expiry is missing or before today; and on `membership_tier` when the membership would be active today with tier `none`.
  A lapsed member (stored `active` past the expiry, shown as `expired`) can have their plan, name or phone changed and
  stays lapsed; sending `membership_status: 'expired'` with the change also works and stores the lapse. Both request
  shapes (only the changed fields, or the changed fields plus the status the form shows) are accepted.
- Edits through `PUT /members/:id` (dates, plan, status, unfreezing, free time) never grant joining gifts; only a
  recorded sale (`POST /members/:id/desk-sale`, or `desk_sale` on `POST /members`) does.
- Moving from `frozen` to `active` gives back the open days missed, like `/membership/unfreeze`, unless the same request
  sends an expiry (the admin's explicit choice).
- After a change of role, status, expiry or tier, the member's upcoming confirmed bookings that `POST /bookings` would
  now refuse are cancelled: all of them when the account becomes staff (staff cannot book) or the status is not
  `active`, those dated after the expiry, and those in categories the plan does not include. When such a change leaves
  a member's membership not active (`frozen`, `expired` or `pending`), their open floor session also ends, as clock-in
  would now refuse them (staff keep theirs). `message` is `Member updated. N upcoming booking(s) was/were cancelled.`
  when any were.
- In demo mode the four demo personas (`member@`, `vip@`, `trainer@`, `admin@pulsefit.com`) cannot have their password
  reset (`POST /members/:id/reset-password`), be deleted (`DELETE /members/:id`) or have their role changed
  (`PUT /members/:id` with a different `role`): 403 `DEMO_ACCOUNT_LOCKED`, so a visitor of a public demo cannot lock everyone
  else out of them or turn `POST /auth/demo-login` into a different account. Other edits (name, plan, status) still work.
  The self and last-admin checks answer first.
- A trial pass scanned again on the day it was redeemed is let through with `already_checked_in: true`.
- `Enquiry` = `{ id, name, email, phone, interest, contact_time, message, status: 'new' | 'contacted' | 'closed', created_at }`.
  `website` is a trap field the form hides from people: when it is filled the answer is the same 201, and nothing is
  stored or emailed.
- An enquiry is stored before any email. With `BREVO_API_KEY` and `MAIL_FROM` set it is then emailed, after the
  response, to `ENQUIRY_INBOX` (Reply-To = the enquirer), with a fixed-text confirmation to the enquirer (Reply-To = the
  inbox) at most once per address per 24 h. Email failures are logged by enquiry id and never change the response.
- Enquiries older than 12 months are not listed and are removed from the database on the next `POST /enquiries`.
- A trial `preferred_date` outside today … today + 14 is 400 `VALIDATION_ERROR`. The CSV export ignores `limit`/`offset`.
- Request bodies are strict: unknown keys are 400 `VALIDATION_ERROR`. Staff skip membership checks at check-in.
- `gender` on `POST /members` and `PUT /members/:id` is one of `male`, `female`, `other`, else 400
  `VALIDATION_ERROR` on `gender` ("Choose male, female or other."). `GET /members` and `GET /members/:id`
  carry it (as part of `SafeUser`) when given. The check-in `member` never does, for admins either.
- Opening hours (when `ENFORCE_OPENING_HOURS` is on, the default): while the gym is closed (Sundays, and outside
  06:00–22:00 on other days) check-in refuses members and free-trial passes with 403 `GYM_CLOSED` ("The gym is closed
  right now. Opening hours are Monday to Saturday, 06:00 to 22:00.", with `data.member` or `data.trial`); the trial pass
  stays unused. Staff are let in at any hour. `POST /trials` for today after 22:00 is 400 `GYM_CLOSED` ("The gym has
  closed for today. Please pick another day."); a Sunday is 400 `GYM_CLOSED` whatever the setting.
- Check-in closes floor sessions left open for 4 hours (as the floor endpoints do) before it counts today's visit, so
  a clock-out forgotten yesterday still counts towards the streak. Dates in messages read like "1 Aug 2026".

---

## ID cards — owner: `members` (routes/idCards.ts, controllers/idCardController.ts, lib/idCards.ts)

The gym hands out physical ID cards. Each card has its own number, `PFC-XXXX-XXXX` (no 0/O/1/I), which is printed on it
and is also its QR code, so a lost card can be switched off at check-in while the member's app pass keeps working. A
person has at most one active card.

`IdCard = { id, user_id, card_number, status: 'active'|'deactivated', issued_at, issued_by_id, issued_by_name,
deactivated_at, deactivation_reason: 'lost'|'stolen'|'damaged'|'returned'|'replaced'|'other'|null, deactivation_note,
replaces_card_id, events: [{ type: 'issued'|'deactivated'|'reactivated', at, by_id, by_name, reason?, note? }] }`.
The admin's name is a snapshot, so the history still reads right after that admin is deleted.

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /id-cards` (admin) | `status? = 'all'\|'active'\|'deactivated'\|'none'`, `role? = 'member'\|'trainer'\|'admin'\|'all'` (default `member`), `search?` (name, email, phone, pass token, or any of the person's card numbers however typed) | `{ counts: { people, active, deactivated, none, cards_issued }, rows: [{ user: { id, name, email, phone, avatar_url, gender? (when given, so the card the desk prints has the same default picture the person sees), role, membership_tier, membership_status, membership_expiry, created_at }, card_status: 'active'\|'deactivated'\|'none', card: IdCard \| null, cards_issued }] }`. `card` is the current card: the active one, else the latest issued. Rows are sorted by name; `counts` are taken before the status filter | 400 `VALIDATION_ERROR` |
| `POST /members/:id/id-cards` (admin) | `{ replace?: boolean, replaces_card_id?: string, note?: string (≤ 200) }` | 201 `{ card: IdCard, replaced: IdCard \| null }`. With `replace: true` the active card is deactivated as `replaced` in the same write, and the new card's `replaces_card_id` points to it | 409 `CARD_ALREADY_ACTIVE` (an active card and no `replace`, or `replaces_card_id` is not the active card any more; `data.card` = the active card), 404 |
| `POST /id-cards/:cardId/deactivate` (admin) | `{ reason: 'lost'\|'stolen'\|'damaged'\|'returned'\|'other', note? }` (`replaced` is the server's own) | `{ card }` | 409 `CARD_ALREADY_DEACTIVATED`, 404 `CARD_NOT_FOUND` |
| `POST /id-cards/:cardId/reactivate` (admin) | `{ note? }` | `{ card }` (deactivation fields cleared, history kept) | 409 `CARD_ALREADY_ACTIVE`, 409 `ANOTHER_CARD_ACTIVE` (`data.card` = the person's other active card), 404 `CARD_NOT_FOUND` |
| `GET /id-cards/mine` (any signed-in user) | — | `{ card: { id, card_number, status, issued_at, deactivated_at, deactivation_reason } \| null }`: the caller's current card, without history, notes or staff names | |

- `replaces_card_id` guards against two desks replacing the same card: the second request names a card that is no longer
  active and gets 409, instead of switching off the card the first desk just handed over.
- Deleting a person deletes their cards. Old database files without `id_cards` load with none.
- The demo seed gives the member, All-Access and coach personas active cards, one member a card deactivated as lost and
  one member a replaced card; the catalogue-only start has no cards.

---

## Workouts, fitness guide, floor time & analytics — owner: `activity` (routes/activity.ts, controllers/workoutController.ts, guideController.ts, timeTrackingController.ts, analyticsController.ts)

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /exercises`, `GET /exercises/:id` | filters `category, equipment, difficulty, search` | `Exercise[]` / `Exercise` | 404 |
| `GET /guide` (staff, and members with a plan) | — | `FitnessGuide` (see below), with `Cache-Control: private, no-cache` | 401 `UNAUTHORIZED` (guests), 403 `PLAN_REQUIRED` (a member whose status is `pending` or `expired`, or `frozen` past the paid end date; no `data`) |
| `GET /workouts` | — | own `Workout[]` newest first | |
| `GET /workouts/:id` | — | `Workout` (owner or admin) | 404, 403 |
| `POST /workouts` | `{ title (1–100), date (not after today, not more than 365 days ago), duration_minutes (1–300), notes? (≤ 1000), sets: [{ exercise_id (must exist), set_number (1–50), weight_kg (0–500), reps (1–100), rpe? (1–10), is_warmup? }] (1–100 items) }` | 201 `Workout`; `set_number` is kept as sent (per exercise); volume = Σ weight × reps of working sets | 400 |
| `DELETE /workouts/:id` | — | `{ deleted: true }`. Deleting a workout logged on the day it was for takes that streak day back unless other activity counted it | |
| `GET /workouts/analytics` | — | `{ volumeTimeline, personalRecords, muscleDistribution, … }` | |
| `POST /time-tracking/clock-in` | `{ category: ClassCategory, notes? }` | 201 `TimeSession` | 403 `GYM_CLOSED`, 403 `MEMBERSHIP_INACTIVE`, 403 `PLAN_EXCLUDES_CATEGORY`, 409 `ALREADY_CLOCKED_IN` |
| `POST /time-tracking/clock-out` | `{ notes? }` (own active session; an admin may pass `session_id`) | `TimeSession` | 404 `NO_ACTIVE_SESSION` |
| `GET /time-tracking/active-floor` | optional auth | `{ totalActive, workoutActive, zumbaActive }`; admins also get `workoutUsers` / `zumbaUsers` (`user_name, user_avatar, user_tier, clock_in_time, duration_minutes`; no emails). Coaches, members and guests get the counts only | |
| `GET /time-tracking/my-stats` | — | `UserTimeTrackingStats` | |
| `GET /analytics/dashboard` (admin) | — | see below | |

Sessions still open 4 hours after clock-in are closed automatically at clock-in + 4 h (`auto_closed: true`).
A completed session counts towards the streak; so does a workout logged for today.

**Streak.** The number of consecutive open gym days with activity (check-in, completed floor session, attended class,
workout logged for its own day). Closed days (Sundays) never break a run, and activity on one still counts as a day, so
a Saturday run continues on Monday. `streak_days` shows 0 once an open day before today went by without activity; today
itself never breaks it. Withdrawing a counted day (attendance corrected, workout deleted) rebuilds the streak from history.

Additional rules:
- `GET /workouts/analytics` returns `{ totalWorkouts, totalVolumeKg, avgDurationMinutes, volumeTimeline, personalRecords,
  muscleDistribution }`; `personalRecords` = best estimated 1RM (Epley) per exercise.
- `POST /workouts` rejects a repeated (`exercise_id`, `set_number`) pair. Floor notes are capped at 500 characters.
- `POST /time-tracking/clock-out`: a member may pass the `session_id` of their own session; someone else's is 403.
- `POST /time-tracking/clock-in` while the gym is closed (when `ENFORCE_OPENING_HOURS` is on) is 403 `GYM_CLOSED` for
  members, with the same message as check-in. Staff may clock in at any hour, and clocking out always works.

**Fitness guide** (`GET /guide`). Workout plans, diet charts, nutrition rules, the supplements guide and the strength
floor's starter split, for admins, coaches and members whose effective `membership_status` is `active` or `frozen`.
Members without a plan (`pending`: every new account until its first payment or an admin grants one) and members whose
plan has ended (`expired`, also an `active` one past its expiry, and a `frozen` one past its `membership_expiry`: a freeze
pauses a plan without extending it, and unfreezing adds the missed days back, and with them the guide) get 403
`PLAN_REQUIRED` with none of it; guests get 401. A payment that activates a plan unlocks it at once (the client asks
again when the account's status changes). The content lives only on the server (`server/src/content/guide.ts`), never
in the client bundle. The website's pages that read it need an account; members without a plan see a teaser of the
client's own (plan names, diet titles and split days; `tests/guide.test.ts` keeps them in step with the server) and a
way to choose a plan.
```ts
{
  workout_plans: [{ id, name, level, goal, frequency, description,
                    days: [{ name, exercises: [{ name, sets, reps, rest, tip }] }] }], // text, e.g. sets: '4 Sets'
  diet_charts: [{ id, title, type, macros: { protein_g, carbs_g, fats_g },           // numbers, grams
                  description, meals: [{ timing, name, items: string[], calories }] }], // calories: whole kcal
  nutrition_rules: [{ emoji, title, text }],
  supplements: [{ name, badge, stars /* 1–5 */, verdict, dosage, timing, why, faqs: [{ question, answer }] }],
  strength_split: [{ day, title, exercises: string[] }]                                // 4 days, shown on /strength
}
```

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

---

## Rewards — owner: `rewards` (routes/rewards.ts, controllers/rewardsController.ts, lib/points.ts, gifts.ts)

| Method & path | Body / query | Success `data` | Errors |
|---|---|---|---|
| `GET /rewards/ledger` (member) | `limit?` (1–100, default 20), `offset?` | `{ balance, items: PointsEntry[] (newest first), total }` | 403 (staff) |
| `GET /rewards/me` (member) | — | `MyRewards` (below); the first call makes the member's referral code | 403 (staff) |
| `GET /rewards/gifts` (signed in) | — | admin: `Gift[]` (the whole catalogue); others: `StoreGift[]` (active gifts with a `points_cost`, cheapest first) | |
| `POST /rewards/gifts` (admin) | gift fields (below) | 201 `Gift` | 400 `VALIDATION_ERROR` |
| `PUT /rewards/gifts/:id` (admin) | any gift fields (below), checked together with the stored ones; `stock` or `stock_by_size` only with `expected_stock: { stock, stock_by_size? }`, the stored counts the change was based on | `Gift`; `message` says how many waiting claims became ready | 404 `GIFT_NOT_FOUND`, 400 (stock without `expected_stock`), 409 `STOCK_CHANGED` (claims moved the stock since: nothing is saved), 409 `SIZE_IN_USE` (a removed size that a `waiting` or `ready` claim holds, or sizes added or removed while a `waiting` or `needs_size` claim names the gift), 409 `GIFT_IN_RULES` (`active: false` on a gift a milestone or joining gift names; change the rule first) |
| `DELETE /rewards/gifts/:id` (admin) | — | `{ deleted: true }` | 404 `GIFT_NOT_FOUND`, 409 `GIFT_IN_USE` (a claim, milestone or joining gift names it; deactivate it instead) |
| `POST /rewards/claims` (member) | `{ gift_id, size? }` | 201 `GiftClaim` (`ready`, with a pickup code) | 404 `GIFT_NOT_FOUND` (unknown, inactive or reward-only), 400 `SIZE_REQUIRED` / `SIZE_INVALID`, 409 `OUT_OF_STOCK`, 409 `NOT_ENOUGH_POINTS` |
| `PATCH /rewards/claims/:id` (signed in) | one of `{ status: 'handed_over', size? }` (admin, trainer), `{ status: 'cancelled', reason? (≤ 200) }`, `{ size }` | `GiftClaim` | 404 `CLAIM_NOT_FOUND` (also another member's claim), 409 `CLAIM_NOT_READY` (wrong status for the action, including a size for a claim that is not `needs_size`), 403 `CLAIM_NOT_CANCELLABLE` (a member cancelling a milestone or joining gift), 403 `FORBIDDEN` (a member handing over, a trainer cancelling), 400 `SIZE_REQUIRED` / `SIZE_INVALID`, 409 `OUT_OF_STOCK` |
| `GET /rewards/claims` (admin) | `status?`, `user_id?`, `search?` (member name or pickup code) | `GiftClaim[]` oldest first | |
| `GET /rewards/settings` (admin) | — | `RewardSettings` | |
| `PUT /rewards/settings` (admin) | `RewardSettings` without `launched_at`: the whole rules object | `RewardSettings` | 400 `VALIDATION_ERROR` (an unknown or inactive gift id names its path, e.g. `milestones.0.gift_id`) |

```ts
PointsEntry = { id, user_id, key, points /* + earned, − spent */, reason: 'checkin' | 'workout' | 'referral' | 'claim'
                | 'refund' | 'admin_adjust' | 'bonus', ref?, note?, created_at }
Gift = { id, name, description, image /* an emoji, or an image data URL */, level: 'small' | 'medium' | 'big' | 'premium',
         points_cost: number | null /* null = reward-only, not in the store */, stock: number | null /* null = unlimited */,
         sizes?: ('S' | 'M' | 'L' | 'XL' | 'XXL')[], stock_by_size?: { [size]: number }, kind: 'item' | 'service', active, created_at }
StoreGift = { id, name, description, image, level, points_cost, kind, sizes?, in_stock: boolean, sizes_in_stock?: size[] }
GiftClaim = { id, user_id, user_name, gift_id, gift_name /* snapshots */, size?, source: 'store' | 'milestone' | 'joining',
              source_ref /* milestone id, payment id, '' for the store */, points_spent, pickup_code /* 6 characters */,
              status: 'needs_size' | 'waiting' | 'ready' | 'handed_over' | 'cancelled', created_at,
              handed_over_at?, handed_over_by?: { id, name }, cancel_reason?,
              sizes? /* on a needs_size claim in MyRewards, member detail and gifts_to_collect: its gift's sizes */ }
MyRewards = { balance, visits, streak /* staff-confirmed, as for milestones */,
              milestones: { id, type: 'visits' | 'streak', threshold, gift_name, reached: boolean }[],
              earning: { checkin, workout, referral, referral_welcome }, claims: GiftClaim[] /* newest first */,
              referral_code /* 8 characters from A–Z and 2–9 without I, O, 0, 1; the member's own, to share */ }
RewardSettings = { points_per_checkin, points_per_workout, points_per_referral, welcome_points_for_referred,
                   milestones: { id, type, threshold, gift_id }[], joining_gifts: { tier, billing_cycle, gift_ids, once_per_member }[],
                   launched_at? }
```

Gift fields (strict): `name` 2–60, `description` ≤ 300 (default `''`), `image` an emoji (1–8 characters, none of
`< > / : " '`) or a PNG, JPEG or WebP data URL checked like a profile photo (≤ 350 000 characters), `level`, `points_cost`
integer 1–100 000 or `null`, `kind`, `active` (default `true`). Either `sizes` (non-empty, no repeats) with
`stock_by_size` holding a count (integer ≥ 0) for exactly those sizes, in which case `stock` is stored as `null`; or no
sizes and `stock` (integer ≥ 0, or `null` for unlimited; required). Services have no sizes. Rules (strict): point values
integers 0–100 000; at most 30 milestones (`threshold` 1–10 000); each joining gift names at most 5 gifts; every gift a
rule names must exist and be active. A milestone sent with the `id` of a current milestone keeps it, so members who
reached it are not granted it again; any other milestone gets a new id.

Additional rules:
- **Who earns:** members (`role: 'member'`) with a plan, as for `GET /guide`: effective status `active`, or `frozen` up
  to the paid end date (`membership_expiry`). Coaches, admins, lapsed and
  pending members and free-trial passes earn no points and no gifts. Only an admin adjustment
  (`POST /members/:id/points`) works on any account.
- **The ledger** is append-only. Every entry has a `key` that is unique across the ledger, so each award happens once
  however often its trigger repeats: `checkin:<attendanceId>`, `workout:<userId>:<date>`, `milestone:<milestoneId>:<userId>`,
  `launch-gift:<userId>`, `join:<paymentId>`, `join-once:<giftId>:<userId>`, `referral:<referredUserId>`,
  `referral-welcome:<referredUserId>`, `claim:<claimId>`, `refund:<claimId>`, `adjust:<uuid>`. A gift award is a 0-point
  `bonus` entry carrying its key.
- **Balance** = the sum of the member's entries; no balance is stored. Request bodies never carry points.
- **Check-in:** a new staff check-in (`POST /attendance/check-in`, not the `already_checked_in` repeat) earns
  `points_per_checkin`, key `checkin:<attendanceId>`.
- **Workout:** the first workout a member logs for today earns `points_per_workout`, key `workout:<userId>:<date>`.
  Deleting it takes nothing back and re-logging that day earns nothing more; back-dated workouts earn nothing.
- **Milestones** count only days the gym confirmed: `visits` = the member's check-ins; `streak` = consecutive open gym
  days with a check-in or a class marked attended (closed days bridge, 0 once an open day passed without one).
  Self-reported floor sessions and workouts do not count here (they still count for `streak_days`). A milestone is
  granted when a check-in or a newly attended class crosses it (`before < threshold ≤ after`), as a claim with no points
  spent, and only once per member ever (key `milestone:<milestoneId>:<userId>`): a dropped and rebuilt streak, or a
  milestone added or lowered below the member's value, grants nothing.
- **Launch:** the first time the server starts with rewards (`reward_settings.launched_at` unset), each member who earns
  rewards and has already passed milestones (visits = all their check-ins; streak = their longest run of confirmed days)
  gets one welcome gift: the gift of the highest milestone passed (higher gift level, then higher `points_cost`, then the
  later milestone in the list), key `launch-gift:<userId>`, source `milestone`. Every milestone they passed is recorded as
  done (0-point `bonus`, key `milestone:<milestoneId>:<userId>`, note "Reached before rewards launched"), so none fires
  later. No points are written: everyone starts at 0. `launched_at` is then set and the step never runs again.
- **Joining gifts** come with every paid activation, online (verify, the Razorpay webhook, YouPI) or a recorded desk
  sale, for a member who earns rewards once the plan is active: the `joining_gifts` entries for the plan's tier and
  cycle. Gifts of entries with `once_per_member: false` (the annual kits) come with every such payment, key
  `join:<paymentId>`, so verify and the webhook for one payment grant them once; each gift of a `once_per_member: true`
  entry (the monthly sample pack) comes once per member ever, key `join-once:<giftId>:<userId>`.
- **Referrals.** Every member has a `referral_code` (made on first need, unique, never changed). Sign-up (email or Google)
  and `POST /members` take a friend's code and set `referred_by` (the friend's user id) on the new account; only codes
  of members (`role: 'member'`) count. Until the member's first paid payment an admin can add a referrer they forgot
  (`POST /members/:id/referrer`); afterwards, or once set, it never changes. On the referred member's **first** paid
  activation (online or a recorded desk sale; any earlier paid payment means it is not the first), the referrer earns
  `points_per_referral` (key `referral:<referredUserId>`) while they themselves earn rewards (an expired referrer gets
  nothing, now or later), and the member earns `welcome_points_for_referred` (key `referral-welcome:<referredUserId>`),
  both with reason `referral`. A point value of 0 writes no entry. The referrer's entry does not name the friend.
  `referral_code` and `referred_by` are never part of `SafeUser`; only `GET /rewards/me` (the member's own code) and the
  admin member detail (`rewards.referred_by`) show them.
- **Claims.** Every gift a member is owed is a claim: `needs_size` (an automatic apparel gift waiting for the member, in
  the app, or the desk to pick a size), `waiting` (owed but out of stock), `ready` (stock set aside; collected with the
  pickup code), `handed_over` or `cancelled`. Milestone and joining gifts never fail for stock: they start `needs_size`
  or `waiting`. A store claim checks the gift (active, in the store), the size, the stock and the balance in one step,
  writes `claim:<claimId>` for −`points_cost` and starts `ready`.
- **Stock** is counted per size for apparel (`stock_by_size`) and as one number otherwise (`null` = unlimited). It is taken
  when a claim becomes `ready` and given back when a `ready` claim is cancelled or its member is deleted. Stock given
  back or added (`PUT /rewards/gifts/:id`) makes the gift's `waiting` claims `ready`, oldest first, each only when its own
  size has stock.
- **Pickup.** Admins and trainers hand over a `ready` claim, or a `needs_size` claim with a `size` that has stock (which
  takes it), recording `handed_over_at` and `handed_over_by`. `{ size }` alone, by the member on their own `needs_size`
  claim or by staff on any, makes it `ready` (taking stock) or `waiting` for that size. A size never changes once set
  (no size exchange). Service gifts (free PT session, free week, guest pass) are fulfilled by staff, e.g. by extending
  the membership in the member editor, then marked handed over.
- **Cancelling.** A member cancels only their own `ready` store claim, refunded (`refund:<claimId>`, +`points_spent`,
  reason `refund`); an admin cancels any `ready` claim, refunded only when it is a store claim. Its stock goes back.
- **Editing gifts.** Claims keep the gift's name as it was, so a renamed or deactivated gift stays collectable; a
  deactivated or reward-only gift leaves the store. A size a `waiting` or `ready` claim holds cannot be removed
  (`SIZE_IN_USE`), a gift a rule names cannot be deactivated (`GIFT_IN_RULES`), and only a gift no claim or rule names can
  be deleted (`GIFT_IN_USE`). A sized gift cannot be turned back into one without sizes.
- Members and trainers never see stock counts, only `in_stock` and `sizes_in_stock`.
- The gym starts with a catalogue of 24 gifts (items with no stock until the gym enters its counts, apparel counted per
  size `S`–`XXL`, three unlimited services) and default rules: 10 points per check-in, 5 per workout, 200 per referral,
  50 welcome points for a referred member; milestones 10 visits → keychain, 30-day streak → shaker, 100 visits →
  lifting straps, 250 visits → hoodie; joining gifts on annual plans (basic/pro: T-shirt + shaker; vip: hoodie +
  shaker + water bottle) and a supplement sample pack once per member on any monthly plan. A database from before
  rewards gets these defaults when it loads.
- The demo seed (not the catalogue-only one) also stocks every item (25) and apparel size (5), runs the launch, gives the
  member persona 400 points (key `seed-bonus:<userId>`) and the All-Access persona a `ready` store claim for a coffee
  mug, and adds the sale `offer_demo_annual` (15% off annual plans, from a day ago to 7 days ahead) and the coupon
  `WELCOME10` (10% off monthly plans, valid from today for 90 days). The catalogue-only seed has no claims, points, sales
  or coupons.
