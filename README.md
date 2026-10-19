<div align="center">

# ⚡ PulseFit Athletics

**Gym website, member app, coach dashboard and front desk for a Strength & Zumba gym in Gurugram.**

### [🌐 Open the live app → pulsefit.up.railway.app](https://pulsefit.up.railway.app)

[📱 Download the Android app](https://pulsefit.up.railway.app/downloads/pulsefit.apk) · [API reference](docs/API.md) · [Changelog](CHANGELOG.md) · [Deploying](deploy/README.md)

</div>

## Features

- **Visitors:** class timetable with live spots left, plans and prices in ₹, online payment, free 1-day trial pass, sign-up with email or Google.
- **Members:** book and cancel classes, QR entry pass and digital ID card, workout logger with progress charts, freeze/unfreeze, invoices, optional two-step sign-in.
- **Coaches:** class rosters and attendance, client notes, check-in scanner.
- **Admin & front desk:** dashboard with revenue and attendance, members, ID cards, QR check-in, timetable, plans and prices, free-trial leads.
- **Android & iOS apps** built from the same code.

**Stack:** React 18, TypeScript, Vite, Tailwind CSS · Node.js, Express · JSON file database · Capacitor (mobile) · Vitest and Playwright.

## Run it locally

Needs Node.js 22 or newer.

```bash
git clone https://github.com/budhpreaygautam/PulseFit.git
cd PulseFit
npm run install:all
npm run dev          # API on :5004, website on http://localhost:5173
```

Local development loads a demo gym with one-click demo accounts (password `pulse123`): a member, an all-access
member, a coach and an admin. `npm run seed` resets the demo data. Demo accounts are never available on the
live site.

Optional HTTPS for the dev server: put `cert.pem` and `key.pem` in `client/certs/` (git-ignored).

## Configuration

Copy `server/.env.example` to `server/.env`; it describes every setting. Nothing is required locally.
In production you need at least:

| Variable | Purpose |
| :--- | :--- |
| `JWT_SECRET` | Signs sign-in tokens: a random string of 32+ characters. |
| `PUBLIC_URL` | The site's address, e.g. `https://pulsefit.up.railway.app`. Links, the sitemap and the HTTPS redirect use it. |
| `TRUST_PROXY` | Number of proxies in front of the API (`1` on Railway). |
| `PULSEFIT_DB_PATH` | Where the database file lives, on a persistent disk. |

Online payments and Google sign-in stay hidden until their keys are set (see below).

## Payments

Set **one** of these; `PAYMENT_PROVIDER` picks when both are set.

- **Razorpay:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Add the webhook
  `https://<your-domain>/api/payment/webhook` with the events `payment.captured`, `order.paid` and `payment.failed`.
- **YouPI (free UPI to your own bank account):** `YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_WEBHOOK_SECRET`, using
  your own [YouPI PG](https://github.com/youpi-pg/YouPI-PG) with its webhook set to
  `https://<your-domain>/api/payment/youpi/webhook`.
  > YouPI is experimental: it confirms payments by reading the bank's alerts, so they can be late or missed,
  > and only one member can pay at a time. Check with your bank, reconcile against your statement, and keep
  > Razorpay or paying at the desk as a fallback.

Google sign-in: set `GOOGLE_CLIENT_ID` and add your site as an authorised JavaScript origin.

## Android & iOS Apps

```bash
npm run mobile:sync                      # build the app against the API on this PC
npm run mobile:run                       # install and start it on an emulator or USB phone
npm --prefix client run mobile:release   # signed release APK for the live site
npm run mobile:ios                       # open in Xcode (macOS only)
```

Android needs JDK 21 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`, e.g. from Android Studio). Keep the
Gradle wrapper at 8.14.3. Back up the release key (`%USERPROFILE%\.pulsefit\pulsefit-release.jks` and
`client/android/keystore.properties`): without it, installed apps cannot be updated.

## Tests

```bash
npm test            # API tests
npm run test:e2e    # browser tests (first run: npx playwright install chromium)
npm run typecheck
```

## Deployment

The live site runs on **Railway** and deploys itself: every push to `main` runs the GitHub Actions checks,
and Railway deploys once they pass. The database is on a Railway volume. A new Android app version is
uploaded separately; see [deploy/README.md](deploy/README.md), which also covers hosting on your own server.

To run a production build anywhere else:

```bash
npm run build
npm start            # one process serves the API and the website on $PORT
npm run create-admin -- --email you@example.com --name "Your Name"   # first admin (with the API stopped)
```

## License

[MIT](LICENSE)
