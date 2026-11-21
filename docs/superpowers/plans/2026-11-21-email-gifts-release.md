# Email sending, gift photos and release 2.5.0 prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Send password-reset, booking and payment emails once Brevo is configured; show real gift photos (16 everywhere, 7 app-only illustrations); prepare version 2.5.0 / app 1.2.0 without publishing.

**Architecture:** Emails reuse `server/src/lib/mailer.ts` behind `emailConfigured()`, sent after the response. Gift photos are static files in `client/public/gifts/`, referenced by path, accepted by the API as a fixed set; the 7 app-only illustrations are `gift.<slug>` scenes in the private `@app-art` folder, shown by `GiftImage` in app mode. Release prep changes version numbers and notes only.

**Tech Stack:** Express + TypeScript (vitest), React 18 + Vite, Capacitor 8 Android, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-email-sending-design.md`, `docs/superpowers/specs/2026-11-20-gift-photos-design.md`, and the release note in `docs/superpowers/specs/2026-11-20-android-app-drawer-design.md` ("2.5.0 with APK 1.2.0").

## Global Constraints

- Branch `feature/app-cartoons` in `.claude/worktrees/app-cartoons`; commit locally; never push, deploy or publish.
- No email is sent unless `emailConfigured()`; email never blocks or fails the action; logs carry ids and error text only, never addresses or names.
- Gift photos: only Unsplash/Pexels-licensed cut-outs on the matching white tile; Storyset art only in `client/app-art/` (git-ignored), app-only.
- The website shows the 16 photos and the emoji for the other 7; nothing else on the website changes.
- Release prep publishes nothing: no tag, no APK upload, no deploy.

## Review Focus

1. **Forgot password for an unknown email** with email on: same response, no email. Test in Task 1.
2. **Brevo down or slow:** booking and payment still succeed at once. Test in Task 1.
3. **An admin who changed a default gift's emoji:** the one-time update leaves it alone. Test in Task 2.
4. **The app without the private art** (stand-ins): the 7 gifts fall back to emoji. Test in Task 2.
5. **An installed 1.1.0 app** after release: the update prompt offers 1.2.0 (versionCode 3). Checked in Task 3.

---

### Task 1: Transactional emails

**Files:** `server/src/lib/mailer.ts` (reuse), new `server/src/lib/transactionalMail.ts`, `server/src/controllers/passwordController.ts`, the booking-create controller, the payment-activation path (`server/src/controllers/paymentController.ts` or the shared activation helper), `server/tests/transactionalMail.test.ts`, `deploy/README.md`, `docs/API.md`.

**Interfaces:** `sendResetLink(user, link: string): void`, `sendBookingConfirmation(booking, user, cls): void`, `sendPaymentReceipt(payment, user, plan): void` — each returns immediately (fire-and-forget, errors logged by record id).

- [ ] **Step 1: Write failing tests** with the mailer's sender stubbed: with email configured, forgot-password for a known email sends one email whose link points at the public URL `/reset-password?token=`, and an unknown email sends none with the same response body; booking create sends one confirmation (class name, date, time); a payment activation sends one receipt (plan, amount, reference); with email not configured, none of these send and the forgot-password reply is today's desk message; a sender that throws or hangs does not change the HTTP status or delay the response.
- [ ] **Step 2: Run** `npm test` (TEMP pointed at the scratchpad `testtmp`) → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Email: reset links, booking confirmations and payment receipts when Brevo is set`.

### Task 2 (REPLACED by the owner's choice, see Task 2b): Gift photos

**Files:** `client/public/gifts/*.webp` (the 16 from `scratchpad/gift-photos/final2/`, plus any better replacements for guest-pass, free-week, duffel-bag, yoga-mat found in one more search), `docs/gift-photo-credits.md`, `server/src/db/rewardDefaults.ts`, the gift image validator in `server/src/controllers/rewardsController.ts`, a one-time data upgrade with the existing start-up upgrades in `server/src/db/`, `client/src/components/common/GiftImage.tsx`, the admin gift form (`client/src/components/admin/rewards/GiftCataloguePanel.tsx`), `client/src/lib/app-art-ids.json` (+ `gift.<slug>` ids for the 7), the private `client/app-art/` (7 lime illustrations + credits), tests in `server/tests/` and `e2e/`.

