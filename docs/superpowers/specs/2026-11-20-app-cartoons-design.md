# Animated cartoons on every page and every action of the app — design

Approved by the owner on 2026-11-20 ("appproved").

## Intent and the why

The owner wants the Android app to feel different from the website and more inviting: "add some
cartoons with proper animation with perfom action, to look attractive, colorful and engaing", then
"i need animation for every page and every action". Before anything was built they asked for samples
("before implemention cartoon please create some sample"). Three styles drawn in code were judged
"very bad"; after a wider search ("search entire enternet to get best") they compared ready-made sets
and picked two together, **F and D**, mixed **"best per spot"**:

- **F: Storyset illustrations, Rafiki style** (storyset.com by Freepik): professional flat
  illustrations in one style, with people. We recolour Storyset's accent blue to PulseFit lime
  (#84cc16), drop the room backgrounds, and add looping moves in CSS (arms pump, the rope turns, a lid
  opens). Sample: `.superpowers/brainstorm/162643-1795114195/content/cartoon-samples-2.html`, style F;
  generator `scratchpad/cartoons/gen-f.cjs`.
- **D: free LottieFiles animations** (Lottie JSON, played by lottie-web): professional character
  animations by different artists, livelier, but each a different character. Sample: same page, style
  D.

The website in a browser does not change (app only, as everything app-specific so far).

## Goals

1. **Every page of the app has its own animated scene**, guest, member, coach and admin pages alike,
   placed beside or above the page's title and never pushing the page's main content or main button
   below the first screen of a 390×800 phone. The app's 31 routes in `client/src/routes.ts` (plus the
   app-only `/pass`, `/offers`, `/visit`, `/policies`) each get a scene that fits the page (a dancer on
   Zumba, a calendar on Timetable, a trainer on Coaches, a map on Visit us, a shield on Policies, a
   barcode scanner on Check-in, charts on the admin dashboard, and so on).
2. **Every action has an animated result.** The app reports each action's outcome in about 95 places
   (toasts and confirmation panels across 31 files: booking and cancelling a class, checking in,
   clocking in and out of the floor, logging a workout, claiming and collecting a gift, freezing a
   membership, paying, signing in, signing up, signing out, saving the profile or a password,
   two-step sign-in, sharing a referral, and the staff actions: adding and editing members, ID cards,
   classes, plans, offers, gifts, leads, notes, contact details). Each outcome shows a short animation
   chosen for its kind, about a dozen kinds in all (booked, cancelled, checked in, saved, paid, gift
   claimed, milestone, sent or shared, deleted, signed in, signed out, failed), so a member sees, for
   example, a gift popping open when they claim one, and the front desk sees a jump for joy when a
   scan checks someone in. *Builder's call (from the builder check):* each animation plays where the
   result is shown today, on the device of whoever acted. Members do not check themselves in (staff
   scan them at the desk), so "checked in" plays on the desk's scanner; a member's milestone and
   handed-over gifts keep celebrating when they next open Rewards, as now. Making a member's phone
   react the moment they are scanned would be a new feature, which is a non-goal.
3. **Every waiting, empty and failed state is animated:** loading and pull to refresh (a looping
   skip), every "nothing yet" message (about 90 places), error and offline messages, the 404 page,
   and the launch screen.
4. **Mixed per spot, as the owner chose:** F for scenes with people at the gym and anything that should
   look like PulseFit (lime), D where its livelier characters suit a quick moment better. Each spot uses
   exactly one, and the mapping is written down (below, builder's table).

## Non-goals

- The website (no cartoons there, no change to its download size).
- An animation on every button press (taps keep the existing press-in).
- One bespoke PulseFit mascot doing everything: no free source has one character for all of these;
  it would mean a paid pack or an illustrator, and the owner did not ask for that.
- Changing what any page or action does, or its words.

## Anti-goals (what would make this a failure even if it works)

- **Jank.** Scrolling must stay as smooth as now on the owner's 120 Hz phone (Home measured at 0.7%
  janky frames with `dumpsys gfxinfo`; it was 50% before the blur was removed). No backdrop blur, no
  filters, transform and opacity only, one animation running per screen area, animations paused when
  off screen, when a dialog covers them, and when the app is in the background.
