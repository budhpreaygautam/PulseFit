# App cartoons (every page, every action) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Android app only, show an animated scene on every page, an animated result for every action, and animated loading, empty, error, offline, 404 and launch states, using Storyset (F) and LottieFiles (D) art kept out of GitHub and the website.

**Architecture:** One committed contract (`client/src/lib/appArt.ts` plus the id list `client/src/lib/app-art-ids.json`) names every scene and maps pages, action kinds and states to scene ids. The art lives in a git-ignored folder `client/app-art/` exposing the module `@app-art`; Vite aliases `@app-art` to it only for the app build (`PULSEFIT_APP_ART=1`, set by `mobile-sync.mjs`), and to a committed stub everywhere else. One component, `AppArt`, renders any scene (inline SVG with CSS loops, or Lottie via lottie-web's light build loaded through `@app-art`), only in app mode, paused off screen, in the background and under a dialog, and still under reduced motion. Three hook points use it: `App.tsx` (page scenes), `ToastContext` plus five result panels (actions), and the shared `States` components plus launch, 404, offline and pull to refresh (states).

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Capacitor 8 Android, lottie-web 5.12.2 (`lottie-web/build/player/lottie_light`), Playwright e2e, `node --test` for the art checker.

**Spec:** `docs/superpowers/specs/2026-11-20-app-cartoons-design.md` (approved by the owner on 2026-11-20).

## Global Constraints

- App only: when `isAppMode` is false nothing renders, and the website's build contains no art and no lottie-web.
- Art files are never committed: `client/app-art/` is git-ignored; the owner keeps a private backup.
- The release build (`npm run mobile:release`) refuses to run when `client/app-art/` is missing or fails the checker, and refuses an APK built with the stand-ins.
- Animate transform and opacity only; no `filter`, no `backdrop-filter`; one scene per screen area.
- Scenes are decorative: `aria-hidden="true"`, `pointer-events: none`; the words still say everything.
- Reduced motion: every scene shows a still frame, nothing runs.
- A result animation plays once, for at most 1500 ms, never blocks a tap, never delays the next step.
- Page scenes never push the page's `h1` (or its first button) below y = 738 (800 − 62 tab bar) on a 390×800 phone.
- F: Storyset Rafiki style, accent `rgb(64,123,255)` → `#84cc16`, room backgrounds removed, CSS loops, ideally ≤ 80 KB per scene.
- D: free LottieFiles animations under the Lottie Simple License only (no marketplace items or paid-pack samples), no embedded images, no expressions (lottie_light cannot run them), ideally ≤ 150 KB.
- Credits: "Illustrations by Storyset" linked to https://storyset.com, every animation's creator and source, and the Lottie Simple License text, in a Credits part of the app's Policies & terms page.
- Nothing is fetched from Storyset, LottieFiles or a CDN at run time.
- Scrolling on the owner's phone: today Home is at 0.7% janky frames (`dumpsys gfxinfo`, `scratchpad/measure-scroll.ps1`); the bar is ≤ 2% on every measured page.
- Test-only switches exist only when `import.meta.env.MODE === 'e2e'` (the release script already refuses e2e switches in the APK).
- Commit locally after each task; never commit `client/app-art/`; never push.

## Review Focus

1. **A scene that fails to load** (missing in the art folder, or its chunk fails offline): the page, toast or state shows exactly as without art, no error, no empty box. Test in Task 2.
2. **Several toasts at once** (fast repeated actions): only the newest toast's scene plays; older ones show their still. Test in Task 4.
3. **Short or landscape screens** (keyboard open, 800×390): the page scene hides below 560 px of height so content keeps its room. Test in Task 3.
4. **A dialog or the drawer over a page:** the page's scene pauses while covered and resumes after. Test in Task 2.
5. **The app returning from the background:** scenes resume where they paused; a once-only moment does not replay. Test in Task 2.

## Scene table (the mapping the design asks for; ids are the contract)

Pages (`page.<tab>`; F unless marked D):

| tab | subject | | tab | subject |
|---|---|---|---|---|
| home | woman lifting dumbbells (have: `dumbbell-exercise`) | | member-dashboard | progress / fitness tracker |
| workout | barbell lift | | my-bookings | calendar with a booked check |
| zumba | **D** lively dancer | | workout-logger | workout notes / checklist |
| guide | healthy food / diet plan | | rewards | winners with trophy (have: `winners`) |
| schedule | calendar / timetable | | pass | QR code on a phone |
| pricing | membership card / pricing plans | | profile | personal settings / profile |
| trainers | personal trainer | | trainer-dashboard | coach with clipboard |
| exercise-library | exercising / workout app | | admin-dashboard | dashboard / analytics |
| contact | contact us / chat | | admin-members | team / people list |
| reset-password | forgot password | | admin-id-cards | ID card |
| payment-status | online payment | | admin-scanner | QR code scanning |
| privacy | privacy policy (shield) | | admin-classes | team schedule |
| terms | terms and conditions | | admin-plans | gift card / pricing |
| refunds | refund / money back | | admin-trials | customer contacts / leads |
| offers | gift box (have: `gift`) | | visit | location / map |
| policies | documents / agreement | | | |

Moments (`moment.<kind>`; D unless marked F): `booked` calendar confirmed · `cancelled` calendar crossed out · `checkedIn` yay jump (have: `yay-jump`) · `clockedIn` **F** lifting · `clockedOut` relaxing after a workout · `workoutLogged` checklist done · `saved` success check · `paid` payment success · `giftClaimed` **F** gift opening (have) · `giftCollected` **F** gift handed over · `milestone` **F** winners trophy (have) · `shared` paper plane · `deleted` trash bin · `signedIn` waving hello · `signedUp` welcome confetti · `signedOut` waving bye · `frozen` snowflake / pause · `failed` oops · `info` light bulb.

States (`state.<name>`): `loading` **D** ball skipping rope (have: `rope-skipping`) · `empty1` **D** cat stretching (have) · `empty2` **F** woman stretching (have) · `empty3` **D** empty box · `error` same file as `moment.failed` · `offline` **D** no connection · `launch` **F** lifting (have) · `notFound` **F** 404 astronaut (have).

"have" = already downloaded and rigged for the samples (`scratchpad/anim-raw`, `scratchpad/cartoons/gen-f.cjs`, `gen-d.cjs`). One file may serve several ids.

---

### Task 1: The art contract, the private folder switch and the checker

**Files:**
- Create: `client/src/lib/app-art-ids.json`, `client/src/lib/appArt.ts`, `client/src/app-art-stub/index.ts`, `client/scripts/check-app-art.mjs`, `client/scripts/check-app-art.test.mjs`
- Modify: `client/vite.config.ts`, `client/tsconfig.json` (`"resolveJsonModule": true` if missing, `"paths": { "@app-art": ["./src/app-art-stub/index.ts"] }`), `client/scripts/mobile-sync.mjs`, `client/scripts/android-release.mjs`, `.gitignore` (`client/app-art/`), `client/package.json` (`"check:art": "node scripts/check-app-art.mjs"`, `"test:art": "node --test scripts/check-app-art.test.mjs"`)

**Interfaces:**
- Produces (`app-art-ids.json`): `{ "pages": [31 tabs], "moments": [19 kinds], "states": [8 names] }`, in the order of the scene table.
- Produces (`client/src/lib/appArt.ts`):
  - `type MomentKind = 'booked' | 'cancelled' | 'checkedIn' | 'clockedIn' | 'clockedOut' | 'workoutLogged' | 'saved' | 'paid' | 'giftClaimed' | 'giftCollected' | 'milestone' | 'shared' | 'deleted' | 'signedIn' | 'signedUp' | 'signedOut' | 'frozen' | 'failed' | 'info'`
  - `type StateName = 'loading' | 'empty1' | 'empty2' | 'empty3' | 'error' | 'offline' | 'launch' | 'notFound'`
  - ``type SceneId = `page.${string}` | `moment.${MomentKind}` | `state.${StateName}` ``
  - `type Scene = { kind: 'svg'; svg: string; css: string } | { kind: 'lottie'; data: object; stillFrame: number }` (an svg scene's still is its CSS paused at 0 s)
  - `interface ArtCredit { ids: SceneId[]; title: string; creator: string; source: string; licence: 'Storyset free licence' | 'Lottie Simple License' }`
  - `const PAGE_TABS: readonly string[]`, `const ALL_SCENE_IDS: readonly SceneId[]` (both from the JSON)
  - `function emptyScene(key: string): SceneId` → one of `state.empty1..3`, stable per key (string hash mod 3)
  - `function momentFor(type: 'success' | 'error' | 'info' | 'warning', kind?: MomentKind): MomentKind` → `kind ?? (type === 'error' ? 'failed' : type === 'success' ? 'saved' : 'info')`
- Produces (module `@app-art`, implemented by the stub and by the private `client/app-art/index.js`):
  - `const marker: 'pulsefit-app-art' | 'pulsefit-app-art-stub'` (AppArt writes it to `data-art`, so it survives minification)
  - `function loadScene(id: SceneId): Promise<Scene | null>`
  - `function loadLottie(): Promise<{ loadAnimation(params: object): { goToAndStop(f: number, isFrame: boolean): void; play(): void; pause(): void; destroy(): void } }>` (real: `import('lottie-web/build/player/lottie_light')`)
  - `const credits: ArtCredit[]`

- [ ] **Step 1: Write the failing checker tests** in `client/scripts/check-app-art.test.mjs` (node:test, temp folders written by the test):
  - `passes a complete folder` → `checkArt(dir)` returns `{ ok: true, missing: [], problems: [] }` for a fixture covering every id in `app-art-ids.json`.
  - `reports a missing scene` → `missing` includes `'page.home'`.
  - `refuses unsafe SVG` → an svg containing `<script`, an `on…=` attribute, `<foreignObject` or `href="http` lands in `problems`.
  - `refuses Lottie with images or expressions` → an asset with `p`, or any `x` key, lands in `problems`.
  - `refuses a missing credit` → an id with no `credits` entry lands in `problems`.
  - `refuses oversize files` → svg + css > 120 000 bytes or Lottie JSON > 250 000 bytes lands in `problems`.
  - `refuses a stand-in marker` → `marker !== 'pulsefit-app-art'` lands in `problems`.
- [ ] **Step 2: Run** `npm --prefix client run test:art` → FAIL (`checkArt` is not defined).
- [ ] **Step 3: Implement** `checkArt(dir: string): Promise<{ ok: boolean; missing: string[]; problems: string[] }>` (imports `dir/index.js` with `pathToFileURL`, loads every id) and its CLI (exit 1 with a readable list); the JSON, types and helpers; the stub (`marker = 'pulsefit-app-art-stub'`; `loadScene` returns `{ kind: 'svg', svg: '<svg viewBox="0 0 10 10" data-stand-in><circle cx="5" cy="5" r="4"/></svg>', css: '' }` for ids in `ALL_SCENE_IDS`, `null` otherwise, and in e2e mode rejects when `window.__appArtFail` is true; `loadLottie` rejects; `credits` = one stand-in per licence); the Vite alias (`'@app-art'` → `client/app-art` when `process.env.PULSEFIT_APP_ART === '1'`, else `src/app-art-stub`); tsconfig; `.gitignore`.
- [ ] **Step 4: Wire the switch.** `mobile-sync.mjs`: if `client/app-art/index.js` exists, run `checkArt`; when ok, add `PULSEFIT_APP_ART=1` to `env` and log "with the app's art"; otherwise log the problems and "with stand-ins" and continue (debug builds). `android-release.mjs`: before building, `fail()` unless `checkArt` is ok; after building, `fail()` if `dist-mobile` lacks `pulsefit-app-art` or contains `pulsefit-app-art-stub`.
- [ ] **Step 5: Run** `npm --prefix client run test:art` → PASS; `npm run typecheck` → exit 0; `npm --prefix client run build`, then `rg -l "lottie|storyset" client/dist` → no match.
- [ ] **Step 6: Commit** `Android app art: contract, private art switch and checker` (`git status` shows nothing under `client/app-art`).

### Task 2: `AppArt`, the one scene component

**Files:**
- Create: `client/src/components/app/AppArt.tsx`, `e2e/app-art.spec.ts`
- Modify: `client/package.json` + lock (`lottie-web@5.12.2`), `client/src/index.css`, `client/src/pages/NotFoundPage.tsx` (its first user: `<AppArt scene="state.notFound" size="state" />`)

**Interfaces:**
- Consumes: Task 1's `SceneId`, `Scene`, `@app-art`.
- Produces: `AppArt: React.FC<{ scene: SceneId; size: 'page' | 'moment' | 'state' | 'launch'; once?: boolean; playing?: boolean; className?: string }>`. Renders `null` unless `isAppMode`; otherwise `<div class="app-art app-art-<size>" data-scene={scene} data-art={marker} data-state="loading|playing|paused|still|missing" aria-hidden="true">`. Heights: page 112 px, moment 56 px, state 120 px, launch 160 px; `missing` collapses to 0. `once` plays 1500 ms then holds its still and never replays. `playing={false}` holds the still. An svg scene's CSS is scoped under `[data-scene="<id>"]` when injected.

- [ ] **Step 1: Write the failing tests** in `e2e/app-art.spec.ts` (mobile project, `useAppMode`, stand-in art, on `/no-such-page`):
  - `renders the scene in the app and nothing on the website` → app: `[data-scene="state.notFound"]` visible, `aria-hidden="true"`; website: count 0.
  - `holds a still under reduced motion` → `emulateMedia({ reducedMotion: 'reduce' })` → `data-state="still"`, and no running animation inside it.
  - `pauses off screen, under a dialog and in the background, and resumes` → scrolled out → `paused`; back → `playing`; menu drawer open → `paused`; closed → `playing`; `document.hidden` true + `visibilitychange` → `paused`; false → `playing`.
  - `a scene that cannot load leaves no trace` → `window.__appArtFail = true` before load → `data-state="missing"`, height 0, no console error.
  - `a once-only scene keeps its still after the app comes back` → the toast path is Task 4; here `/no-such-page?once=1` (e2e mode only) → after 1600 ms `still`; hidden and shown again → still `still`.
- [ ] **Step 2: Run** `npx playwright test e2e/app-art.spec.ts --project mobile` → FAIL.
- [ ] **Step 3: Implement** `AppArt`: dynamic `loadScene`; svg via `innerHTML` of the trusted scene plus a scoped `<style>`; Lottie via `loadLottie()` → `loadAnimation({ container, renderer: 'svg', loop: !once, autoplay: false, animationData })`, `goToAndStop(stillFrame, true)` for stills, `destroy()` on unmount; one `IntersectionObserver`; `visibilitychange`; covered-by-dialog = a `[role="dialog"][aria-modal="true"]` exists and does not contain the scene, re-checked on `focusin` and every 500 ms only while one is open. CSS: `.app-art { pointer-events: none; contain: layout paint; }`, the heights, `.app-art[data-state="paused"] *, .app-art[data-state="still"] * { animation-play-state: paused !important }`.
- [ ] **Step 4: Run** the spec → PASS; `npm run typecheck` → 0.
- [ ] **Step 5: Commit** `Android app art: the AppArt scene component`.

### Task 3: A scene on every page

**Files:**
- Create: `client/src/components/app/PageScene.tsx`, `e2e/app-art-pages.spec.ts`
- Modify: `client/src/App.tsx` (inside `<main>`, before the keyed `<Suspense>`: `{isAppMode && <PageScene tab={tab} />}`), `client/src/index.css`

**Interfaces:**
- Consumes: `AppArt`, `PAGE_TABS`.
- Produces: `PageScene: React.FC<{ tab: string }>` → a 112 px strip, scene centred, `data-page-scene={tab}`, hidden by CSS under `(max-height: 559px)`; `COMPACT_TABS` (88 px) for any page that fails the first-screen check.

- [ ] **Step 1: Write the failing tests** (import `client/src/routes` and `client/src/lib/app-art-ids.json` from the spec): `pages` equals `ROUTES.map(r => r.tab)`; for every tab the persona can open (guest, member, trainer, admin via `signInAs`), app mode, 390×800: `[data-scene="page.<tab>"]` visible, and the page's `h1` (else its first `button`) ends at y ≤ 738; at 800×390 the strip is hidden; website: no `[data-page-scene]`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `PageScene` and the App.tsx line; put a tab in `COMPACT_TABS` only if it fails the check; never move page content.
- [ ] **Step 4: Run** → PASS (both projects).
- [ ] **Step 5: Commit** `Android app art: a scene on every page`.

### Task 4: An animated result for every action

**Files:**
- Modify: `client/src/context/ToastContext.tsx`; every file calling `showToast` (31 files, about 95 calls); the five result panels: `client/src/pages/admin/QuickCheckInScanner.tsx` (scan result), `client/src/pages/public/PaymentStatusPage.tsx`, `client/src/pages/public/FreeTrialModal.tsx` (pass issued), `client/src/pages/public/ResetPasswordPage.tsx` (done), `client/src/components/member/useGiftCelebration.ts` (its celebration)
- Test: `e2e/app-art-moments.spec.ts`

**Interfaces:**
- Consumes: `AppArt`, `momentFor`, `MomentKind`.
- Produces: `showToast(message: string, type?: ToastType, title?: string, moment?: MomentKind)`; `Toast` gains `moment: MomentKind` (from `momentFor`); `ToastProvider` passes `isNewest` to each `ToastCard`; in app mode the card shows `<AppArt scene={`moment.${t.moment}`} size="moment" once playing={isNewest} />` in place of its icon; on the website the icon stays.

- [ ] **Step 1: Write the failing tests:** a member books a class → newest toast has `[data-scene="moment.booked"]`; cancels it → `moment.cancelled`; booking API routed to 500 → `moment.failed`; claims a gift → `moment.giftClaimed`; staff scan a member at Front-desk check-in → the result panel has `moment.checkedIn`; two toasts in a row → after 1600 ms the older is `still` and the newest is `still` after playing once; website toasts keep their icon and have no `[data-scene]`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the toast change, then give every call site its kind by what the action did: booked / cancelled = a class booking made or cancelled; checkedIn = a desk scan admitted someone; clockedIn / clockedOut = a floor session; workoutLogged; saved = any edit, create or setting saved; paid; giftClaimed = a member claims; giftCollected = staff hand a gift over; milestone; shared = copied, shared or sent (referral, note, enquiry); deleted; signedIn; signedUp; signedOut; frozen = a freeze set or ended; failed = error toasts (the default); info = anything else. Add the scene to the five result panels with the matching kind.
- [ ] **Step 4: Run** → PASS (both projects); `rg -n "showToast\(" client/src` shows a kind on every success and info call.
- [ ] **Step 5: Commit** `Android app art: an animated result for every action`.

### Task 5: Loading, empty, error, offline, launch and pull to refresh

**Files:**
- Modify: `client/src/components/common/States.tsx`; `client/src/components/app/AppLaunch.tsx` (`state.launch`, within its existing 850 ms); `client/src/components/app/PullToRefresh.tsx` (spinner → `state.loading` at 40 px); the app's offline / connection notice (find it in `App.tsx` / `ConfigContext.tsx`) → `state.offline`; every empty message written inline instead of with `EmptyState` (`rg "No .* yet|Nothing (here|yet)" client/src` outside `States.tsx`) gets `<AppArt scene={emptyScene(<its text>)} size="state" />` beside it
- Test: `e2e/app-art-states.spec.ts`

**Interfaces:**
- Consumes: `AppArt`, `emptyScene`.
- Produces: `EmptyState` gains `scene?: SceneId` (default `emptyScene(title)`); `LoadingState` and `ErrorState` show `state.loading` / `state.error` in app mode; website markup unchanged.

- [ ] **Step 1: Write the failing tests:** a new member's My bookings → `[data-scene^="state.empty"]`; a page whose API is delayed 2 s → `state.loading`; an API error → `state.error`; `context.setOffline(true)` then a refresh → `state.offline`; launch → `state.launch` inside `.app-launch`; a pull at the top → the spinner holds `state.loading`; website: none of these.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (both projects).
- [ ] **Step 5: Commit** `Android app art: loading, empty, error, offline, launch and refresh`.

### Task 6: Credits on Policies & terms

**Files:**
- Modify: `client/src/pages/public/PoliciesPage.tsx` (a "Credits" part, in the jump list), `e2e/app-pages.spec.ts`

**Interfaces:**
- Consumes: `credits` from `@app-art`.
- Produces: a Credits section: "Illustrations by Storyset" linked to https://storyset.com when any Storyset credit exists; each credit's title, creator and source link; the Lottie Simple License text when any Lottie credit exists.

- [ ] **Step 1: Write the failing test:** `/policies` in app mode has a "Credits" jump link and section with "Illustrations by Storyset" linked to `https://storyset.com` and the Lottie Simple License text (from the stub's two stand-in credits).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Android app art: credits on Policies & terms`.

### Task 7: The art itself (private folder; runs alongside Tasks 2–6 once Task 1 is committed)

**Files (all git-ignored):** `client/app-art/index.js`, `client/app-art/scenes/*.js`, `client/app-art/raw/**`, `client/app-art/tools/**` (generators, from `scratchpad/cartoons/gen-f.cjs` and `gen-d.cjs`), `client/app-art/LICENCES.md`, `client/app-art/contact-sheet.html`

**Interfaces:**
- Consumes: Task 1's `@app-art` contract and `app-art-ids.json`; the scene table.
- Produces: a folder that passes `npm --prefix client run check:art`, and a contact sheet (every scene, light and dark, playing) for the owner.

- [ ] **Step 1:** For each row of the scene table, source the file (F: storyset.com Rafiki SVG, without login; D: a lottiefiles.com free animation page showing "Free to use under the Lottie Simple License"), save it under `raw/`, and record its credit.
- [ ] **Step 2:** Build each scene module with the generators: F recoloured to `#84cc16`, background removed, rigged with looping CSS for the subject's action, dark-theme overrides for near-black colours; D checked for images, expressions and size, with a `stillFrame`.
- [ ] **Step 3:** Run `npm --prefix client run check:art` → `ok: true`.
- [ ] **Step 4:** Build `contact-sheet.html` (Pages / Moments / States, light and dark), screenshot it, and fix any scene that is hard to read on dark, off-brand, cropped, or shows a logo or words.

### Task 8: On the phone, measured, then committed

- [ ] **Step 1:** `npm run mobile:sync` (the log says "with the app's art"), then `npm run mobile:run -- --target <phone>`.
- [ ] **Step 2:** Measure with `scratchpad/measure-scroll.ps1` on Home, and with the same swipes on Timetable, Offers & gifts and My bookings: each ≤ 2% janky frames; screenshots of a page scene, a toast moment, an empty state and the 404.
- [ ] **Step 3:** Full checks: `npm run typecheck`; `npm test` (point `$env:TEMP` at a private folder if Windows locks temp files); `npx playwright test --project mobile`; `npx playwright test --project desktop` → all pass.
- [ ] **Step 4:** `npm --prefix client run build`, then `rg -l "lottie|pulsefit-app-art\"" client/dist` → no match (the website carries only the stub).
- [ ] **Step 5:** Show the owner the contact sheet and the phone; update `CHANGELOG.md` [Unreleased]; commit locally; `git status` shows nothing under `client/app-art`.