**Interfaces:** `GIFT_PHOTOS` (gift id → `/gifts/<slug>.webp`, one JSON list shared by server and client); `GiftImage` shows, in order: an uploaded photo, a built-in photo path, in app mode the `gift.<slug>` scene for the 7 (falling back to emoji when the scene is missing), else the emoji.

- [ ] **Step 1: Write failing tests:** the API accepts exactly the shipped `/gifts/<slug>.webp` paths and refuses any other path or URL; a new database's default gifts use the photos for the 16; the upgrade swaps a default gift's image only while it still has its default emoji; the store on the website shows `<img src="/gifts/…">` for the 16 and the emoji for the 7; in app mode the 7 show `[data-scene="gift.<slug>"]` (stand-in art) and fall back to emoji when the scene fails.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (the 7 illustrations: Storyset Rafiki style, recoloured lime, added to the private folder with credits; `npm --prefix client run check:art` ok). **Step 4: Run** → PASS (server tests, the gift e2e specs on both projects).
- [ ] **Step 5: Commit** `Gifts: real photos, app-only illustrations for the rest` (never `client/app-art/`).

### Task 2b: AI gift pictures, ready for the owner's images

Owner, 2026-11-21: "can we generate the the gift pic from ai, it will more related and custmisable?" → picked "AI, I generate with your prompts" and "Yes, PulseFit logo" (on the T-shirt, hoodie, tank top, cap, mug, stickers and keychain; no other brand's logo anywhere). The owner generates the images in their own AI tool; this task builds everything around them. The website and the app both show the pictures (no Storyset art involved; no app-only illustrations).

**Files:** `client/src/data/gift-pictures.json` (gift id → `/gifts/<slug>.webp`, starts as `{}`), `client/public/gifts/` (filled later), the gift image validator in `server/src/controllers/rewardsController.ts` (accepts exactly the paths in that JSON), a start-up data upgrade that gives a default gift its picture only while it still has its default emoji, `client/src/components/common/GiftImage.tsx` (path → `<img>`), the admin gift form (`GiftCataloguePanel.tsx`: keeps a built-in picture on edit and can pick one), `docs/gift-pictures/prompts.md` (24 prompts + how-to), `docs/gift-pictures/pulsefit-logo.png` (rendered from the app's own logo markup with Playwright, to attach in the AI tool), `client/scripts/add-gift-pictures.mjs` + `npm run gift:add` (reads images from the git-ignored `gift-pictures-incoming/` folder at the repo root, named `<slug>.png|jpg|webp`, cuts each out with the rembg tool in the session scratchpad when available, places it on the shared white 512×512 tile with `to-tile.cjs` logic copied into the script, writes `client/public/gifts/<slug>.webp`, updates the JSON), `.gitignore` (`gift-pictures-incoming/`), tests.

**Prompt pack rules:** one shared style block (studio product photo, pure white background, soft even light from the front-left, three-quarter view, the item alone and whole, centred, no people, no hands, no text except the PulseFit logo where named, no other brands) plus one line per gift from `server/src/db/rewardDefaults.ts` (names and descriptions); branded items describe the logo placement and say to attach `pulsefit-logo.png`; services get object stand-ins (coach's clipboard and stopwatch; a desk calendar without a year; two blank membership cards).

- [ ] **Step 1: Write failing tests:** the API accepts only the JSON's paths; with an empty JSON every gift keeps its emoji; adding one picture to the JSON shows `<img src="/gifts/<slug>.webp">` on the website store and in the app; the upgrade swaps only gifts still on their default emoji; `gift:add` on a fixture image writes a 512×512 WebP and a JSON entry.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (server tests, gift e2e specs on both projects).
- [ ] **Step 5: Commit** `Gifts: AI picture support and prompt pack (pictures to come)`.

### Task 4: Social icons on by default

Owner, 2026-11-21: "for social media icon build with default with related sical media homepage url for now". This overrides the contact-details design's anti-goal about guessed links, for now.

**Files:** `server/src/lib/gymContact.ts` (defaults: `https://www.instagram.com/`, `https://www.facebook.com/`, `https://www.youtube.com/`, `https://x.com/`, also for existing data whose fields are empty), the link validator (accept each network's home page too), the admin panel hint ("Shows the network's home page until you enter your page; clear it to hide the icon"), tests (`server/tests/gymContact.test.ts`, `e2e/gym-contact.spec.ts`, any test that expected no icons by default).

- [ ] **Step 1: Write failing tests:** a fresh and an upgraded database serve the four home-page links; the website footer, the app drawer row and Visit us show four icons by default; an admin can still clear a link to hide its icon; a real page link still saves.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (both projects).
- [ ] **Step 5: Commit** `Social icons on by default, linking to each network's home page`.

### Task 5: Page cartoons inside the sections

Owner, 2026-11-21: "try to fir cartoon animantion in middle or together the section insted of just put into above, it will look good." The page scene moves from the strip above every page (`client/src/components/app/PageScene.tsx`, rendered by `client/src/App.tsx`) into a fitting section of each page, app mode only (the website unchanged).

**Files:** `client/src/App.tsx` (stop rendering the strip), `client/src/components/app/PageScene.tsx` (becomes a slot component, e.g. `<PageScene tab="…" placement="beside-heading" | "in-card" | "between-sections" />`, rendering nothing outside app mode), each page's component (one placement each; a table of page → section → placement in the report), `client/src/index.css`, `e2e/app-art-pages.spec.ts`.

**Placement rules:** beside the page's heading or intro text on wide-enough rows, inside a card that matches the subject (Offers: the joining-gifts card; Rewards: the points card; Timetable: beside the calendar heading; Visit us: beside the address; admin and coach pages: beside the page heading), or between two sections; never over text or buttons; the page's `h1` (or first button) still ends at y ≤ 738 on a 390×800 phone; one scene per screen area; hidden on short screens as now.

- [ ] **Step 1: Write failing tests:** every page still shows `[data-scene="page.<tab>"]` in app mode, now inside `#main`'s page content (not a sibling strip), positioned within or beside its section (bounding box overlaps the section's box); the first-screen check passes; the website shows none.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** page by page. **Step 4: Run** → PASS (both projects).
- [ ] **Step 5: Commit** `Android app art: page cartoons inside their sections`.

### Task 6: Male characters in the art (private folder)

Owner, 2026-11-21: "the cartoon charecter shold be make oriented" — read as "male oriented" (controller ruling: 'k' sits next to 'l'). Every scene with a single person shows a man; group scenes keep at least one man in front. Same lime Storyset Rafiki style (Storyset usually offers each scene with different people); D (LottieFiles) scenes with a person likewise prefer a male character. Only `client/app-art/` changes (git-ignored); re-run `npm --prefix client run check:art` and re-shoot `client/app-art/sheets/all.png`.

### Task 3: Release 2.5.0 prep (no publishing)

**Files:** version fields in `package.json`, `client/package.json`, `server/package.json`; `client/android/app/build.gradle` (`versionCode 3`, `versionName "1.2.0"`); whatever advertises the Android app's version (`server/src/lib/androidApp.ts`); `CHANGELOG.md` (move [Unreleased] under `## [2.5.0] - unreleased`); `docs/releases/2.5.0.md` (plain-language notes for members and staff).

- [ ] **Step 1:** Read how 2.4.0 / APK 1.1.0 were prepared (git history of `CHANGELOG.md` and `client/android/app/build.gradle`, `deploy/README.md`) and follow the same steps, stopping before anything that builds a release APK, tags, uploads or deploys.
- [ ] **Step 2:** Make the version and notes changes; run `npm run typecheck`, `npm test`, the app-update and android-banner e2e specs → PASS.
- [ ] **Step 3: Commit** `Release prep: 2.5.0 and Android app 1.2.0 (not published)`.
