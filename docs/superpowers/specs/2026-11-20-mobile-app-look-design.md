# Mobile app look and animations — design

> **Replaced.** The owner chose to make the app the website instead: the app shell, tab bar, member
> screens and welcome panel described here were removed. See
> [The Android app shows the website](2026-11-20-app-is-the-website-design.md).

Date: 2026-11-20 · Status: draft for the owner's approval

## Why

The Android/iOS app is the website inside a Capacitor wrapper, so it looks and behaves like a website:
top header with icons, a role row, a demo-account bar and a footer. The owner wants it to feel like a
real phone app: "engaging to users, they will be curious to know more, look very attractive, colorful,
UI should be smooth". They chose a soft neumorphic look with a lime accent, then supplied a
**high-fidelity design handoff** for the mobile apps.

## Source of truth for the look

`docs/design/pulsefit-mobile-handoff/` (from the owner): `README.md` (tokens, sizes, behaviour per
screen), `PulseFit Mobile.dc.html` (interactive prototype; reference only, never shipped; its
`support.js` runtime was deliberately not copied) and `screenshots/` (light and dark). Fidelity is
**high**: colours, type, spacing, shadows and interactions are final; recreate them with the
codebase's own tokens and patterns, and map its FontAwesome icons to the nearest `lucide-react` icon
(the README lists them). Phone bezel, status bar and home indicator in the mock are not built.

This release builds **screen set 1a (Member app)** only. Sets 1b (Coach), 1c (Front desk) and 1d
(Admin) are a later round (owner: "Member app first").

## Goals

1. Inside the app, members get the handoff's **app shell**: bottom tab bar
   **Home · Classes · Pass · Train · Me**, no website header, role row, demo bar or footer.
