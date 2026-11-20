# Services in the Android app — design (short)

Approved in conversation on 2026-11-20 ("build it"). Builds on
[the mobile app look](2026-11-20-mobile-app-look-design.md).

## Intent

The owner: "android ux not looking good, make general use all user friendly, services should be
visible". Today a guest sees only sign-in buttons, and "Explore first" opens the website's ~8,000 px
landing page inside the app. Members find the services only at the bottom of Me. The gym's
services should be visible to everyone, in the app's own look, and should make sense to someone who
has never been to the gym.

## Goals, non-goals, anti-goals

- **Goals:** services visible on the guest welcome screen, on a new app-style **Services** screen (the
  guests' first tab), and on member **Home**; prices shown where the plans give one.
- **Non-goals:** restyling the service pages themselves (Strength, Zumba, Coaches, Plans & diets,
  Memberships, Exercises); the coach, front desk and admin app screens; any change to the website.
- **Anti-goals:** weakening sign-in gating. Gated pages still never render for guests: a guest who
  taps a gated service gets the sign-in pop-up, as today, and lands on that service after signing in.
  No hard-coded prices: they come from `GET /api/plans`.

## Approaches

- **A (picked): one shared service list, shown three ways.** An app-style Services screen replaces
  the landing page on the guests' first tab; compact tiles go on the welcome screen and member Home.
  Small, consistent, and every tile reuses a page that already exists.
- **B: restyle the landing page for app mode.** Duplicates the website work, and is still long.
- **C: only enlarge the link lists.** Links do not make services visible or appealing.

**Change from the proposal:** no "Classes" tab for guests. The timetable needs sign-in (route access
`auth`), so the tab would only say "Please sign in". The guest tabs become **Services · Contact ·
Sign in**.

## Design

- **The services**, in this order, with the icons and labels of Me's Explore list:
  - Strength floor → `workout`;
  - Zumba studio → `zumba`;
  - Coaches → `trainers`;
  - Plans & diets → `guide`;
  - Exercises → `exercise-library`;
  - Memberships → `pricing`.

  Each has a one-line description in the gym's own words, taken from the landing page and the
  service pages.
- **Prices** come from `api.getPlans()`, using `cheapestPlanFor` and `cheapestPlan` in
  `components/public/plans.ts`:
  - Strength floor: "From ₹699/mo", the cheapest plan covering 'Workout & Strength';
  - Zumba studio: the same for 'Zumba & Cardio';
  - Memberships: the same from the cheapest plan of all.

  While loading, or if the request fails, a price is simply left out and the card still works.
- **Services screen** (`pages/app/ServicesScreen.tsx`), the guests' first tab (`home` at its root, in
  the guest app only):
  - an h1 "Services", with the line "Strength & Zumba gym · Sector 29, Gurugram";
  - one glass card per service: icon, title, description and price;
  - a short note that each service opens after signing in or creating a free account;
  - **Get a free pass**, which opens the free-trial form;
  - **See the full overview**, which opens the landing page (`home?view=full`) as a pushed screen with
    Back.
- **Guest tabs:** the first tab keeps tab id `home` but is labelled **Services**, with a grid icon.
- **Welcome screen:** a "What we offer" section of compact tiles (icon and label, a 3×2 grid) between
  the header and the buttons. A tile opens that service in the guest shell; a gated one asks the guest
  to sign in. The buttons stay, and "Explore first" now opens the Services screen.
- **Member Home:** a "Services" section of the same compact tiles, after the Rewards card and before
  Upcoming classes.
- **Me's Explore list:** unchanged.

## Left to the builder

The exact descriptions, spacing and icon sizes, within the handoff's look:
- `app-glass` cards and lime accents;
- tap targets of at least 44 px;
- correct in both light and dark modes, and at 360 px wide.
