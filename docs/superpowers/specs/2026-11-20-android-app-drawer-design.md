# The Android app: a drawer, bottom tabs and app-only motion — design (short)

Approved in conversation on 2026-11-20.

After [the app showed the website](2026-11-20-app-is-the-website-design.md) the owner said: "still same
as web app, need somthing dieefent on android app". Asked what should make the app different, they
picked **a side drawer menu**, and all four extras offered: **cards animate in**, **tap feedback**, a
**launch animation** and **pull to refresh**. They then asked for sample layouts to compare ("can you
make some sample layout for comparision?"), compared four clickable mockups (the website, a side drawer,
a bottom tab bar, a drawer plus tabs; `.superpowers/brainstorm/162643-1795114195/content/app-layouts.html`)
and picked **D: drawer + tabs**.

## The frame (D: drawer + tabs)

- **Bottom tabs** for what members use most: **Home** (the website's homepage, `/`), **Classes** (the
  timetable, `/schedule`), **Pass** (an app-only page, `/pass`, with the member's check-in QR pass and
  the ID card button, built from the website's own QR pass and ID card components), **Me** (My account,
  `/profile`). The open tab is marked (Material-style pill behind its icon); tapping the open tab
  scrolls its page to the top.
  - The owner compared mockups for the other roles too ("can you make sample out line for guest and
    admin coaches also, for comparision"; `.superpowers/brainstorm/162643-1795114195/content/app-roles.html`)
    and picked:
    - **Guests (G1):** **Home**, **Contact** (`/contact`) and **Sign in** (opens the sign-in dialog),
      because Classes and Pass need an account; a "Free pass" button in the app bar.
    - **Coaches (C2):** **Today** (the Coach dashboard, `/trainer`), **Check-in** (front-desk check-in),
      **Classes** (the timetable, `/schedule`), **Me** (My account).
    - **Admins (A2, changed by the owner):** **Dashboard** (`/admin`), **Members**, **Leads**, **Classes**
      (Classes & coaches). The owner said the admin is the gym owner ("why check-in option for admin, it
      is for gym owner"), so Check-in is not a tab for admins; it stays in their drawer.
    - Coaches and admins open on their first tab (their dashboard) when the app starts signed in;
      members and guests open on the homepage. Their pages themselves are not changed.
  - *Builder's call:* switching tabs cross-fades quickly; any other page slides in, Back slides out.
- **A slim app bar** instead of the website header: on a tab's own page, ☰ (opens the drawer) and the
  page's title ("PulseFit" with the logo on Home); on any other page, ← (Back) instead of ☰. On the
  right, the QR pass button for members and "Free pass" for guests.
- **The drawer** (below) stays the way to everything else: services, Contact us, bookings, workout log,
  rewards, settings, staff pages, legal links.
- The tab bar keeps clear of the gesture bar and the side insets, and hides while the keyboard is open.

The pages and services stay the website's (the owner's earlier ask: "some services ux sholube like
webapp but some difference animation ui on androind app"). What changes in the app is the frame
around them and how it moves.

## Goals (all in the app only; the website in a browser stays exactly as it is)

- **Side drawer instead of the website menu.** The header's menu button sits at the left (Android's
  place for it) and opens a drawer that slides in from the left over a dimmed page:
  - at its top, for members their photo, name, plan and status; for guests the logo with Sign in and
    Join; for coaches and admins their name and role;
  - then the website menu's own links, in its groups (Explore, My PulseFit, the staff links), each with
    its icon and the open page marked;
  - then the theme switch and Sign out, and at the bottom the links the footer had that are nowhere
    else (Exercise library, Privacy, Terms, Refunds). *Changed after the phone test, below: no footer
    links or address in the drawer.*
  - It closes on a link, the scrim, a swipe to the left, Escape or Android Back. It is a modal dialog
    for screen readers and the keyboard: focus moves in, stays in, and returns to the menu button.
- **No website footer in the app.** Everything it links to is in the drawer or on Contact us.
- **Cards animate in:** cards fade and rise a little as they first scroll into view, a few at a time
  in a short stagger; cards that arrive later (after data loads) too.
- **Tap feedback:** buttons, links and tappable cards shrink slightly while pressed. *The light
  vibration (Capacitor Haptics) first built here was removed after the phone test, below.*
- **Launch animation:** when the app starts cold, the PulseFit logo animates on the app's background
  for under a second and fades into the page; it never blocks the page, a dialog or a tap.
- **Pull to refresh:** at the top of a page, pulling down shows a spinner under the header; releasing
  past the threshold reloads the page's data (and the signed-in account).
- Page slides (push in, Back out) and everything else from the previous design stay.

## Non-goals and anti-goals

- **Non-goals:** any change to the website in a browser (`/pass` stays a missing page there); new
  features beyond the Pass page; the old app screens (Home, Classes, Train, Me with their own look);
  changes to the staff pages themselves.
- **Anti-goals:**
  - a page or link that members, guests or staff can no longer reach in the app;
  - losing what someone typed: pull to refresh is only offered on pages without a form to fill in
    (the homepage, the service pages, timetable, memberships, coaches, exercise library, dashboard,
    my bookings, rewards, the pass), and never while something typed is on the page (a note, a
    coupon, a search);
  - motion for people who ask for less: with reduced motion nothing slides, rises or scales, and the
    launch animation is a short fade;
  - content that stays hidden if an animation does not run: a card is only hidden once the code that
    reveals it is watching it;
  - jank: animations use transform and opacity only.

## Approaches

Compared as clickable mockups:

- **A, the website as it is:** not picked ("still same as web app").
- **B, side drawer only:** picked first, then replaced by D after the comparison.
- **C, bottom tab bar only:** not picked.
- **D, drawer + bottom tabs, picked by the owner.** The website's pages, the four things members use
  most one tap away, and the drawer for everything else; no footer.

## Calls left to the builder (marked as such)

- The drawer's width, timing and scrim, within Android's usual feel (about 300 ms, 85% of the width
  up to 320 px).
- How cards are found (the shared card classes) and the exact rise distance and stagger.
- The pull distance, resistance and spinner.
- ~~Haptics~~: removed after the phone test (below), with `@capacitor/haptics`.
- A tab stays marked on its own section queries (Me with `?tab=`, Members with `?status=`); any other
  query makes the page no tab's own, so it gets ←.
- ← on a page with no earlier one in the app (opened straight on it) goes to the account's first tab,
  and so does Android Back there.
- Coaches and admins get their account link at the right of the app bar (members the QR pass, guests
  "Free pass").

## After the test on the owner's phone (2026-11-20)

The owner installed the build on their phone (a Realme with a 120 Hz screen) and asked for these
changes, all in the app only; the website in a browser stays as it is. This section was approved by
the owner on 2026-11-20 ("approved").

- **No footer block in the drawer.** Of the drawer's bottom links and address block: "fix this. it
  should not in the menus". The drawer ends with its rows; the links that were only in that block
  are not added elsewhere, except as the new pages below. *Builder's call:* "Exercise library" became
  an ordinary drawer row after Coaches for guests, coaches and admins (members already have
  "Exercises"), because nothing else in the app reached it (anti-goal: no page out of reach).
- **Policies & terms page** (app-only `/policies`, like `/pass`: a missing page on the website): "dedicated
  privacy policy page havig all the policy and term and condtion there and nesesary things". The
  privacy policy, terms of service, and refund & cancellation policy on one page with a jump list,
  using the website's own policy texts, plus how to delete an account and its data, who to contact,
  and the app's version. `/privacy`, `/terms` and `/refund-policy` stay (Google Play links the privacy
  policy). A drawer row.