2. The handoff's member screens: **Home, Classes, Pass, Train, Me**, wired to real data.
3. **Rewards** (from the rewards project) appear as a **card on Home** and a **section in Me**
   (owner's choice; the five tabs stay as designed).
4. **Guests** opening the app get a short **welcome screen** in the same visual language.
5. **Smooth animations** on top of the handoff, switched off when the phone asks for reduced motion.
6. Light and dark themes exactly as designed.

## Non-goals

- Coach, front-desk and admin apps (handoff 1b–1d): next round. Staff who sign in to the app keep
  today's layout in this release.
- Tablet layouts, push notifications, offline mode, haptics, biometric sign-in, brightness boost.
- Changing the website's look (only app mode changes).
- New backend endpoints, apart from two small **read-only** numbers if the existing data can't give
  them cheaply: `active_days_this_week` and `longest_streak_days` on the member's own data.
- Building or testing the iOS app in this release (it needs a Mac). iOS keeps working from the same
  code; this release ships the Android APK only.

## Anti-goals

- Two frontends to maintain (no rewrite, no second UI kit).
- Mock data or invented numbers in the shipped app (the handoff's sample values are placeholders).
- Animations that make the app feel slower or that ignore reduced motion.
- Hiding a feature the website has: every member feature stays reachable in the app.
- Weakening the sign-in gating: gated pages still never render for guests.

## Constraints (from the code)

- One React + Vite frontend; the app bundles it (`client/capacitor.config.ts`, `webDir: dist-mobile`).
- `isNativeApp` (`client/src/lib/native.ts`) already tells the code it runs inside the app;
  `matchSystemBarsToTheme` and `handleAndroidBackButton` already exist.
- Android WebView must be Chrome 140+ (checked in `native.ts`); iOS uses WKWebView.
- Theme: light by default with a stored manual choice (`ThemeContext`); the app keeps that behaviour.
- Navigation goes through `navigate()` in `NavigationContext` (which enforces the sign-in gating);
  pages are chosen in `App.tsx` from `client/src/routes.ts`.
- Neumorphic tokens and classes exist in `client/src/index.css` (`--gym-*`, `--neu-*`, `.neu-flat`,
  `.neu-btn`, `.neu-btn-lime`, `.neu-pressed*`, `font-heading`); Inter and Outfit are already loaded.
  The handoff's token values match these; add only what is missing (glass layer, backdrop glows).
- **No new runtime dependencies.** Playwright e2e runs in a desktop browser, so app mode needs a
  test-only way to switch on.
- Ships after a new APK (v1.1.0, versionCode 2+) is built and uploaded.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **App mode inside the existing frontend** (one switch, the handoff's shell and screens around the same data and pages, CSS motion + View Transitions) | ~10–20% of the frontend changes; website and app share every feature; free | **Chosen by the owner** ("ok go with 1") |
| Add a mobile component kit (Ionic) | Big new dependency; stock look that fights the handoff | Rejected |
| Rewrite the app frontend (Flutter / React Native) | Every screen built twice, forever | Rejected |

## Design

### App shell (members, in the app only)

- Bottom tab bar per the handoff ("Global layout"): **Home · Classes · Pass · Train · Me**, active lime,
  frosted bar, safe-area aware (`env(safe-area-inset-bottom)` instead of the mock's fixed 34 px).
  `nav` landmark with `aria-current="page"`; targets at least 44×44 px.
- No website `Navbar` (header, role row, demo bar), `Footer` or Android banner in app mode.
- Screens that are not tabs (e.g. a guide page opened from Me) get a slim title bar with a back
  arrow (same history as the Android back button).
- Page titles, section titles, spacing (20 px gutter), radii, shadows, glass layer and backdrop
  glows exactly per the handoff tokens.

### Screens (handoff 1a, with real data)

- **Home:** header (avatar tile using `avatarOf(user)` in place of initials, "Hi, {first name}", plan
  name + status pill, "Valid through {date}"); **streak card**; 3-up quick actions **Pass**,
  **ID card**, **Log workout** (lime); **Rewards card** (points balance, next milestone, "gift ready to
  collect" when a claim is ready; opens the Rewards section in Me); **Upcoming classes** (with
  "Timetable →" to Classes; empty state as designed); **Note from your coach** (latest note, hidden
  when there is none).
- **Streak card numbers (builder's call):** the centre number is `streak_days` (same as the website
  dashboard). "**N of 5 sessions this week**" counts **active days this week** (Mon–Sun, gym time
  zone) with the streak rule: staff check-in, attended class, completed floor session or a workout
  logged on its own day; the goal is a fixed 5; the ring fills to that fraction. "Sundays don't break
  it" is shown as designed; "**N more days to beat your best**" uses the member's longest streak and is
  left out when the longest is unknown or already beaten.
- **Classes:** day chips for the days the gym is open (from the gym hours config, not a fixed Mon–Fri),
  class cards with type tint per the handoff (strength lime, HIIT amber, Zumba pink), **Book /
  Booked / Waitlist** states driven by the real booking API and its rules (plan coverage, capacity,
  14-day window); booked classes appear on Home.
- **Pass:** the handoff's pass card with the **real rotating QR** from `DigitalQrPassModal`'s logic.
- **Train:** the handoff's workout logger on top of the existing workout API: weekly volume bars from
  workout analytics, exercise cards with set chips, "Add set (repeat last)", **Finish workout** →
  saved state.
- **Me:** digital ID card; **Freeze membership** switch using the existing freeze/unfreeze rules and
  copy; **Plans** list (current plan marked; "Switch" goes to the existing checkout); **Invoices**
  (download as today); **Rewards** section (points, gift store, my gifts with pickup codes, referral
  code + share); an **Explore** list (Strength floor, Zumba studio, Plans & diets, Coaches,
  Memberships, Exercises, Contact us); dark-mode switch; Sign out. Every former header link stays
  reachable here.

### Guests in the app

- A **welcome screen** in the handoff's visual language: three swipeable slides (💪 Strength floor,
  💃 Zumba studio, 🎁 Rewards & gifts), then **Sign in**, **Create account**, **Get a free pass**,
  **Contact us** and **Explore first**.
- Slides show on the **first launch** only (flag kept on the phone); afterwards a signed-out app
  (including right after Sign out) opens on the last panel without slides. "Explore first" opens the
  public home inside a guest shell (🏠 Explore · 💬 Contact · 🔑 Sign in) and is not remembered.
  Gated pages keep opening the sign-in pop-up.

### Coaches and admins in the app (this release)

Today's layout, unchanged. Their handoff screens (1b–1d) are the next round.

### Animations (builder's call, on top of the handoff)

The handoff specifies only control transitions (`all .2s ease`, switch knob `left .2s`, progress
`.25s`, scan line). The owner asked for a smooth, engaging app, so app mode adds, all in CSS or View
Transitions and none under `prefers-reduced-motion: reduce`:
- tab switches cross-fade; sub-screens slide in from the right and back out (View Transitions only
  where the WebView supports them; otherwise pages switch instantly);
- cards rise in with a short stagger (~40 ms per item, max 8) on a screen's first render;
- the streak ring and progress bars fill from 0; numbers count up briefly;
- buttons and tiles press in on touch (~0.97 scale + inset shadow);
- confetti (existing helper) when a gift is earned or a payment succeeds;
- shimmer placeholders while lists load.
Durations 150–350 ms, ease-out; nothing blocks input.

### Testing and release

- A **test-only switch** turns app mode on in a normal browser so Playwright can cover it; production
  app mode comes only from `isNativeApp`.
- E2E at 390×800: each tab with real data, booking from Classes, Pass QR, Train add set + finish, Me
  freeze switch and invoices, Rewards card and section, Explore links reach every former header link,
  guest welcome flow, gated pages still prompt sign-in, reduced motion disables animations, light and
  dark. Visual check against the handoff screenshots.
- The website e2e suite stays green (website unchanged).
- Release: APK v1.1.0 after the backend is deployed.

### Order

After the rewards project is merged (the Rewards card and section need it).

## Left to the builder

- Component structure and file layout (e.g. `AppShell`, `TabBar`, screen components), and how the
  test-only switch is wired.
- Exact copy for welcome slides; lucide icon mapping per the handoff list.
- Which remaining dashboard sections (floor clock, progress, recent check-ins) fold into Home or Me,
  as long as every feature stays reachable.
- Splitting the work into reviewable steps.