- **Animations in the way.** A result animation never blocks a tap, never delays the next step, plays
  once in about 1.5 s or less, and never hides the result's words. Page scenes never cover content.
- **Motion for people who asked for less.** With reduced motion, every animation shows a still frame.
- **Licence breaches.** Storyset's free licence requires a visible credit ("Illustrations by
  Storyset", linked) and forbids passing the files on by themselves; LottieFiles' Lottie Simple
  License asks that its terms travel with the files. Both go in a Credits part of the app's Policies &
  terms page, with each animation's creator.
- **Outside requests.** Every file ships inside the app (offline-ready); no hotlinking to Storyset,
  LottieFiles or a CDN.
- **A heavier website.** The animation files and the Lottie player load only in the app and only when
  needed (dynamic imports), and are not even in the website's build (see "Where the art files live").
- **Inaccessibility.** Animations are decorative (`aria-hidden`); the words still say everything.
- **Clashing art.** No logos or brand names in any scene; the F scenes all lime; dark theme legible.

## Constraints

- Platform: React 18 + Vite client shared by the website and the Capacitor 8 Android app; app mode is
  `isAppMode` (`client/src/lib/appMode.ts`), and `html.in-app` in CSS.
- F scenes: Storyset Rafiki SVGs, downloaded from storyset.com without login, accent
  `rgb(64,123,255)` → `#84cc16`, room backgrounds removed, looping CSS keyframes on SVG groups
  (transform/opacity only, `transform-box: fill-box`), dark-theme overrides for the darkest colours,
  each scene ideally under 80 KB.
- D scenes: free LottieFiles animations under the Lottie Simple License only (never marketplace items
  or paid-pack samples), no embedded bitmaps, ideally under 150 KB each, played with lottie-web's
  light SVG build, loaded on demand.
- Results are shown through the app's existing toast system and confirmation panels: one shared
  place decides the animation for an outcome's kind, so the ~95 call sites only name their kind.

## Approaches

- **A, illustrations and Lottie files shipped in the app, loaded on demand (picked):** F as cleaned
  SVG with CSS loops, D as Lottie JSON with lottie-web; both bundled, lazy, paused off screen. Crisp at
  any size, recolourable, light enough, works offline.
- B, videos or animated GIFs: heavier, blurry on sharp screens, cannot be recoloured to lime, no
  transparent background in dark theme. Rejected.
- C, commission one PulseFit mascot: the most consistent, but costs money and weeks. Not asked for.
- Samples rejected by the owner: the three drawn in code (A, B, C: "very bad") and Google's animated
  emoji (E).

## Where the art files live (decided by the owner)

The code is on a **public** GitHub repository (`budhpreaygautam/PulseFit`, MIT licence), and
Storyset's free licence does not allow passing its files on by themselves. Asked where the
illustrations should be kept, the owner chose **"Keep them out of GitHub"**:

- All animation files (F and D, with their licence and credit notes) live in one git-ignored folder
  inside the project on this computer, never committed and never in the website's build. The owner
  keeps a private backup of it.
- Only the Android app's build includes them (an app-only build switch in `client/scripts/mobile-sync.mjs`
  and the Vite config). The website build, the e2e build, CI and the Docker image get stand-ins, so
  they build and test without the folder.
- The app's release build refuses to run when the folder is missing or incomplete, so an APK never
  ships without its art.
- The generator scripts that clean and rig the files may be committed (they contain no art); the raw
  downloads stay in the private folder.

## Decided by the owner

- Use F and D together, "Mix freely, best per spot".
- Keep the art out of GitHub and the website (above).
- "i need animation for every page and every action"; app only.
- Samples first (done), real files, nothing hotlinked.

## Left to the builder (marked as such)

- The table of every page and every action kind → its scene (F or D, which file), written into the
  plan before building, following goal 4; the empty states may share a small set of "nothing yet"
  scenes, varied by page.
- Sizes and placement per kind of page (page scene about 96–140 px beside the title on phone), and the
  result animation's placement (inside the toast or above the confirmation text).
- File layout (for example `client/src/app-art/`), the player wrapper, and how the off-screen pause is
  done.
- Which Storyset and LottieFiles files, as long as every rule above holds; sourcing and checking them
  is part of the build, with a contact sheet the owner can look at before release.
