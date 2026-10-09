# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The repo is three npm packages without workspaces: the root (concurrently, Playwright, TypeScript for e2e), `server/` and `client/`, each with its own lockfile.

```bash
npm run install:all          # installs root, server, client (do not use `npm --prefix server install`: npm writes a bogus "pulsefit": "file:.." dependency)
npm run dev                  # API on :5004 (tsx watch) + Vite on :5173 (proxies /api)
npm test                     # server API tests (Vitest + supertest)
npm run typecheck            # server (src + tests), client, e2e
npm run build                # server → server/dist, client → client/dist
npm start                    # runs server/dist; serves client/dist too; counts as production (needs JWT_SECRET)
npm run test:e2e             # Playwright: builds the client, starts the API on port 5180 with a fresh temp DB
npm run seed                 # wipe and load the full demo gym (`-- --catalogue` = plans/exercises/coaches/timetable only)
npm run create-admin -- --email a@b.c --name "Name"   # run with the API stopped (a running server overwrites the file)
```

Single tests:

```bash
cd server && npx vitest run tests/payments.test.ts -t "is idempotent"
npx playwright test e2e/flows.spec.ts --project=desktop
```

No linter or formatter is configured; match the surrounding style.

## Architecture

**`docs/API.md` is the contract.** Every endpoint, body, response shape and error code is listed there, including the "Additional rules" sections. Update it when behaviour changes. Responses use one envelope: `{ success: true, data, message? }` or `{ success: false, error, code?, data? }`. The client branches on `code`, never on the `error` text.

### Server (`server/src`)

- `config.ts` is the only place that reads `process.env`. When `NODE_ENV` is unset, running from `dist/` means production. `config.isLocal` (development/test) gates every development shortcut: demo personas by default, reset links in API responses, the dev JWT secret, and error details. Tests mutate the exported `config` object directly.
- Routes are split by domain (`routes/auth|payments|classes|members|activity.ts`), all mounted on one `/api` router. Attach middleware per route; `router.use` in a domain router would run for every other domain.
- Controller pattern: `asyncHandler` + `parse(zodSchema, input)` + `ok(res, data, message?, status?)`, and throw the helpers from `lib/http.ts` (`badRequest`, `forbidden`, `conflict`, …). Users leave the API only through `toSafeUser` (`lib/users.ts`), which also applies the effective membership status and current streak.
- **Data** is a JSON file (`db/database.ts`, path from `PULSEFIT_DB_PATH`, default `server/data/gym-db.json`, git-ignored). Collections are replaced through setters (`db.users = db.users.map(...)`); never mutate objects returned by getters. Writes are debounced and atomic. Code that moves money calls `db.saveSync()`. `migrate()` upgrades older files on every load.
- **Business rules live in `lib/`**, not in controllers:
  - `dates.ts`: everything runs in gym time (`Asia/Kolkata`). Never use `toISOString().split('T')[0]` for "today"; use `gymToday`, `gymDateTime`, `nextOccurrence`.
  - `membership.ts`: `effectiveStatus` (an active membership past its expiry counts as expired). Plan entitlements come from `membership_plans[].categories`; an empty list means all categories.
  - `occurrences.ts`: classes are weekly templates; capacity is per date, and `booked_count` is computed from bookings, never stored.
  - `streak.ts` + `floor.ts`: count activity with `recordActivity`, or `creditSession` for back-dated days.
  - `billing.ts`: pure activation maths (renewals, pro-rata credit, freeze credit = open days strictly between freeze and return).
  - `hours.ts`: opening hours (Mon–Sat 06:00–22:00, closed Sundays). Calendar rules always apply (class slots, trials, streaks step over closed days); clock rules (`gymClosedNow`: no member check-in, floor clock-in or same-day trial while shut) only when `config.enforceOpeningHours` (`ENFORCE_OPENING_HOURS`, default on). Use `displayDate` (`dates.ts`) for dates inside messages.
  - `bookingRules.ts`: releases bookings when a freeze or a category/plan change makes them invalid.
- **Payments**: the price comes from the plan, and tier and cycle are fixed on a server-side `PaymentOrder`. Verify and webhook are idempotent with each other. `server.ts` mounts `express.raw` for `/api/payment/webhook` so its HMAC sees the raw bytes.
- **Seeding**: `db/seed.ts` writes the base data, then the domain extensions in `db/seed/*.ts` run in order (`seed/index.ts`). That file also adds missing check-ins and re-derives streaks. Demo data is relative to today. First start loads the demo gym only when `config.demoMode` is on; otherwise it loads the catalogue only, with no accounts.

### Server tests (`server/tests`)

