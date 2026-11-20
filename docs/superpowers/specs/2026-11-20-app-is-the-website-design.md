# The Android app shows the website — design (short)

> **Partly replaced** by [the drawer, bottom tabs and app motion](2026-11-20-android-app-drawer-design.md): the app now has its own app bar, drawer and bottom tabs instead of the website header, menu and footer, coaches and admins start on their first tab, and /pass is back as the app's Pass page. The page animations and the app-only behaviour below stay.

Approved in conversation on 2026-11-20.

The owner said: "app not looks good, like web app need to open homepage and some services ux sholube
like webapp but some difference animation ui on androind app". Offered three directions, they
picked **"Exactly the website"**: the same header with its menu button, the same pages and footer,
with only page animations added, and no tab bar or app-only screens.

**What this replaces:**
- the app-shell parts of [the mobile app look](2026-11-20-mobile-app-look-design.md): the bottom
  tab bar, the members' app Home, Classes, Pass, Train and Me screens, and the guests' welcome
  panel and slides;
- the Services screen attempt, committed in ffb3bd2 and reverted in 6b3cf47.

## Goals

- **The homepage first.** The app opens on the website's homepage (`/`) for everyone.
- **Every page as on the website on a phone:** the header with its menu, the page, and the footer.
- **Page animations, in the app only:**
  - opening a page slides it in from the right;
  - Back slides it out;
  - the header stays still.
  - There is no animation with reduced motion or in a WebView without View Transitions. The
    website in a browser does not animate, as today.
- **App-only behaviour that is not layout stays:**
  - the "Update available" pop-up;
  - the Android Back button;
  - no "Get the Android app" banner or footer link inside the app;
  - native share and save;
  - the session kept in secure storage;
  - Google sign-in hidden in the app;
  - the return from payment.

## Non-goals and anti-goals

- **Non-goals:** any change to the website in a browser (it must look and behave exactly as today),
  new features, and the coach and admin screens.
- **Anti-goal: a page members can no longer reach.** Everything the app screens offered (the check-in
  QR pass, bookings, the workout log, rewards, invoices, freeze, profile, theme) must be reachable
  from the website's pages and menu, as it is on the website.

## Approaches

- **A, picked by the owner: exactly the website, plus page animations.** Smallest, and one look
  everywhere.
- **B: the website for guests, the app screens for members.** Not picked.
- **C: the website everywhere, with a bottom tab bar.** Not picked.

## Design

- **App.tsx:** everyone gets the website layout (Navbar, page, Footer). The app shell, the welcome
  panel and slides, "exploring" and the app tab screens are removed. `isAppMode` stays, as "inside
  the app".
- **Page animations:**
  - `withViewTransition` runs whenever `isAppMode` is set, instead of when the page has
    `.app-backdrop`;
  - a forward navigation is 'push' and history Back is 'pop';
  - the header gets a `view-transition-name`, so it stays still while the page slides;
  - the existing keyframes in index.css stay.
- **Deleted, because nothing uses them any more:**
  - `components/app/` except `AppUpdatePrompt`;
  - `pages/app/`;
  - the welcome-seen flag (`isFirstLaunch`);
  - the app-only `/pass` route, if only the app uses it;
  - unused `app-*` CSS;
  - unused helpers in `lib/appMotion.ts`;
  - app-mode branches in website pages (for example in `MemberProfilePage`).
- **Tests:**
  - delete the specs for the removed screens;
  - keep `app-update.spec.ts`;
  - add a spec for the app showing the website: the homepage with header, menu and footer, no tab
    bar and no welcome panel, a member signing in and using their pages, page animations in app
    mode, none in a browser, and none with reduced motion.
- **Docs:** a CHANGELOG [Unreleased] entry; a note in the mobile-app-look design pointing here; the
  README's Android section, if it describes the tab bar.
- **Release, later, when the owner says so:** 2.5.0 with APK 1.2.0. Installed 1.1.0 apps get the
  "Update available" pop-up.
