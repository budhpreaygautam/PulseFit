# Changelog

All notable changes to PulseFit. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

The service pages now need an account and the fitness guide a plan, sign-up asks for gender to pick a default profile
picture, the API stops answering casual direct access, the header and pricing cards fit their space, and there is a
contact page with an enquiry form.

### Added

- **Gender at sign-up.** Creating an account with email asks for gender (male, female or other), as
  a dropdown. It is used only to pick the default picture shown until the person
  uploads a photo. Members can change it on My account; admins can set, change or clear it when adding or editing a
  member, and see it in the member's details. Google sign-ups and existing accounts start without one ("Not given"); a
  new Google account is taken to My account to choose one, unless the person was on the way to a page they had asked for.
  `POST /api/auth/register` takes an optional `gender`: the sign-up form always asks for it, but the apps installed from
  2.3.0 do not send one, and their sign-ups keep working (the account starts without one).
- **Default profile pictures.** Three built-in pictures (male, female and neutral, at `/avatars/*.svg`) replace the
  initials badges and the DiceBear cartoons everywhere: header, dashboard, My account, QR pass, ID card, member lists
  and details, rosters, coach lists, the timetable and the check-in scanner. An uploaded photo always wins. The gendered
  picture shows to the person and admins, and on the person's QR pass and ID card (also one the desk prints), so anyone
  they show those to sees it; coaches', other members' and visitors' screens always show the neutral one.
- **Change avatar.** On My account, "Change photo" becomes "Change avatar", also on the profile picture itself: a small
  window offers ten ready-made avatars, saved with one tap, and "Custom" to upload a photo as before.
  `PUT /api/auth/profile` accepts their paths (`/avatars/preset-01.svg` … `/avatars/preset-10.svg`) as `avatar_url`.
- **`GET /api/guide`** serves the fitness guide (workout plans, diet charts, nutrition rules, supplements and the
  strength split) to admins, coaches and members whose plan is active or frozen. Members without a plan (every new
  account until its first payment) or whose plan has ended get 403 `PLAN_REQUIRED` and none of it. A freeze pauses a
  plan without extending it: a frozen plan keeps the guide up to its paid end date, and unfreezing (which adds the
  missed days back) opens it again.
- **Contact page and enquiry form.** `/contact`, linked from the footer, the menu and the home page, lets anyone ask
  about memberships without an account: name, mobile, email, interest, best time to call, an optional message and
  consent to be contacted. Enquiries are saved before anything else, so none is lost if email fails. 5 per hour per
  network, with a hidden spam trap. `POST /api/enquiries`, `GET /api/enquiries`, `PATCH /api/enquiries/:id`.
- **Enquiry emails.** With `BREVO_API_KEY` and `MAIL_FROM` set, each enquiry goes to the gym's inbox (`ENQUIRY_INBOX`;
  replying answers the enquirer), and the enquirer gets a short confirmation (at most one a day per address). Sent
  through Brevo's HTTPS API, because Railway blocks SMTP below its Pro plan. Without these settings nothing is sent.

### Changed

- **"Trial leads" is now "Leads"** (`/admin/trials`): enquiries on top with a New/Contacted/Closed status, free-trial
  passes below.
- **The service pages need an account.** Strength Floor (`/strength`), Zumba Studio (`/zumba`), Plans & Diets
  (`/guide`), Timetable (`/schedule`), Memberships (`/pricing`) and Coaches (`/coaches`) are for signed-in accounts. A
  guest who follows a link to one (header, menu, footer, home page buttons and cards) stays where they are and gets the
  sign-in dialog; after signing in or creating an account (also with Google or a demo account) they land on that page,
  with its query (a plan picked on the home page opens Memberships with that plan in view). Opened by its address, such
  a page shows "Please sign in" with the dialog already open, and opens once signed in. The page itself is never put on
  screen for a guest, so removing the dialog in DevTools reveals nothing, and its code is only downloaded once it is
  opened. The home page, the exercise library, the legal pages, the password reset page and the payment status page
  (where YouPI sends people back) stay public. These six pages are no longer in the sitemap, are `noindex` and are
  closed in `robots.txt`; `/pricing` no longer lists the plans in its JSON-LD.
