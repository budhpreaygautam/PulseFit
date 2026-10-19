# ⚡ PULSEFIT ATHLETICS — Cyber Hub, Gurugram

<div align="center">

![PulseFit Banner](https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop)

### 🏋️ Gym website, member portal, coach dashboard and front-desk system
**For a Strength Training and Zumba & Cardio gym in Cyber Hub, Gurugram.**

---

[![React 18](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js_20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express_4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay_Payments-0C2340?style=for-the-badge&logo=razorpay&logoColor=528FF0)](https://razorpay.com/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

[Features](#-feature-highlights) • [Plans](#-membership-plans) • [Demo personas](#-1-click-demo-personas) • [Quick start](#-quick-start) • [Configuration](#%EF%B8%8F-configuration) • [Testing](#-testing) • [Deploying](#-deploying) • [API](#-api) • [Changelog](CHANGELOG.md)

---

</div>

## 📖 Overview

**PulseFit** is a full-stack gym web application built around **two fitness pillars**:

1. **Workout & Strength Training**: free weights, power racks, compound lifts, a set-by-set workout logger.
2. **Zumba & Cardio**: high-energy dance fitness and aerobic conditioning classes.

Visitors browse the timetable and buy a plan through **Razorpay in Indian Rupees (₹)**. Members book
classes, check in at the turnstile with a QR pass, log workouts and track their streak. Coaches run their
rosters and keep client notes, and the front desk and admins manage members, the timetable, plans and
revenue. Everything runs on India Standard Time.

**What's new in v2.2:** ID cards. Members and coaches get a digital PulseFit badge, and the front desk keeps
a record of every physical card it hands out, active or deactivated; a lost or stolen card is refused at
check-in while the app pass keeps working. v2.1 brought the coach dashboard, real QR passes and camera
scanning, a payments ledger with invoices, saved free trials, admin pages for classes, plans and trial
leads, real URLs for every page, and a security overhaul. See the [changelog](CHANGELOG.md).

---

## ⚡ 2 Core Fitness Offerings

<table>
  <tr>
    <td width="50%" align="center">
      <h3>💪 1. Workout & Strength Training</h3>
      <p>Muscle building, progressive overload and functional strength.</p>
      <ul align="left">
        <li>Olympic barbells, power cages and dumbbells</li>
        <li>Coached compound lifts (squat, deadlift, bench press)</li>
        <li>Workout logger with per-exercise sets, RPE and a rest timer</li>
        <li>Exercise library with target muscles and form cues</li>
      </ul>
    </td>
    <td width="50%" align="center">
      <h3>💃 2. Zumba & Cardio Dance</h3>
      <p>Calorie burn, stamina and high-energy fun.</p>
      <ul align="left">
        <li>Latin and Bollywood dance choreography</li>
        <li>Morning and evening batches, Monday to Saturday</li>
        <li>Led by certified Zumba instructors</li>
        <li>Per-class capacity with live spots-left counts</li>
      </ul>
    </td>
  </tr>
</table>

Open **Monday to Saturday, 06:00–22:00 IST**. Closed on Sundays.

---

## 💰 Membership Plans

Plans, prices and what each plan may book live in the **plan catalogue**. Admins edit them on the
**Plans** admin page (`/admin/plans`), and the website and checkout read them from `GET /api/plans`. The demo data
ships with:

| Plan | Books | Monthly | Annual (billed once) |
| :--- | :--- | :--- | :--- |
| **Workout & Strength Pass** | Workout & Strength classes | **₹699** | **₹7,188** (₹599/mo) |
| **Zumba & Cardio Pass** | Zumba & Cardio classes | **₹799** | **₹8,388** (₹699/mo) |
| **Dual All-Access Pass** ⭐ | Everything | **₹999** | **₹10,188** (₹849/mo) |

Renewing extends from the current expiry. Switching plans credits the unused days of the old plan.
A freeze pauses the plan and gives back the open gym days missed while frozen (not the freeze day, the return day or Sundays).

---

## 🌟 Feature Highlights

<table>
  <tr>
    <td width="50%">
      <h3>🌐 Visitors</h3>
      <ul>
        <li>Strength and Zumba pages, fitness guide, coach profiles</li>
        <li>Weekly timetable with week navigation, filters and live spots left</li>
        <li>Pricing from the plan catalogue, with checkout through Razorpay</li>
        <li>Free 1-day trial: a code valid once on the chosen day, saved as a lead</li>
        <li>Sign up with email or Google; password reset by link</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🏋️ Members</h3>
      <ul>
        <li>Dashboard with streak, membership status, upcoming classes, check-in history and coach notes</li>
        <li>Book and cancel classes (checked against the plan, membership dates and capacity)</li>
        <li>Scannable QR turnstile pass and a digital ID card (photo, card number, plan, QR code on the back)</li>
        <li>Workout logger, progress charts and personal records</li>
        <li>Floor clock-in/out, plan changes, freeze/unfreeze, invoices</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🥋 Coaches</h3>
      <ul>
        <li>Coach dashboard: upcoming classes, booked sessions of the last 14 days with attendance, clients and notes; admins can open any coach's dashboard</li>
        <li>Rosters per class and date, with attended / no-show marking</li>
        <li>Client list and assessment notes, optionally shared with the member</li>
        <li>Front-desk check-in scanner</li>
        <li>Digital staff ID card from the coach dashboard (photo, staff ID, role, QR code on the back)</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🛡️ Admin & front desk</h3>
      <ul>
        <li>KPIs from real data: MRR, revenue, check-ins, fill rate, retention, peak hours, tiers</li>
        <li>Member directory: create, edit, freeze, reset password, delete, visit and payment history, view ID cards</li>
        <li>ID cards page: who has a physical card, active or deactivated; issue a card with its own number and QR code, deactivate it with a reason (lost, stolen, damaged, returned, other), reactivate or replace it, and see each card's history</li>
        <li>QR check-in by camera or code, with clear granted/denied reasons; a deactivated card is refused, while the member's app pass keeps working</li>
        <li>Timetable, coaches, plans & pricing, free-trial leads, attendance CSV export</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🎭 1-Click Demo Personas

In **demo mode** (on by default in local development, off in production) the sign-in screen offers four
personas. All of them use the password `pulse123`:

| Persona | Role | Email | What to try |
| :--- | :--- | :--- | :--- |
| **Aarav Sharma** | 🥇 Member, Zumba & Cardio Pass | `member@pulsefit.com` | Book a Zumba class, show the QR pass, log a workout |
| **Ananya Gupta** | 💎 Member, Dual All-Access | `vip@pulsefit.com` | Book any class, invoices, freeze and unfreeze |
| **Coach Vikram Rathore** | 🥋 Head strength coach | `trainer@pulsefit.com` | Rosters, attendance marking, client notes |
| **Priya Verma** | 👑 Admin / general manager | `admin@pulsefit.com` | Dashboard, members, check-in scanner, plans |

> ⚠️ The demo accounts and their password are public. Never turn on demo mode on a server holding real
> member data. Production never loads them unless `DEMO_MODE=true` is set explicitly.

---

## 🛠️ Technology Stack

```mermaid
graph TD
    subgraph Client ["Client (Vite + React 18)"]
        UI[Tailwind CSS UI]
        Router[URL routing with role guards]
        API[Typed API client]
        Charts[Recharts]
    end

    subgraph Server ["Server (Node.js + Express)"]
        REST[REST API /api]
        Auth[JWT, Google ID tokens, rate limits]
        Pay[Razorpay orders, verification, webhook]
        DB[(JSON file database)]
    end

    Client -->|JSON over /api| Server
    Pay -->|orders / webhooks| Razorpay[(Razorpay)]
    Auth -->|token keys| Google[(Google Identity)]
```

- **Client**: React 18, TypeScript, Vite, Tailwind CSS, lucide-react, Recharts, `qrcode`, canvas-confetti
- **Server**: Node.js 20+, Express 4, TypeScript (tsx), zod, bcryptjs, jsonwebtoken, jose, helmet, express-rate-limit, Razorpay SDK
- **Data**: a JSON file database (`server/data/gym-db.json`) with atomic writes; created and seeded on first start
- **Tests**: Vitest + supertest for the API, Playwright for the browser, GitHub Actions CI

---

## 🚀 Quick Start

**Prerequisites:** Node.js 20 or newer, npm 9 or newer.

```bash
git clone https://github.com/budhpreaygautam/PulseFit.git
cd PulseFit
npm run install:all   # root, server and client dependencies
npm run dev           # API on :5004 and the web app on :5173
```

Open **http://localhost:5173**. On first start the API creates `server/data/gym-db.json` with the demo gym.
No configuration is needed for local development: demo personas are on, and online payments and Google
sign-in stay hidden until you add their keys.

Reset the demo data at any time with `npm run seed`. To start without demo data, use
`npm run seed -- --catalogue`, which loads only the plans, exercises, coaches and timetable.

<details>
<summary>Optional: local HTTPS for the Vite dev server</summary>

Put a certificate and key at `client/certs/cert.pem` and `client/certs/key.pem` (for example generated with
[mkcert](https://github.com/FiloSottile/mkcert): `mkcert -key-file client/certs/key.pem -cert-file client/certs/cert.pem localhost`).
Vite then serves https://localhost:5173. The folder is git-ignored.
</details>

---

## ⚙️ Configuration

Copy `server/.env.example` to `server/.env`. Every setting is optional for local development.

| Variable | Purpose |
| :--- | :--- |
| `JWT_SECRET` | Signs login tokens. **Required outside local development** (32+ random characters). |
| `NODE_ENV` | `development`, `production` or `test`. If unset, `npm run dev` is development and `npm start` is production. |
| `DEMO_MODE` | `true` enables the 1-click personas. Default: on in development, off elsewhere. |
| `CLIENT_ORIGIN` | Browser origins allowed to call the API (comma-separated). Default: the Vite dev server in development, `PUBLIC_URL` elsewhere (never localhost in production). |
| `APP_ORIGINS` | Origins of the Android/iOS apps, also allowed. Default `https://localhost,capacitor://localhost`; empty refuses the apps. |
| `TRUST_PROXY` | Number of reverse proxies in front of the API (e.g. `1` on Render/Railway/nginx). |
| `GYM_TIMEZONE` | Default `Asia/Kolkata`. |
| `PUBLIC_URL` | The address people open the app at (e.g. `https://gym.example.com`); password reset links, canonical links, the sitemap and the HTTPS redirect are built on it. Set it in production. |
| `ALLOW_INDEXING` | Let search engines index the site. Default: on in production, off elsewhere. Set `false` on staging/preview deploys: `robots.txt` then disallows everything and every response carries `X-Robots-Tag: noindex`. |
| `HTTPS_REDIRECT` | Default `true`: in production with an `https://` `PUBLIC_URL`, plain-HTTP requests get a 301 to `PUBLIC_URL` + path (`/api/health` excepted). Needs `TRUST_PROXY` and a proxy that sends `X-Forwarded-Proto`. |
| `HSTS` | Default `true` (off in local development): `Strict-Transport-Security: max-age=31536000; includeSubDomains`. |
| `ENFORCE_OPENING_HOURS` | Default `true`: members cannot check in, clock in or book a same-day trial while the gym is closed. The test suites turn it off. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Enable checkout ([Razorpay dashboard → API keys](https://dashboard.razorpay.com/app/keys); use test-mode keys first). |
| `RAZORPAY_WEBHOOK_SECRET` | Enables `POST /api/payment/webhook`, so a payment still activates if the member closes the tab. |
| `YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_WEBHOOK_SECRET` | Enable free UPI checkout through your own [YouPI PG](https://github.com/youpi-pg/YouPI-PG) (see *Payments* below). |
| `PAYMENT_PROVIDER` | `razorpay` or `youpi`. Empty: Razorpay when its keys are set, else YouPI. |
| `GOOGLE_CLIENT_ID` | Enables "Continue with Google" (an OAuth web client id; add your site as an authorised JavaScript origin). |
| `PULSEFIT_DB_PATH` | Where the JSON database lives. |
| `SERVE_CLIENT` | Serve `client/dist` from the API (default on in production), with each page's `<head>` filled in, `/robots.txt` and `/sitemap.xml`. |

The client needs no secrets. It reads what is enabled from `GET /api/config`.

**Razorpay webhook:** in the Razorpay dashboard, add `https://<your-domain>/api/payment/webhook` with the
events `payment.captured`, `order.paid` and `payment.failed`, and use the same secret as `RAZORPAY_WEBHOOK_SECRET`.

---

## 🧪 Testing

```bash
npm test            # 758 API tests (Vitest + supertest), each file on its own throwaway database
npm run test:e2e    # 202 Playwright tests (101 per project): builds the client, starts the API on a fresh demo database, runs Chromium (desktop + mobile)
npm run typecheck   # server, client and e2e
```

The first Playwright run needs a browser: `npx playwright install chromium`. CI (`.github/workflows/ci.yml`)
runs the type checks, API tests, build and Playwright suite on every push and pull request, and fails on
any high or critical advisory in the runtime dependencies (`npm audit --omit=dev --audit-level=high` for the
root, `server` and `client`). Dependabot (`.github/dependabot.yml`) opens weekly update PRs for the three npm
packages and the GitHub Actions. Node 22 or newer is required.

---

## 📱 Android & iOS Apps

The apps are the same React client wrapped with [Capacitor](https://capacitorjs.com) (`client/android`, `client/ios`).

```bash
npm run dev                    # keep the API running
npm run mobile:sync            # build the app against the API on this PC (http://localhost:5004) and copy it into both projects
npm run mobile:sync -- --api https://gym.example.com   # build against a hosted API instead
npm run mobile:run             # build the APK, install + start it on a USB phone or emulator (boots one if none is running), and run `adb reverse tcp:5004 tcp:5004`
npm run mobile:android         # or open in Android Studio and press Run
npm --prefix client run mobile:release   # signed release APK against https://pulsefit.up.railway.app (deploy/README.md › Android app)
npm run mobile:ios             # open in Xcode (macOS only)
```

- Run `mobile:sync` after every client change. It remembers the API address in `client/.mobile-api-url`, so later `npx cap …` commands keep the right settings.
- The API stays private to this PC: `mobile:run` uses `adb reverse` so the emulator or a USB-connected phone reaches `localhost:5004` on the PC through adb. The tunnel ends when the device disconnects or restarts; run `mobile:run` again, or `adb reverse tcp:5004 tcp:5004` (also needed after starting the app from Android Studio). The iOS simulator shares the Mac's `localhost`.
- A phone on Wi-Fi without USB needs `npm run mobile:sync -- --lan` (builds against `http://<lan-ip>:5004`) and the API started with `HOST=0.0.0.0` (PowerShell: `$env:HOST="0.0.0.0"; npm run dev`). This exposes the dev API, and demo sign-in as the admin, to everyone on that network: use it only on a network you trust, and stop the API afterwards. Windows Firewall must also allow Node.js (port 5004) on the network profile your Wi-Fi uses.
- Android needs **JDK 21** (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`), or [Android Studio](https://developer.android.com/studio) for the SDK. Studio's bundled JDK is newer than 21: the build picks up `JAVA_HOME` as its Java 21 toolchain (`client/android/gradle.properties`), so set `JAVA_HOME` to a JDK 21. Keep the Gradle wrapper at 8.14.3: the Android Gradle Plugin used here does not work with Gradle 9.6+.
- iOS needs a Mac with Xcode.
- Plain `http://` is for local testing only. A release APK comes from `mobile:release`, which only accepts an `https://` API, signs with the release key (created on first run in `%USERPROFILE%\.pulsefit\pulsefit-release.jks`, named in `client/android/keystore.properties`) and leaves the app built against that API; run `mobile:sync` afterwards to test against this PC again. Without `keystore.properties`, `assembleRelease` builds an unsigned APK. Release signing keys (`*.jks`, `*.keystore`, `keystore.properties`) and `google-services.json` are git-ignored in `client/android`; keep them out of the repo.
- In the apps, downloads (pass, ID card, attendance CSV) open the share sheet, Google sign-in and invoice printing are hidden, the Android back button closes dialogs and goes back a page, and camera scanning works where the WebView offers `BarcodeDetector` (Android); otherwise staff type the code.

---

## 🚢 Deploying

```bash
npm run install:all
npm run build                                    # compiles the API to server/dist and the client to client/dist
JWT_SECRET=<long random string> npm start        # one process serves the API and the web app on $PORT
```

On a first start without `DEMO_MODE`, the database gets the catalogue but no accounts. With the API
stopped, create the first admin:

```bash
npm run create-admin -- --email you@example.com --name "Your Name"   # prints a temporary password once
```

The database is a single JSON file, so run one instance, keep `server/data/` on a persistent disk, and back
it up. Behind a proxy, set `TRUST_PROXY`. Set `PUBLIC_URL` to your site's address so password reset links work.
For checkout, set the Razorpay keys and webhook secret.

**HTTPS.** The proxy in front (Cloudflare Tunnel in `deploy/`) ends TLS. The API sends HSTS (one year,
sub-domains included, no `preload`) and, with `TRUST_PROXY` set and an `https://` `PUBLIC_URL`, redirects
plain-HTTP requests to `PUBLIC_URL` with a 301. The target is always built on `PUBLIC_URL`, never on the
request's Host header. Only add `preload` (in `server/src/server.ts`) and submit the domain to
[hstspreload.org](https://hstspreload.org) once every sub-domain is HTTPS for good: it is hard to undo.

**Search engines.** With `SERVE_CLIENT` on, the API answers `/robots.txt` and `/sitemap.xml` and writes each
page's title, description, canonical link, robots tag and JSON-LD (the gym as a schema.org `ExerciseGym`,
the plans as offers on `/pricing`) into `index.html`, so crawlers see them without running the app.
Unknown addresses answer 404. The page list and gym facts are copied from `client/src/routes.ts` and
`client/src/components/public/gymInfo.ts` into `server/src/lib/seo.ts`; `server/tests/seo.test.ts` fails
when they drift, so update both together. Staging and preview deploys should set `ALLOW_INDEXING=false`.
Logo, photo, map coordinates and social profiles are left out of the JSON-LD until you add real ones
in `GYM_PROFILE` in `server/src/lib/seo.ts`. After the first deploy, submit
`https://<your-domain>/sitemap.xml` in Google Search Console.

---

## 📂 Project Architecture

```text
PulseFit/
├── package.json              # install:all, dev, test, test:e2e, build, start, seed, create-admin
├── docs/API.md               # the full API reference
├── e2e/                      # Playwright: page smoke tests, access rules, booking, check-in, pricing
├── server/
│   ├── src/
│   │   ├── index.ts          # startup, first-start seeding, graceful shutdown
│   │   ├── server.ts         # Express app: security headers, CORS, JSON, static client
│   │   ├── config.ts         # every environment variable, resolved once
│   │   ├── routes/           # auth, payments, classes, members, activity
│   │   ├── controllers/      # one per area (auth, password, plans, payments, membership, classes,
│   │   │                     #   bookings, trainers, trainer portal, members, attendance, trials,
│   │   │                     #   workouts, time tracking, analytics)
│   │   ├── lib/              # IST dates, membership rules, streaks, billing, occurrences, floor, http
│   │   ├── middleware/       # JWT auth, role guards, error handling
│   │   └── db/               # JSON database, seed (+ per-domain seed modules), create-admin
│   └── tests/                # Vitest + supertest
└── client/
    └── src/
        ├── App.tsx           # pages, lazy loading and access guards
        ├── routes.ts         # every page's URL and who may open it
        ├── api/client.ts     # typed API client and ApiError
        ├── context/          # auth, config, navigation, theme, toasts
        ├── components/       # layout, common UI, auth, QR pass, admin/coach/member widgets
        └── pages/            # public/, member/, trainer/, admin/
```

---

## 📡 API

The full reference, with every request, response and error code, is in **[docs/API.md](docs/API.md)**.
In short:

- **Auth**: `POST /api/auth/login`, `/register`, `/google`, `/demo-login`, `/forgot-password`, `/reset-password`; `GET /api/auth/me`; `PUT /api/auth/profile`, `/password`
- **Plans & payments**: `GET /api/plans`; `POST /api/payment/create-order`, `/verify`, `/webhook`; `GET /api/payments/my`; `POST /api/membership/freeze`, `/unfreeze`
- **Classes & bookings**: `GET /api/classes`; `POST /api/bookings`; `GET /api/bookings/my`; `DELETE /api/bookings/:id`; rosters and attendance
- **Coaches**: `GET /api/trainers`; `GET /api/trainer/me`, `/clients`, `/notes`; `GET /api/notes/my`
- **Front desk & admin**: `POST /api/attendance/check-in` (pass code, ID card number, member id, email or trial code); `GET /api/attendance/logs`; `/api/members` CRUD; `POST /api/trials`; `GET /api/analytics/dashboard`
- **ID cards**: `GET /api/id-cards` (people with their card status, counts and filters); `POST /api/members/:id/id-cards` (issue or replace); `POST /api/id-cards/:cardId/deactivate`, `/reactivate`; `GET /api/id-cards/mine` (the signed-in person's own card)
- **Activity**: `/api/workouts`, `/api/exercises`, `/api/time-tracking/*`

---

## 📍 Gurugram Location & Contact

- 🏢 **Facility**: Plot 42, Sector 29, Near Cyber Hub, Gurugram, Haryana 122002, India
- 📞 **Phone**: `+91 98110 PULSE (78573)`
- ✉️ **Email**: `contact@pulsefit.in`
- 🌐 **Web**: `https://pulsefit.in`
- 📸 **Instagram**: `@pulsefit.gurugram`

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<div align="center">
  <sub>Engineered with ❤️ for the Gurugram Fitness Community.</sub>
</div>