- **Visit us page** (app-only `/visit`): "dicated page for location details page". Address, a "Get
  directions" button opening Google Maps, tap to call, the email, opening hours with open now or
  closed, Sunday closed. No map embedded in the page (it would load Google's tracking and weight). A
  drawer row.
- **Offers & gifts page** (app-only `/offers`): "why offer and gift details not there". Picked by the
  owner: one page for everyone with the sales running now and their time left, the joining gift
  each plan comes with (both from `GET /promotions`), and how points and milestone gifts work.
  Signed-in accounts also see the gift store (`GET /rewards/gifts` needs a sign-in, so guests do not);
  members see their points with a link to Rewards. A drawer row; pull to refresh is offered there.
- **Smooth scrolling:** "make scroll smooth, currenlty it have not". The app bar, its buttons and the
  tab bar blur what scrolls under them, redrawn every frame (120 per second on this phone), and pull
  to refresh listens to every finger move with a listener that can stop scrolling. In the app the
  bars and their buttons are solid (no backdrop blur), and pull to refresh only listens to finger
  moves of a touch that starts at the top of the page. Measured on the phone before and after
  (`dumpsys gfxinfo`).
- **No vibration:** "and no vibration should on click". No vibration at all; `@capacitor/haptics` is
  removed. The press-in on tap stays.
- **Guests' drawer buttons:** "Signup | Signin". "Join" becomes **Sign up**, first, then **Sign in**.
- **Email address:** the owner was told that `contact@pulsefit.in` is on a domain someone else runs,
  and that it shows on ID cards, payment messages and the policies; they chose to leave it as it is
  for now.

## Release, later, when the owner says so

2.5.0 with APK 1.2.0. Installed 1.1.0 apps get the "Update available" pop-up.
