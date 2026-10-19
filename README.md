<div align="center">

# ⚡ PulseFit Athletics

### 🏋️ Strength & 💃 Zumba gym in Gurugram: website, member app, coach dashboard and front desk

<br>

[![Open the live app](https://img.shields.io/badge/OPEN_THE_LIVE_APP-pulsefit.up.railway.app-84cc16?style=for-the-badge&logo=googlechrome&logoColor=white&labelColor=0f172a)](https://pulsefit.up.railway.app)

[![Download the Android app](https://img.shields.io/badge/Android_app-Download_APK-3DDC84?style=for-the-badge&logo=android&logoColor=white&labelColor=0f172a)](https://pulsefit.up.railway.app/downloads/pulsefit.apk)

<br>

[![React 18](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=flat-square&logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)](https://railway.com/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)

📖 [API reference](docs/API.md) · 📝 [Changelog](CHANGELOG.md) · 🚢 [Deploying](deploy/README.md)

</div>

---

## 🌟 Features

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🌐 Visitors</h3>
      🗓️ Class timetable with live spots left<br>
      💰 Plans and prices in ₹, paid online<br>
      🎟️ Free 1-day trial pass<br>
      🔑 Sign up with email or Google
    </td>
    <td width="50%" valign="top">
      <h3>🏋️ Members</h3>
      📅 Book and cancel classes<br>
      📲 QR entry pass and digital ID card<br>
      📈 Workout logger with progress charts<br>
      ❄️ Freeze/unfreeze, 🧾 invoices, 🔐 two-step sign-in
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🥋 Coaches</h3>
      📋 Class rosters and attendance<br>
      🗒️ Client notes<br>
      📷 Check-in scanner
    </td>
    <td width="50%" valign="top">
      <h3>🛡️ Admin & front desk</h3>
      📊 Revenue and attendance dashboard<br>
      👥 Members and 🪪 ID cards<br>
      ✅ QR check-in<br>
      🗓️ Timetable, plans, free-trial leads
    </td>
  </tr>
</table>

📱 **Android & iOS apps** are built from the same code.

---

## 🚀 Run it locally

Needs **Node.js 22** or newer.

```bash
git clone https://github.com/budhpreaygautam/PulseFit.git
cd PulseFit
npm run install:all
npm run dev          # API on :5004, website on http://localhost:5173
```

🎭 Local development loads a demo gym with one-click demo accounts (password `pulse123`): a member, an
all-access member, a coach and an admin. `npm run seed` resets the demo data. Demo accounts are never
available on the live site.

🔒 Optional HTTPS for the dev server: put `cert.pem` and `key.pem` in `client/certs/` (git-ignored).

---

## ⚙️ Configuration

Copy `server/.env.example` to `server/.env`; it describes every setting. Nothing is required locally.
In production you need at least:

| Variable | Purpose |
| :--- | :--- |
| 🔑 `JWT_SECRET` | Signs sign-in tokens: a random string of 32+ characters. |
| 🌐 `PUBLIC_URL` | The site's address, e.g. `https://pulsefit.up.railway.app`. Links, the sitemap and the HTTPS redirect use it. |
| 🔁 `TRUST_PROXY` | Number of proxies in front of the API (`1` on Railway). |
| 💾 `PULSEFIT_DB_PATH` | Where the database file lives, on a persistent disk. |

Online payments and Google sign-in stay hidden until their keys are set (see below).

---

## 💳 Payments

Set **one** of these; `PAYMENT_PROVIDER` picks when both are set.

- 💠 **Razorpay:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Add the webhook
  `https://<your-domain>/api/payment/webhook` with the events `payment.captured`, `order.paid` and `payment.failed`.
- 🇮🇳 **YouPI (free UPI to your own bank account):** `YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_WEBHOOK_SECRET`,
  using your own [YouPI PG](https://github.com/youpi-pg/YouPI-PG) with its webhook set to
  `https://<your-domain>/api/payment/youpi/webhook`.
  > ⚠️ YouPI is experimental: it confirms payments by reading the bank's alerts, so they can be late or
  > missed, and only one member can pay at a time. Check with your bank, reconcile against your statement,
  > and keep Razorpay or paying at the desk as a fallback.

🔑 Google sign-in: set `GOOGLE_CLIENT_ID` and add your site as an authorised JavaScript origin.

---

## 📱 Android & iOS Apps

```bash
npm run mobile:sync                      # build the app against the API on this PC
npm run mobile:run                       # install and start it on an emulator or USB phone
npm --prefix client run mobile:release   # signed release APK for the live site
npm run mobile:ios                       # open in Xcode (macOS only)
```

🤖 Android needs JDK 21 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`, e.g. from Android Studio). Keep the
Gradle wrapper at 8.14.3.

🔐 Back up the release key (`%USERPROFILE%\.pulsefit\pulsefit-release.jks` and
`client/android/keystore.properties`): without it, installed apps cannot be updated.

---

## 🧪 Tests

```bash
npm test            # API tests
npm run test:e2e    # browser tests (first run: npx playwright install chromium)
npm run typecheck
```

---

## 🚢 Deployment

The live site runs on 🚂 **Railway** and deploys itself:

```text
git push (main)  ➜  ✅ GitHub Actions checks  ➜  🚂 Railway builds and deploys
```

A failed check leaves the current version running. 💾 The database is on a Railway volume. 📱 A new Android
app version is uploaded separately; see [deploy/README.md](deploy/README.md), which also covers hosting on
your own server.

To run a production build anywhere else:

```bash
npm run build
npm start            # one process serves the API and the website on $PORT
npm run create-admin -- --email you@example.com --name "Your Name"   # first admin (with the API stopped)
```

---

<div align="center">

📄 [MIT License](LICENSE) · Made with ❤️ for the Gurugram fitness community

</div>