- **The fitness guide and the strength split come with a plan.** A member without one (none chosen yet, or ended) sees
  the teaser on `/guide` (each plan's name and a one-line summary) and the four days of the split on `/strength`, with
  "Choose a plan", which opens Memberships. Once a plan is active (a payment, or the front desk) the full content
  loads without a reload. The guide is not part of the website's code. The home page banner says "INCLUDED WITH EVERY
  PLAN", and the search descriptions of `/guide` and `/strength` mention the plan.
- **Icons in the header.** Every link has an icon. From 1280 px the public links show only their icons (with their
  labels they would not fit next to the account buttons), with a tooltip on keyboard focus and, with a mouse or
  trackpad, on hover. The pointer can move onto a tooltip without it closing, and Escape hides it; tooltips never cover
  the signed-in row (Dashboard, My bookings, …), which shows only icons below 1280 px. The drop-down menu, used below
  1280 px and at every width without a mouse or trackpad (touch tablets), keeps icons and labels, and screen readers
  hear each link's name as before. The header and the demo bar line up with the page and the footer at every width.
- New members, coaches and admins without a photo have none (`avatar_url: ''`) instead of a DiceBear cartoon, and
  `PUT /api/auth/profile` accepts `avatar_url: ''` to remove a photo. `POST/PUT /api/trainers` refuse DiceBear
  addresses for a coach's photo, since the server clears them whenever it starts.
- `GET /api/notes/my` returns only what the member's dashboard shows: `{ id, trainer_name, category, note, created_at }`.
- **Guests get only what the home page shows.** Without a session, `GET /api/classes` lists only the next four
  sessions (not the week's timetable), with title, category, day and time, length, room, capacity, coach name and spots
  left (no description, intensity, photo, calories, coach id or booking), and answers any filter with 401; the home
  page's "Classes a week" comes from the new `gym.classesPerWeek` in `GET /api/config`; `GET /api/trainers` lists the
  first four coaches with photo, bio, experience, rating and two specialties; `GET /api/plans` lists name, description,
  monthly price, the first four features and the classes each plan covers (no annual price). Signed-in accounts get the
  full answers as before. `GET /api/classes/:id` and `GET /api/trainers/:id` need a session.
- The privacy policy explains the gender question and who sees it, and no longer mentions DiceBear (updated 19 Nov 2026).
  Each legal page now shows its own "last updated" date, the day its text last changed: the terms of service 9 Oct 2026
  and the refund policy 19 Oct 2026 (all three used to show 7 Oct 2026).

### Removed

- DiceBear pictures. When the server loads an existing database, it replaces stored DiceBear addresses (on people,
  coaches, classes and floor sessions) with "no photo", so everyone gets the new default pictures. The old addresses are
  not kept.

### Fixed

- The pay buttons on the pricing cards wrapped onto two lines ("Choose Dual All-Access Pass (Strength + Zumba) ·
  ₹999"). They now read "Choose plan", "Switch plan" or "Renew plan" and the price, on one line at every width; the
  card's heading already names the plan, and screen readers hear the button's text and then the plan's name. The cards
  are a little tighter between 768 and 1024 px.

### Security

- **The API no longer answers direct visits.** Every `/api` request must carry the `X-Requested-With: PulseFit` header
  that the website and the apps (2.3.0 and later) already send; without it the answer is the same 404 as an unknown
  address. The health check and the Razorpay and YouPI webhooks are exempt, and CORS preflights from the website and
  the apps are answered as before; an `OPTIONS` request from any other site gets the 404 too, so it cannot list which
  API addresses exist. This stops API answers opening in the address bar, from a link or from another site. It is a
  deterrent only: a signed-in person's browser always shows them the app's own requests, so what each answer contains
  is what protects the data. Scripts and monitors that call the API (other than the health check) must now send the
  header.
- Who is on the gym floor (names, photos and plans) is sent to admins only; coaches now get the counts, like everyone
  else.
- Gender is sent only to the person and to admins, never to coaches, other members or visitors, not even as a picture
  address.
- Guests cannot read the fitness guide from the website's code or the API (401), members without a plan cannot either
  (403 `PLAN_REQUIRED`), and its answer is never kept by a shared cache (`Cache-Control: private, no-cache`). The plans,
  classes, coaches and floor answers, which now differ by session, are marked the same way. The downloadable Android app still contains it until it is rebuilt
  and uploaded again (see Upgrading); `npm run mobile:release` now refuses to build an app that contains it.
- Source maps (`.map` addresses) are never served, even if a build contains some, also when the address encodes the
  `.map` (`%2Emap`) or adds a trailing slash, dot or space.
- Default profile pictures are part of the site instead of loading from api.dicebear.com, so showing one sends nothing
  to another service.

### Upgrading

- **Rebuild and upload the Android app with this release.** The APK offered at `/downloads/pulsefit.apk` keeps the code
  it was built from, and a server deploy does not replace it. One built from 2.3.0 still contains the full fitness guide
  (anyone can unzip it), still shows DiceBear pictures and does not ask for gender at sign-up. Raise `versionCode` and
  `versionName` in `client/android/app/build.gradle`, run `npm --prefix client run mobile:release`, and upload the APK
  (and `pulsefit.json`) to the data volume in the same deploy (deploy/README.md › Android app). Do the same for an iOS
  build if one has been handed out.
- Apps already installed from 2.3.0 keep working against this server: they send the app header, and their sign-up
  form, which has no gender question, is still accepted. Their service pages stay open to guests but get only the
  guest answers, so guests see less there (nothing breaks): the timetable and the strength and Zumba class lists say
  "Sign in to see the full timetable.", Memberships shows "₹NaN" where the annual prices were, and Coaches lists four
  coaches, each with "No classes on the timetable right now"; the home page says 4 classes a week. The fitness guide and
  the strength split are part of a 2.3.0 app's own code, so on it everyone, guests included, still sees all of them
  until the app is updated (an app built after 2.3.0 shows a member without a plan the guide's 403 message with a Retry
  button instead). The rebuilt app asks guests to sign in instead. One exception: their coach form will not save a coach without
  a photo (when editing it asks for an `https://` photo address), and coaches without a photo now have none (stored
  DiceBear addresses are cleared, and new coaches without one store `''`). Until the new app is installed, admins must
  edit such coaches on the website.

## [2.3.0] — 2026-10-19

v2.3 takes PulseFit live: Android and iOS apps, a security pass, search-engine and speed work, free UPI
payments through a self-hosted gateway, and one-command deployment.

### Added

- **Android and iOS apps** (Capacitor). The app keeps its session in the Android Keystore / iOS
  Keychain, follows the phone's back button and system bars, and shares files through the share sheet.
  `npm run mobile:sync` and `npm run mobile:run` build and start it against a local API (via `adb
  reverse`) or any address; `npm run mobile:release` builds a signed release APK against the live site.
- **"Get the PulseFit app" bar** for Android visitors to the website, with a download, an install note
  and a close button remembered for 30 days, plus a footer link. The APK is served from the data volume
  at `/downloads/pulsefit.apk`, so a new version goes live without a redeploy; `GET /api/config`
  reports it as `androidApp`.
- **Two-step sign-in (optional for everyone).** Authenticator-app codes (TOTP) with 10 one-time backup
  codes, set up under My account → Sign-in & security. Password resets cannot skip it, and admins can
  reset it for a member who lost their phone.
- **YouPI PG**, a free, self-hosted UPI gateway, alongside Razorpay (`PAYMENT_PROVIDER`). Members pay by
  UPI on YouPI's page and land on `/payment-status`, which confirms the payment with YouPI server to
  server; YouPI's signed webhook also activates the plan. Experimental: see README › Payments.
- **SEO.** Per-page titles, descriptions, canonical links and robots tags (written by the server into the
  HTML, then kept in step by the client); `robots.txt`, `sitemap.xml`, JSON-LD (Organization, WebSite,
  ExerciseGym, plan offers); real 404s for unknown addresses; `ALLOW_INDEXING` for staging hosts.
- **Deployment.** A `Dockerfile` and `railway.json` (the app runs as a non-root user with its database on
  a volume), and `deploy/` scripts for a VPS behind Cloudflare Tunnel: server setup, releases with
  automatic rollback, daily backups and a backup puller.

### Changed

- **Light theme by default.** Dark appears only when chosen with the toggle; the device setting is no
  longer followed.
- **Sessions.** The website keeps its session in an httpOnly cookie with a CSRF header check; nothing is
  stored in localStorage. Staff sessions last 12 hours.
- **Faster pages.** Route-level code splitting and a separate React chunk (the first load is about a
  third smaller), Brotli-compressed assets, a preloaded hero image, reserved space for loading content
  and fixed image sizes. Measured on a throttled phone: LCP mostly 1.4–2.1 s, CLS under 0.06.
- **Headings.** Every page has exactly one `h1`, and headings no longer skip levels.

### Security

- A strict Content Security Policy, HSTS and an HTTP-to-HTTPS redirect in production.
- Rate limits per IP and per account on sign-in, password reset, demo sign-in and two-step codes, plus an
  API-wide limit.
- Common passwords are refused; the published demo password works only in demo mode, and the seed will
  not create demo accounts in production.
- Uploaded photos must be real PNG/JPEG/WebP images within size limits; remote image links are limited
  to https on public hosts.
- Production refuses the old public development JWT secret; request logs leave out query strings, and
  reset links are logged only when `LOG_RESET_LINKS` is on.
- CI audits dependencies, and Dependabot keeps them up to date.

## [2.2.0] — 2026-10-16

v2.2 adds ID cards: a digital PulseFit badge for every member and coach, and the front desk's record of
the physical cards it hands out, so a lost or stolen card stops working at the turnstile.

### Added

- **ID cards.** Everyone opens their PulseFit ID card from My account, members also from their dashboard
  and coaches from the coach dashboard: a
  vertical, employee-style badge colour-coded by role (lime to teal for members, cyan to violet for coaches,
  amber to pink for admins) that follows the app's light or dark theme. The front has the photo in a
  gradient ring, name, plan or role, card number, validity, status and a hologram seal; the back has the
  check-in QR code, pass code, opening hours and contact details. In the app it hangs from a lanyard and
  swings gently, tilts towards the pointer and flips, and it downloads as a PNG (both sides). There is no
  print option: the gym issues the physical card. The front desk can open any member's or coach's badge
  from their details under Members.
- **Issued ID cards are tracked.** Each physical card the desk hands out gets its own number
  (`PFC-XXXX-XXXX`), which is also its QR code. The new ID cards page (`/admin/id-cards`) shows, for
  members, coaches or admins, who has an active card, a deactivated one or none yet, with counts, filters
  and search by name or card number, and when and by whom each card was issued or deactivated. Admins
  issue a card, deactivate it with a reason (lost, stolen, damaged, returned or other) and an optional
  note, reactivate it, or replace it; a person has at most one active card. A deactivated card is refused
  at check-in with a message saying whose card it is and why, and nothing is recorded; the member's app
  pass keeps working. A member's details list all their cards, newest first, with each card's history.
  Members see their card's number on their own ID card, and are told to ask the desk for a new one when
  it was deactivated. The demo data includes active, lost and replaced cards. New endpoints:
  `GET /api/id-cards`, `POST /api/members/:id/id-cards`, `POST /api/id-cards/:cardId/deactivate` and
  `/reactivate`, and `GET /api/id-cards/mine`.

### Changed

- Dialogs opened on top of another dialog take Escape and Tab for themselves; the dialog underneath stays open.

## [2.1.0] — 2026-10-09

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
- Membership freeze/unfreeze that gives back the open gym days missed; renewals extend from the current expiry;
  switching plans credits unused days; memberships expire by date.
- Password reset page, 404 page, privacy/terms/refund pages, and real URLs for every page
  (refresh, back button and shared links work).
- `GET /api/config` so the client knows whether demo mode, Google sign-in and payments are available.
- 599 API tests (Vitest + supertest), 180 Playwright tests (every page, access rules, booking and
  cancelling, front-desk check-in, pricing) on desktop and mobile, and GitHub Actions CI.

### Changed

- Pocket-friendly default prices: ₹699 / ₹799 / ₹999 a month (₹7,188 / ₹8,388 / ₹10,188 a year),
  down from ₹1,199 / ₹1,499 / ₹1,999. Prices live in the plan catalogue and admins can change them.
- Dashboards show only stored data: MRR, revenue, check-ins, fill rate, retention and peak hours are
  computed in India Standard Time from real records, with a one-line definition for each figure.
- Streaks count consecutive gym days with any activity (check-in, class, floor session, same-day workout);
  closed Sundays do not break them.
- All dates and times use the gym's timezone (Asia/Kolkata) instead of UTC or the device clock.
- The client loads member, coach and admin areas on demand (first load 877 kB → 391 kB; charts load only where they are shown).
- The JSON database writes atomically, refuses to start on a corrupt file instead of wiping it,
  migrates v2.0 files on load, and is no longer tracked in git (seeded on first start).
- `docs/API.md` documents the whole API.
- One neumorphic and glass look across the app: every button is raised (with a red variant for destructive
  actions and round icon buttons), checkboxes are raised and press in when ticked, the navbar and mobile menu
  are frosted glass, alerts and icon tiles are tinted glass, tables have a sunken header band, and the footer
  sits on a raised card.
- The class timetable has a compact month calendar (this month and next) instead of a week strip: dots show
  each day's classes, grey dots mark days whose booking has not opened yet, and arrow keys move between days.

### Removed

- The simulated Firebase layer, the `firebase` and server-only `razorpay` packages from the client,
  `schema.sql`, and the payment test scripts that read a secret from one machine's disk.

### Fixed

- The API crashed on start without Razorpay keys; `npm run install:all` corrupted both package
  manifests; the old end-to-end script reported success when it failed.
- Every successful turnstile scan was shown as "Access denied"; new members' temporary passwords
  showed as "undefined"; "Join" buttons opened the sign-in form; bookings landed on the wrong day
  between midnight and 05:30 IST; and about 150 other defects found in the v2.0 audit.
- A second bug hunt before release confirmed about 80 more defects; all are fixed:
  - **Membership and billing:** freezing overnight no longer adds a free day. Unfreezing gives back only the
    open gym days missed (not the freeze day, the return day or Sundays) and states the new end date.
    Freezing says how many class bookings were cancelled. A plan change at checkout, and admin edits that end,
    shorten or pause a membership, release the class spots that person can no longer use, and say how many.
  - **Streaks:** Sundays, when the gym is closed, no longer reset every streak; correcting an "Attended" mark
    or deleting today's workout takes the day back.
  - **Opening hours:** members and trial visitors are turned away while the gym is closed (staff are not), no
    same-day trial after closing, and classes can only be scheduled inside opening hours.
  - **Accounts:** password reset links use the real site address (`PUBLIC_URL`) instead of localhost; on a
    public demo the shared demo accounts cannot be locked, deleted or re-roled by visitors; pass codes ignore case.
  - **Coaches:** admins can open any coach's dashboard and take attendance for coaches without a login;
    attendance can be taken for any session of the last 14 days; roster counts and buttons stay correct.
  - **Admin screens:** form errors are always shown, edits say how many bookings they cancelled, the
    temporary password cannot be lost to a stray click, and the check-in box clears after every scan.
  - **Member and public pages:** the freeze dialog tells the truth about cancelled bookings, the rest and
    floor timers keep correct time, the timetable shows Sunday classes and plan limits without flicker,
    free trials hide today after closing, and payment confirmations say what the payment did.
  - **Across the app:** light-theme error, warning and badge text is readable; restoring a session no longer
    jumps away from the home page or a reset link; an unreachable server keeps you signed in and reconnects by
    itself; error toasts stay at least 10 seconds; a part of the app that fails to download shows a Reload
    message instead of a blank screen; page changes move keyboard focus to the heading; plan names match
    the catalogue everywhere; the first load is smaller (QR pass and confetti load on demand).
  - Messages show dates as "8 Oct 2026" instead of "2026-10-08"; demo data is consistent.

## [2.0.0] — 2026-10-05

Published as the `version_2.0` pre-release: Strength and Zumba focus, Gurugram localisation,
INR pricing, member time tracking, fitness guide, Strength and Zumba pages.

## [1.0.0] — 2026-09-12

Initial release.