`tests/setup.ts` gives each test file its own temporary DB and sets `NODE_ENV=test`, `DEMO_MODE=true`, `TRUST_PROXY=1` (so tests can fake client IPs with `X-Forwarded-For`) and `ENFORCE_OPENING_HOURS=false` (tests of the clock rules switch `config.enforceOpeningHours` back on with fake timers). Use `resetDb()` in `beforeEach` and `authHeader(personas.member | vip | trainer | admin | basic | expired)` from `helpers.ts`. When time matters, use `vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime`. External services are injectable: `setRazorpayClientForTests` (paymentController) and `setGoogleVerifierForTests` (`lib/google.ts`). Assert seed invariants instead of fixed seed values: several seed modules adjust the same users.

### Client (`client/src`)

- There is no router library. `routes.ts` maps tab ids to URL paths and access rules. `context/NavigationContext.tsx` keeps the URL in sync. Pages navigate with `navigate(tab, params)` or the `setCurrentTab` prop. `App.tsx` enforces access (sign-in / not-for-your-role panels) and lazy-loads the member, coach and admin pages.
- `api/client.ts` has one typed function per endpoint. Failures throw `ApiError` (status, `code`, `data`); a 401 fires an event that signs the user out. Calls whose side effects people must hear about (freeze/unfreeze, member, plan and class updates) return `WithMessage<T>` = `{ data, message? }`; show the message. Shared types are in `types/index.ts`.
- Admin forms map server `VALIDATION_ERROR` issues with `formErrorsFrom(err, fields)` (`components/admin/ui.tsx`): issues for fields a form does not render go to the form-level error, never silently dropped.
- `ConfigContext` reads `GET /api/config` (demo mode, Google client id, Razorpay key); the client holds no secrets or `VITE_` keys. `AuthContext` holds the session, `useRazorpay` runs checkout, `lib/format.ts` formats INR and IST dates, and `components/common` provides `States` (loading/error/empty), `ConfirmDialog` and `Modal`.
- Show real data only: when there is nothing, render an empty state, never an invented number.
- Visual language is neumorphism with glass accents, all in `index.css`: raised `neu-flat`/`neu-card`, sunken `neu-pressed`/`neu-inset`, buttons `neu-btn` / `neu-btn-lime` / `neu-btn-pink` / `neu-btn-danger` / `neu-icon-btn` (`neu-icon-btn-danger` for delete icons), `neu-table`, and glass `glass-bar` (sticky bars), `glass-tint` (tinted alerts and icon tiles), `glass-dark` (panels over photos). Form fields and checkboxes are styled globally. Use these classes rather than plain bg/border boxes; inline text links stay links.
- Gym theme colours are RGB channel variables (`--gym-950-rgb` etc. in `index.css`, `rgb(var(...) / <alpha-value>)` in `tailwind.config.js`), so opacity modifiers like `bg-gym-950/95` work. Add new theme colours the same way. Light theme remaps accent text (rose, amber, cyan, purple, emerald, lime… 200–700) centrally in `index.css`, so new accent text needs no light-theme pair; text over dark photos is excluded.
- Lazy-loaded UI goes inside `<ErrorBoundary>` (`components/common`) so a failed chunk cannot empty the app. Plan names: `tierLabel(tier, plans)` where the catalogue is loaded, `TIER_LABELS` otherwise, `TIER_SHORT_LABELS` for badges, table cells and log rows.

### E2E (`e2e/`)

`playwright.config.ts` builds the client and starts the API with `SERVE_CLIENT=true`, `DEMO_MODE=true` and a throwaway DB, then runs serially (shared DB) on desktop and Pixel 7 projects. `signInAs(page, request, role)` uses demo-login and seeds localStorage `pulsefit_token`.

## Domain facts

- Demo personas (demo mode only) all use password `pulse123`: `member@` (Zumba & Cardio pass), `vip@` (all access), `trainer@` (Coach Vikram, linked to `trn_vikram` via `trainers.user_id`) and `admin@pulsefit.com`. In demo mode they are locked (`isLockedDemoAccount`): password change/reset, admin reset, delete and role change answer 403 `DEMO_ACCOUNT_LOCKED`. Other coaches have no login; admins take their attendance from the coach view (`/trainer?trainer=<id>`).
- Plans: `basic` = Workout & Strength, `pro` = Zumba & Cardio, `vip` = everything. The gym is open Mon–Sat 06:00–22:00 IST and closed on Sundays. Bookings open 14 days ahead.
- `.gitattributes` forces LF; files edited on Windows may arrive as CRLF, so normalise before string-matching edits.
