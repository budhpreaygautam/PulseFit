# ⚡ PULSEFIT ATHLETICS — Cyber Hub, Gurugram

<div align="center">

![PulseFit Banner](https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop)

### 🏋️ High-Performance Athletic Gym, Member Portal & Turnstile Management Platform
**Built for athletes, high-performers, and modern fitness clubs in Cyber Hub, Gurugram, Haryana, India.**

---

[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_6.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js_20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express_4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay_Payments-0C2340?style=for-the-badge&logo=razorpay&logoColor=528FF0)](https://razorpay.com/)
[![Location](https://img.shields.io/badge/Location-Gurugram%2C%20Haryana%20%F0%9F%87%AE%F0%9F%87%B3-FF9933?style=for-the-badge&logo=google-maps&logoColor=white)](https://maps.google.com)

[Explore Features](#-feature-highlights) • [1-Click Demo Accounts](#-1-click-interactive-demo-personas) • [Tech Stack](#-technology-stack) • [Quick Start](#-quick-start) • [API Reference](#-api-endpoints)

---

</div>

## 📖 Overview

**PulseFit** is a full-stack, enterprise-grade gym web application engineered with modern aesthetics, high-contrast dark/light glassmorphism, and minimal visual clutter. Designed with an authentic athletic identity inspired by Gurugram's bustling tech and fitness corridor, PulseFit integrates real-time class booking, turnstile optical QR scanning, workout set logging, and seamless Razorpay payment gateways in Indian Rupees (₹ INR).

---

## 🌟 Feature Highlights

<table>
  <tr>
    <td width="50%">
      <h3>🌐 1. Public Discovery & Marketing</h3>
      <ul>
        <li><b>Minimalist Hero Experience</b>: High-impact typography, real-time membership counters, and direct action triggers.</li>
        <li><b>Curated Gurugram Facilities</b>: Olympic lifting platforms, cricket agility turf, contrast hydrotherapy suites (sauna & 10°C cold plunge), and herbal recovery chai & juice bar.</li>
        <li><b>Interactive Class Timetable</b>: Live filtering across HIIT, Strength, Power Yoga, Boxing, and Cycling with occupancy indicators.</li>
        <li><b>Transparent INR Pricing</b>: Standard (₹1,499/mo), Performance Pro (₹2,499/mo), and Elite VIP (₹3,999/mo) with Razorpay integration.</li>
        <li><b>Instant 1-Day VIP Trial Pass</b>: Instant digital voucher generator with confetti celebrations.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🏋️ 2. Member Performance Hub</h3>
      <ul>
        <li><b>Dynamic Digital QR Pass</b>: Real-time turnstile pass modal with optical barcode and quick copy utilities.</li>
        <li><b>Workout Streak Tracker</b>: Visual streak flame meters and monthly volume tonnage records.</li>
        <li><b>1-Click Class Booking</b>: Reserve slots with conflict prevention and automated cancellation slots.</li>
        <li><b>Interactive Workout Logger</b>:
          <ul>
            <li>Live session tonnage & RPE tracking</li>
            <li>Warmup vs Working set flags</li>
            <li>Rest Stopwatch with 30s, 60s, 90s, and 180s presets</li>
          </ul>
        </li>
        <li><b>30+ Exercise Movement Library</b> with muscle targeting and form cues.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🛡️ 3. Staff & Admin Management Suite</h3>
      <ul>
        <li><b>Executive KPI Dashboard</b>:
          <ul>
            <li>Monthly Recurring Revenue (MRR in ₹)</li>
            <li>Active Members, Daily Check-Ins, Class Utilization %</li>
            <li>Attendance Bar Chart (Mon–Sun) & Revenue Donut Chart</li>
            <li>Hourly Traffic Curve (06:00 to 21:00 peak hours)</li>
          </ul>
        </li>
        <li><b>Member Management Directory</b>: Fast search, status filters (Active, Expired, Frozen), plan editing, and deletion.</li>
        <li><b>Optical Turnstile Check-In Simulator</b>: High-speed barcode scanning with instant green/red verification and live feed stream.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>💳 4. Razorpay & Indian Localization</h3>
      <ul>
        <li><b>INR Currency Standardized</b>: All monthly & annual tiers formatted in ₹.</li>
        <li><b>Mock Razorpay Payment Gateway</b>: Automated order generation (`POST /api/payment/create-order`) and HMAC SHA256 verification (`POST /api/payment/verify`).</li>
        <li><b>Indian Personas & Coaching Roster</b>: Real-world profiles (Aarav, Ananya, Priya, Coach Vikram, Kavya Sen, Rohan Mehta).</li>
        <li><b>Cyber Hub Gurugram Location</b>: Plot 42, Sector 29, Gurugram, Haryana 122002.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🎭 1-Click Interactive Demo Personas

PulseFit comes with an **instant demo switcher** in the top navigation bar. Click any persona to instantly test their portal experience:

| Persona | Role | Credentials | Access & Sample Data |
| :--- | :--- | :--- | :--- |
| **Aarav Sharma** | 🥇 **Pro Member** | `member@pulsefit.com` / `pulse123` | 14-day streak, ₹2,499 Pro plan, booked classes, personal QR pass |
| **Ananya Gupta** | 💎 **VIP Member** | `vip@pulsefit.com` / `pulse123` | 9-day streak, ₹3,999 VIP tier, cold plunge credits, priority check-in |
| **Priya Verma** | 👑 **Admin / General Manager** | `admin@pulsefit.com` / `admin123` | Financial KPI analytics in ₹, member directory, turnstile scanner tool |
| **Coach Vikram** | 🥋 **Head Coach** | `trainer@pulsefit.com` / `pulse123` | Trainer dashboard, class attendance rosters, client assessment notes |

---

## 🛠️ Technology Stack

```mermaid
graph TD
    subgraph Frontend ["Frontend (Vite + React 19)"]
        UI[Tailwind CSS + Glassmorphism UI]
        Router[Custom Single Page Routing]
        State[Auth & Toast Contexts]
        Charts[Recharts Data Visualizations]
        Icons[Lucide React Icons]
    end

    subgraph Backend ["Backend (Node.js + Express)"]
        API[Express REST API]
        Auth[JWT & Role Middleware]
        Payment[Razorpay Order & Verify Engine]
        DB[(JSON File Persistent DB)]
    end

    Frontend -->|REST API / JSON| Backend
```

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Recharts](https://recharts.org/), [Canvas Confetti](https://www.npmjs.com/package/canvas-confetti)
- **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/), [TypeScript](https://www.typescriptlang.org/), [bcryptjs](https://www.npmjs.com/package/bcryptjs), [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken), [cors](https://www.npmjs.com/package/cors)
- **Data Engine**: Persistent JSON-backed zero-configuration transactional database (`server/data/gym-db.json`)

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Clone the Repository
```bash
git clone https://github.com/budhpreaygautam/PulseFit.git
cd PulseFit
```

### 2. Install Dependencies
```bash
# Install root, backend, and frontend dependencies in one command
npm run install:all
```

### 3. Seed Realistic Database
```bash
# Seeds demo accounts, classes, coaches, exercises, and INR plans
npm run seed
```

### 4. Run Development Servers
```bash
# Concurrently starts Express API on :5004 and Vite Client on :5173
npm run dev
```

Open **`https://localhost:5173`** (or `http://localhost:5173`) in your browser to view PulseFit!

---

## 📂 Project Architecture

```text
PulseFit/
├── package.json                   # Root workspace scripts & concurrently runner
├── README.md                      # Project documentation
├── server/                        # Express Backend
│   ├── src/
│   │   ├── index.ts               # Server startup entry point
│   │   ├── server.ts              # Express configuration & routes
│   │   ├── controllers/           # Auth, classes, bookings, workouts, payments, analytics
│   │   ├── middleware/            # JWT authentication, role guards & validation
│   │   ├── routes/                # Express API router definitions
│   │   └── db/
│   │       ├── database.ts        # Persistent JSON database driver
│   │       └── seed.ts            # Realistic Gurugram dataset seeder
│   └── data/
│       └── gym-db.json            # Persistent JSON database file
│
└── client/                        # React 19 Frontend
    ├── src/
    │   ├── App.tsx                # Master app container & routing logic
    │   ├── context/               # AuthContext & ToastContext providers
    │   ├── api/                   # Typed API service clients
    │   ├── components/
    │   │   ├── common/            # Modal, Badge, StatCard, Dropdown, Button
    │   │   ├── layout/            # Navbar with persona switcher & Footer
    │   │   └── qr/                # DigitalQrPassModal
    │   └── pages/
    │       ├── public/            # LandingPage, PricingPage, SchedulePage, TrainersPage
    │       ├── member/            # MemberDashboard, WorkoutLogger, ExerciseLibraryView
    │       └── admin/             # AdminDashboard, MemberManagement, QuickCheckInScanner
    ├── tailwind.config.js         # Theme colors, glow effects & animations
    └── vite.config.ts             # Vite build & backend proxy config
```

---

## 📡 API Endpoints

### 🔐 Authentication & Demo Login
- `POST /api/auth/login` — Member or staff credentials login
- `POST /api/auth/register` — Register a new member account
- `POST /api/auth/demo-login` — 1-Click instant login for demo personas
- `GET /api/auth/me` — Fetch current authenticated user session

### 🏋️ Classes & Bookings
- `GET /api/classes` — Fetch weekly class schedule with occupancy
- `POST /api/classes` — Create a new class (Admin/Trainer only)
- `POST /api/bookings` — Reserve a spot in a class
- `GET /api/bookings/my` — Fetch current member's bookings
- `DELETE /api/bookings/:id` — Cancel a class reservation

### 💳 Payments & Memberships
- `GET /api/plans` — Fetch INR membership tiers (Standard, Pro, VIP)
- `POST /api/payment/create-order` — Create Razorpay order in INR paise
- `POST /api/payment/verify` — Verify Razorpay payment signature & upgrade tier

### 🛡️ Admin & Analytics
- `GET /api/analytics/dashboard` — KPI metrics, MRR, attendance charts & peak traffic
- `GET /api/members` — Fetch member directory with filter & pagination
- `POST /api/check-in/scan` — Turnstile optical QR code scanner check-in

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
