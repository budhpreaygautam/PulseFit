# Mobile App Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside the Android/iOS app, members get the handoff's phone app (tab bar Home · Classes · Pass · Train · Me, five screens on real data, Rewards on Home and in Me), guests get a welcome screen, and everything animates smoothly unless the phone asks for reduced motion. The website and staff layouts do not change.

**Architecture:** One switch, `isAppMode` (`isNativeApp`, or a test-only flag that only an e2e build honours), picks a shell in `App.tsx`: the member `AppShell` (tab bar, title bar for sub-screens, no website chrome), the guest shell/welcome, or today's layout. The five tab routes render new app screens when opened without a query; with one (a deep link or "full" link) they render today's website page inside the shell, so no feature is lost. App styling is a small set of `--app-*` tokens and `.app-*` classes in `index.css`; motion is CSS plus View Transitions. The server only adds two read-only numbers to `GET /auth/me`.

**Tech Stack:** React 18 + Vite 6 + Tailwind 3, lucide-react, Capacitor 8 (`client/`); Express + TypeScript, Vitest + supertest (`server/`); Playwright (`desktop` and Pixel 7 `mobile` projects).

**Spec:** `docs/superpowers/specs/2026-11-20-mobile-app-look-design.md` (approved). Visual source of truth: `docs/design/pulsefit-mobile-handoff/` (`README.md` for every pixel value this plan does not state, `screenshots/1a-member-home-{light,dark}.png`, `PulseFit Mobile.dc.html` as a reference only; never ship or run it).

**Prerequisite:** the rewards project (`docs/superpowers/plans/2026-11-19-rewards-offers.md`, built in `.claude/worktrees/rewards`) is merged into `main` and its suites pass. This plan uses its real names, all present in that worktree (checked 2026-11-20): route `rewards` (`/rewards`, `access: ['member']`), `RewardsPage` (`pages/member/RewardsPage.tsx`, which owns claiming, choosing a size and points history), `GET /api/rewards/me` → `api.getMyRewards()` → `MyRewards { balance, visits, streak, milestones[{ id, type, threshold, gift_name, reached }], earning, claims: GiftClaim[] (newest first), referral_code }`, `GiftClaim { id, gift_id, gift_name, status: ClaimStatus, pickup_code, source, sizes?, … }` with `ClaimStatus = 'needs_size' | 'waiting' | 'ready' | 'handed_over' | 'cancelled'`, `api.getStoreGifts()` → `StoreGift { id, name, image, points_cost, in_stock, … }`, `GiftImage` (`components/common/GiftImage.tsx`), `useGiftCelebration(userId, claims)` (`components/member/useGiftCelebration.ts`), `shareText(text)` (`lib/native.ts`), `longestRun(days)` (`server/src/lib/milestones.ts`), `activityDays(userId)` (`server/src/lib/streak.ts`), admin `POST /api/members/:id/points { points, note }`, and the e2e helpers `freshMember(request, label)` → `{ id, email, token, adminToken }` and `auth(token)`. Find code by symbol, never by line number.

## Global Constraints

- **Tabs:** Home · Classes · Pass · Train · Me, routes `member-dashboard`, `schedule`, `pass` (new), `workout-logger`, `profile`. Rewards stays a card on Home and a section in Me; the five tabs stay as designed.
- **Scope:** member app (handoff 1a) only. Coaches and admins who sign in to the app keep today's layout (Navbar, Footer). 1b–1d are a later round.
- **Fidelity is high:** colours, type, spacing, shadows and interactions are final; recreate them with the codebase's tokens. Values not stated in this plan come from the handoff README; where the handoff markup and README differ, the markup (what the screenshots show) wins. Phone bezel, status bar and home indicator are not built.
- **Tokens:** the README's "Design Tokens" (dark and light), mapped to CSS variables in Task 1. Accents lime `#84cc16` / glow `#a3e635`, amber `#f59e0b`, crimson `#ef4444`, cyan `#06b6d4`, pink `#ec4899`; lime button `linear-gradient(135deg, #a3e635, #84cc16)`, text `#090c10`, glow `0 0 25px -5px rgba(132,204,22,.45)`. Page titles Outfit 900 26px; section titles Outfit 800 15–16px; body Inter 12–13px; captions 10–11px (labels 700).
- **Accessibility over fidelity, text only:** small accent *text* on the light theme uses the codebase's light shades: lime `#3f6212` (as `index.css` already maps light lime text; the handoff's `#4d7c0f` is 3.9:1 on the inset), amber `#92400e`, cyan `#155e75`, crimson `#be123c`, pink `#9d174d`. Fills (ring, bars, switch, tints, pill backgrounds, the lime gradient) keep the handoff accents. Text on a neutral `var(--gym-700)` fill uses `var(--app-tx)`, never `#090c10`. Tab and button targets are at least 44×44.
- **Icons (lucide-react, nearest to the mock's FontAwesome):** house→`House`, calendar→`Calendar`, qrcode→`QrCode`, dumbbell/weight-hanging→`Dumbbell`, user→`User`, fire→`Flame`, snowflake→`Snowflake`, file-invoice→`FileText`, download→`Download`, circle-check→`CircleCheck`, plus→`Plus`, id-card→`IdCard`, message→`MessageSquare`, arrow-right→`ArrowRight`, bolt→`Zap`, music→`Music2`.
- **Streak card:** centre number `streak_days` (as on the website dashboard). "**N of 5 sessions this week**" counts active days this week (Mon–Sun, gym time zone) by the streak rule: staff check-in, attended class, completed floor session, or a workout logged on its own day. The goal is a fixed **5**; the ring fills to `min(N, 5) / 5`. "Sundays don't break it" is shown as designed. "**N more days to beat your best**" uses the member's longest streak and is left out when the longest is unknown or already beaten (longest ≤ current).
- **Day chips** are the days the gym is open, from `config.gym.hours.closedWeekdays` (GET /api/config, numbered as `Date.getUTCDay()`), never a fixed Mon–Fri.
- **Welcome:** slides show on the first app launch only (flag kept on the phone); afterwards a signed-out app, including right after Sign out, opens on the last panel without slides. "Explore first" opens the public home in a guest shell (Explore · Contact · Sign in) and is not remembered. Gated pages keep opening the sign-in dialog.
- **Animations** (app mode only, CSS or View Transitions, none under `prefers-reduced-motion: reduce`): tab switches cross-fade; sub-screens slide in from the right and back out; cards rise in with a ~40 ms stagger, max 8, on a screen's first render; the streak ring and progress bars fill from 0; numbers count up briefly; buttons and tiles press in on touch (~0.97 scale + inset shadow); confetti (existing `triggerCelebration`) when a gift is earned or a payment succeeds; shimmer placeholders while lists load. Durations 150–350 ms, ease-out (the shimmer is a 1.2 s loading loop, not a transition); nothing blocks input. Handoff control transitions: `all .2s ease`, switch knob `left .2s`, progress `.25s`.
- **View Transitions** only where the WebView supports `document.startViewTransition`; otherwise pages switch instantly.
- **Real data only:** the handoff's sample values (names, "refreshes in 0:42", "3 PRs", "+8%", "Push day · 38 min") are placeholders; show real values or leave the element out.
- **No new runtime dependencies. Website unchanged** (only app mode changes; the website e2e suite stays green), with two accepted exceptions: `robots.txt` gains `Disallow: /pass` (Task 2), and history entries carry `{ inApp: true }` state (Task 1), which nothing on the website reads. Every member feature the website has stays reachable in the app. Sign-in gating is never weakened.
- **Spec deviations — the owner confirms these before Task 2 starts:** (1) Classes shows a disabled **Full** where the spec says Waitlist, because the booking API has no waitlist; (2) Pass shows the member's fixed `qr_code_token` QR (what the desk scans today) where the spec says "real rotating QR", because `DigitalQrPassModal` does not rotate; (3) Me's Rewards section shows points, open gifts with pickup codes, the three cheapest store gifts and the referral code, while claiming a gift, choosing a size and points history stay on the Rewards page one tap away.
- **Test-only switch:** app mode in a browser needs both an e2e build (`vite build --mode e2e`) and `localStorage.pulsefit_test_app_mode = '1'`; production app mode comes only from `isNativeApp`. The release script refuses an APK that contains the switch.
- **E2E** for app mode runs on the `mobile` project at 390×800 with the switch on (`useAppMode`). Every `e2e/app-*.spec.ts` imports `expect` (and the `Page` and `APIRequestContext` types when needed) from `@playwright/test` and the rest from `./helpers`, and starts with `test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));`.
- **Release:** APK **v1.1.0**, versionCode **2**, built after the backend is deployed. iOS is not built in this release.
- **Commits** only once the owner has approved committing; no Claude or AI attribution in messages; never push.

## Review Focus

1. **Opening the app with no connection** (signed in, server unreachable): the app says "Can't reach PulseFit right now" with Try again, never an endless spinner, and lands on Home once it reconnects. Test in Task 1.
2. **Signing out while view transitions run** (Me's Sign out, a coach's Navbar Sign out in the app): the welcome panel shows with no sign-in dialog over it. Tests in Tasks 7 and 8.
3. **A notched or edge-to-edge phone:** the title bar and its Back button stay below the status bar while the page scrolls, and the tab bar sits above the home indicator. Test in Task 1.
4. **Back on a sub-screen with no earlier app page** (a reload, a deep link, the first screen after launch): Back goes Home instead of doing nothing. Test in Task 1.
5. **Staff signing in from the welcome panel:** a coach lands on today's coach dashboard with the website header, no tab bar and no download bar, and signing out returns to the panel with no dialog. Test in Task 7.

## File Structure

- `client/src/lib/appMode.ts`: `isAppMode`, `isFirstLaunch`.
- `client/src/lib/appMotion.ts`: reduced-motion check, View Transition wrapper, count-up hook.
- `client/src/components/app/tabs.ts`: tab lists, tab-root rule, nav kind (no React components, so `NavigationContext` can import it).
- `client/src/components/app/AppShell.tsx`: backdrop, status-bar strip, title bar, tab bar.
- `client/src/components/app/ui.tsx`: `StatusPill`, `ShimmerList`, `AppSwitch`.
- `client/src/components/app/rewards.ts`, `client/src/components/app/trainDraft.ts`: pure helpers.
- `client/src/pages/app/{Pass,Home,Classes,Train,Me,Welcome}Screen.tsx`: one screen each, lazy-loaded.
- Extracted for reuse (moved unchanged): `components/member/membershipNotice.ts`, `components/member/FreezeDialog.tsx`, `components/member/useShareReferral.ts`, `components/member/workoutLimits.ts`.
- E2E: `e2e/app-*.spec.ts`; server test: `server/tests/streakFacts.test.ts`.

Not built: the handoff's 1b–1d apps, a waitlist, a rotating pass token, brightness boost, tablet layouts, iOS build.

---

### Task 1: Test-only app-mode switch and the member app shell

**Files:**
- Create: `client/src/lib/appMode.ts`, `client/src/components/app/tabs.ts`, `client/src/components/app/AppShell.tsx`, `e2e/app-shell.spec.ts`
- Modify: `client/src/App.tsx` (`MainAppContent`), `client/src/context/NavigationContext.tsx` (`navigate`), `client/src/components/layout/AndroidAppBanner.tsx` (`isAndroidBrowser`), `client/src/index.css` (tokens in `:root, .dark` and `.light`; app classes after "8. Glassmorphism"), `playwright.config.ts` (`webServer.command`), `e2e/helpers.ts`, `e2e/android-banner.spec.ts` (imports the moved `offerApp`), `client/scripts/android-release.mjs` (leak check)

**Interfaces:**
- Produces (`lib/appMode.ts`): `export const isAppMode: boolean = isNativeApp || (import.meta.env.MODE === 'e2e' && storage.get('pulsefit_test_app_mode') === '1')`. The key string appears only inside that expression, so Vite's constant folding drops it from production builds.
- Produces (`components/app/tabs.ts`): `interface AppTab { tab: string; label: string; icon: React.ComponentType<{ className?: string }> }`; `MEMBER_TABS: AppTab[]` = Home `member-dashboard` `House`, Classes `schedule` `Calendar`, Train `workout-logger` `Dumbbell`, Me `profile` `User` (Task 2 inserts Pass third); `isTabRoot(tabs: AppTab[], tab: string, params: URLSearchParams): boolean` — `tab` is in `tabs` and, for `profile`, `!params.has('tab')`; for every other tab, `params.toString() === ''`.
- Produces (`NavigationContext.tsx`): `navigate` pushes `{ inApp: true }` as the history state (`pushState({ inApp: true }, '', url)`), and a replace keeps the entry's state (`replaceState(window.history.state, '', url)`), so `window.history.state?.inApp` says "an earlier entry of this app session exists".
- Produces (`components/app/AppShell.tsx`): `AppShell: React.FC<{ tabs: AppTab[]; children: React.ReactNode }>`, reading `tab`, `params`, `navigate` from `useNavigation()`:
  - `<div className="app-backdrop" aria-hidden="true" />`;
  - the status-bar strip Navbar uses (`fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] glass-bar`);
  - when `!isTabRoot(tabs, tab, params)`, a title bar `<header className="sticky top-[env(safe-area-inset-top)] z-[45] h-12 glass-bar …">` (below the strip, as Navbar's header) with a 44×44 `<button aria-label="Back">` (`ArrowLeft`) and `routeForTab(tab)?.title` in Outfit 800 15px (a `<span>`, not a heading: the page keeps its own h1). Back: `window.history.state?.inApp ? window.history.back() : navigate(tabs[0].tab, undefined, { replace: true })`;
  - the children in `<div className="app-content">`;
  - `<nav aria-label="Tabs" className="app-tabbar fixed inset-x-0 bottom-0 z-40">` of `TabLink`s; `aria-current="page"` only on the tab equal to `tab` while `isTabRoot(tabs, tab, params)`. Bar `padding: 8px 8px env(safe-area-inset-bottom)` (in place of the mock's fixed 34 px), each tab `flex: 1`, 50 px tall, icon and label per the README's "Global layout", so the bar is 58 px plus the inset.
- Produces (`index.css`), in `:root, .dark` and `.light`: `--app-card`, `--app-tx`, `--app-tx2`, `--app-tx3`, `--app-mu`, `--app-mu2`, `--app-bd`, `--app-bar` = the README's card, text ×3, muted ×2, border and bar; `--app-lime` = lime text (dark `#a3e635`, light `#3f6212`); `--app-amber-tx`, `--app-cyan-tx`, `--app-red-tx`, `--app-pink-tx` = the accent (dark) or the light shade from Global Constraints (light); `--app-sheen` = the README's glass overlay (dark `linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.02) 45%, rgba(255,255,255,0))`, light `linear-gradient(135deg, rgba(255,255,255,.7), rgba(255,255,255,.1) 60%)`); `--app-glows` = `radial-gradient(220px 220px at 15% 12%, rgba(132,204,22,A), transparent 70%), radial-gradient(260px 260px at 95% 45%, rgba(6,182,212,B), transparent 70%), radial-gradient(240px 240px at 10% 88%, rgba(236,72,153,C), transparent 70%)` with A/B/C dark `.28/.22/.18`, light `.35/.28/.2`. Bg, inset, shadows, chip and chip2 reuse `--gym-950`, `--neu-inset-bg`, `--neu-shadow-dark`, `--neu-shadow-light`, `--gym-800`, `--gym-700` (same values). Classes:
  - `.app-backdrop`: `position: fixed; inset: 0; z-index: -1; pointer-events: none; background-color: var(--gym-950); background-image: var(--app-glows)`.
  - `.app-content`: `padding-bottom: calc(58px + env(safe-area-inset-bottom))`.
  - `.app-screen` (the root of every app screen, Tasks 2–7): `padding: 8px 20px 24px` (the README's scrollable content; on the screens, not the shell, because the shell also wraps today's website pages, which have their own padding). `html:has(.app-tabbar) { scrollbar-width: none }`, `html:has(.app-tabbar)::-webkit-scrollbar { display: none }` (the README's hidden scrollbar; the page itself scrolls).
  - `.app-glass` (every handoff `var(--card)` surface): `background-color: var(--app-card); background-image: var(--app-sheen); backdrop-filter: blur(16px) saturate(160%)` (+ `-webkit-`); `box-shadow: inset 1px 1px 0 rgba(255,255,255,.14), inset 0 0 0 1px var(--app-bd), 7px 7px 16px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light)`.
  - `.app-inset`: `background-color: var(--neu-inset-bg); box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light)`.
  - `.app-lime-btn`: the lime gradient, `color: #090c10`, the lime glow, no border.
  - `.app-tabbar`: `background-color: var(--app-bar); border-top: 1px solid rgba(255,255,255,.06); backdrop-filter: blur(14px)`.
  - `.app-glass, .app-inset, .app-lime-btn, .app-tabbar a { transition: all .2s ease }`.
- Produces (`App.tsx`): `appShell: 'member' | 'starting' | 'offline' | null` = `null` unless `isAppMode`; `'offline'` while `isInitializing && isServerUnreachable`; `'starting'` while `isInitializing`; `'member'` for a member; `null` otherwise (staff, and guests until Task 7).
  - In app mode the root div drops `bg-gym-950` (the body keeps `--gym-950`, so the backdrop at z-index −1 shows) and keeps its `pt-[env(safe-area-inset-top)]`.
  - `'starting'` and `'offline'` render no Navbar, Footer, offline banner or `AppShell`; the root div, skip link, `<main>`, announcer and dialog mounts stay, and `page` is `<PageLoader />` (`'starting'`) or the existing offline `AccessPanel` (`'offline'`: `WifiOff`, title "Can't reach PulseFit right now", body "You're still signed in. We'll keep trying and open PulseFit as soon as the connection is back.", action "Try again" → `retrySessionRestore`).
  - `'member'` renders `<AppShell tabs={MEMBER_TABS}>` around the same skip link, offline banner, `<main>`, announcer and dialogs as today, without `Navbar` and `Footer`; `null` renders today's tree unchanged.
  - Home redirect: `useEffect(() => { if (appShell === 'member' && tab === 'home' && params.toString() === '') navigate('member-dashboard', undefined, { replace: true }); }, [appShell, tab, params, navigate])`, and while that condition holds `page` is `<PageLoader />`, so the landing page never paints in the member shell (at app start, after Try again, after signing in on the panel). A member opens the landing page on purpose with `navigate('home', { view: 'full' })` (Task 6).
- Produces (`AndroidAppBanner.tsx`): `const isAndroidBrowser = !isAppMode && /Android/i.test(navigator.userAgent)` (the Pixel 7 project has an Android user agent).
- Produces (`e2e/helpers.ts`): `useAppMode(page: Page, options: { theme?: 'light' | 'dark' } = {}): Promise<void>` — `setViewportSize({ width: 390, height: 800 })`, then an init script setting `pulsefit_test_app_mode = '1'` and, when given, `pulsefit_theme`. Call before `page.goto`. `tabBar = (page: Page) => page.getByRole('navigation', { name: 'Tabs' })`. `offerApp(page)` and its `APP` moved unchanged from `android-banner.spec.ts`. `declare global { interface Window { __sawLanding?: boolean } }`.
- Produces (`playwright.config.ts`): `webServer.command` = `npm run build --prefix client -- --mode e2e && cd server && npx tsx src/index.ts`.

- [ ] **Step 1: Write the failing test** `e2e/app-shell.spec.ts`

```ts
const LANDING_H1 = /YOUR GYM FOR/;

test('a member opening the app lands on Home with the tab bar, no website chrome and no landing-page frame', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.__sawLanding = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll('h1')].some(h => /YOUR GYM FOR/.test(h.textContent ?? ''))) window.__sawLanding = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabBar(page).getByRole('link')).toHaveText(['Home', 'Classes', 'Train', 'Me']);
  await expect(tabBar(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await expect(page.getByText('Demo accounts:')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
  expect(await page.evaluate(() => window.__sawLanding)).toBe(false);
});

test('each tab opens its page, follows aria-current and is at least 44×44', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  for (const [name, url] of [['Classes', /\/schedule$/], ['Train', /\/log-workout$/], ['Me', /\/profile$/], ['Home', /\/dashboard$/]] as const) {
    const link = tabBar(page).getByRole('link', { name });
    await link.click();
    await expect(page).toHaveURL(url);
    await expect(link).toHaveAttribute('aria-current', 'page');
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('the tab bar is 58 px at the bottom of the screen and the page scrolls clear of it', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  const bar = (await tabBar(page).boundingBox())!;
  expect(bar.height).toBe(58);
  expect(bar.y + bar.height).toBe(800);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const main = (await page.locator('main').boundingBox())!;
  expect(main.y + main.height).toBeLessThanOrEqual(bar.y + 0.5);
});

test('Back on a sub-screen goes back in the app, and with no earlier app page goes Home', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile?tab=membership');
  await expect(tabBar(page).getByRole('link', { name: 'Me' })).not.toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Change plan' }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=membership$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('Back on a sub-screen opened directly goes Home', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Rewards' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('on a notched phone the title bar stays below the status bar and the tab bar above the home indicator', async ({ page, request }) => {
  await useAppMode(page);   // sets the viewport first, so the inset override below is not reset by it
  const cdp = (await page.context().newCDPSession(page)) as unknown as { send(method: string, params: object): Promise<unknown> };
  const emulated = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 40, bottom: 24 } }).then(() => true, () => false);
  await signInAs(page, request, 'member');
  await page.goto('/rewards');
  const titleBar = page.locator('header', { has: page.getByRole('button', { name: 'Back' }) });
  if (!emulated) {
    // This Chromium cannot override the insets: check the rule that uses them instead.
    await expect(titleBar).toHaveClass(/top-\[env\(safe-area-inset-top\)\]/);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 600));
  expect((await page.getByRole('button', { name: 'Back' }).boundingBox())!.y).toBeGreaterThanOrEqual(40);
  const bar = (await tabBar(page).boundingBox())!;
  expect(bar.y + bar.height).toBe(800);
  expect(bar.height).toBe(58 + 24);
});

test('opening the app offline says so, and Try again lands on Home once the server answers', async ({ page, request }) => {
  await page.route('**/api/auth/me', route => route.abort());
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: "Can't reach PulseFit right now" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabBar(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: LANDING_H1 })).toHaveCount(0);
});

test('coaches keep the website layout in app mode', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'trainer');
  await page.goto('/trainer');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
});

test('the Android download bar never shows in app mode', async ({ page }) => {
  await offerApp(page); await useAppMode(page);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toHaveCount(0);
});

test('without the switch a phone gets the website', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-shell.spec.ts --project=mobile`
Expected: FAIL (`useAppMode` is not exported / no navigation named "Tabs").

- [ ] **Step 3: Implement** `appMode.ts`, `tabs.ts`, the history state in `navigate`, `AppShell.tsx`, the tokens and classes, the `App.tsx` shell choice, offline panel and Home redirect, the banner line, the helpers and the e2e build command.

- [ ] **Step 4: Guard releases.** In `android-release.mjs`, next to `GUIDE_ONLY_WORDS`, scan `dist-mobile` with the same `filesIn` loop for `'pulsefit_test_app_mode'` and `fail('The app contains the test-only app-mode switch:\n  <files>\nBuild it with mobile-sync (production mode), never --mode e2e.')`.

- [ ] **Step 5: Run the tests**

Run: `npx playwright test e2e/app-shell.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/smoke.spec.ts e2e/android-banner.spec.ts e2e/fix-core-ui.spec.ts` → PASS (website unchanged). Run: `npm run typecheck` → no errors. Then the production build: `npm run build --prefix client` and `grep -rl pulsefit_test_app_mode client/dist || echo clean` → `clean`.

- [ ] **Step 6: Commit** (owner-approved only)

```bash
git add client/src/lib/appMode.ts client/src/components/app client/src/App.tsx client/src/context/NavigationContext.tsx client/src/components/layout/AndroidAppBanner.tsx client/src/index.css playwright.config.ts e2e/helpers.ts e2e/android-banner.spec.ts e2e/app-shell.spec.ts client/scripts/android-release.mjs
git commit -m "App mode: member tab bar and app shell inside the app, offline start panel, test-only switch for e2e builds"
```

---

### Task 2: Pass tab

**Files:**
- Create: `client/src/pages/app/PassScreen.tsx`, `client/src/components/app/ui.tsx`, `e2e/app-pass.spec.ts`
- Modify: `client/src/components/app/tabs.ts` (`MEMBER_TABS`), `client/src/routes.ts`, `server/src/lib/seo.ts` (`PAGES`), `client/src/App.tsx` (lazy `PassScreen`, `appScreen`, `case 'pass'`), `client/src/components/qr/DigitalQrPassModal.tsx`, `docs/API.md` (robots.txt page list), `e2e/app-shell.spec.ts` (tab names)

**Interfaces:**
- Produces: route `{ tab: 'pass', path: '/pass', title: 'Entry pass', description: 'Your PulseFit Athletics entry pass: the QR code the front desk scans to check you in, with your member ID, your plan and its status.', indexable: false, access: ['member'] }` right after `rewards` in `ROUTES`, and the same entry at the same place in server `PAGES` (`seo.test.ts` compares them in order). `robots.txt` therefore gains `Disallow: /pass` (accepted website change, Global Constraints); `docs/API.md` adds `/pass` to its robots.txt list of pages that need an account. `MEMBER_TABS` gains `{ tab: 'pass', label: 'Pass', icon: QrCode }` third.
- Produces (`App.tsx`): `const appScreen = (id: string) => appShell === 'member' && isTabRoot(MEMBER_TABS, id, params)`; `case 'pass': return appScreen('pass') ? <PassScreen /> : <NotFoundPage setCurrentTab={setCurrentTab} />` (the website has no pass page).
- Produces (`DigitalQrPassModal.tsx`): `export function usePassQr(token: string | undefined, enabled: boolean): { qrDataUrl: string | null; qrError: string | null }` (the modal's QR effect moved in, same `QRCode.toDataURL` options; the modal calls it with `isOpen`) and `export const NOT_ACTIVE_NOTE`.
- Produces (`components/app/ui.tsx`): `StatusPill: React.FC<{ status: MembershipStatus; large?: boolean }>` — the README's pill (`large`, on Pass: 11px/700, `padding: 6px 14px`, a 6 px dot first), label from `STATUS_LABELS`; active bg `rgba(132,204,22,.15)` text `var(--app-lime)`, frozen `rgba(6,182,212,.15)` / `var(--app-cyan-tx)`, expired `rgba(239,68,68,.15)` / `var(--app-red-tx)`, pending `rgba(245,158,11,.15)` / `var(--app-amber-tx)`. `ShimmerList: React.FC<{ rows: number; label: string; className?: string }>` — `role="status"`, `aria-label={label}` and the same text sr-only; `rows` `aria-hidden` blocks of `.app-shimmer` (h-14, radius 16; static `var(--neu-inset-bg)` until Task 8 animates it).
- Produces: `PassScreen: React.FC` (`.app-screen`; README "1a → Pass" for sizes): h1 "Entry pass"; the card with `usePassQr(user.qr_code_token, true)` at 168×168 (`image-rendering: pixelated`, alt `QR code for pass <token>`, as the modal; error text or a spinner otherwise), name, `{cardNumber(user)} · {tierLabel(user.membership_tier, plans)}`, `<StatusPill large />` (no countdown), and `NOT_ACTIVE_NOTE[status]` when not active. Helper "Hold this to the front-desk or kiosk scanner." (no brightness line). A `.app-glass` button "Copy or save pass" opens `DigitalQrPassModal` (copy code, PNG download). Section "Recent check-ins": the 5 newest `api.getMyAttendance()` rows (`formatDateTime`, method label as on the dashboard) in `.app-inset` wells; `<ShimmerList rows={2} label="Loading check-ins" />`; `ErrorState` on failure; "No check-ins yet." when empty.

- [ ] **Step 1: Write the failing test** `e2e/app-pass.spec.ts`

```ts
test("the Pass tab shows the member's real QR pass with ID, plan and status", async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Pass' }).click();
  await expect(page).toHaveURL(/\/pass$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Entry pass' })).toBeVisible();
  await expect(page.getByRole('img', { name: `QR code for pass ${me.qr_code_token}` })).toBeVisible();
  await expect(page.getByText(me.name, { exact: true })).toBeVisible();
  await expect(page.getByText(/^PF-\d{2}-[0-9A-Z]{6} · /)).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText(/refreshes in|Brightness/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy or save pass' }).click();
  await expect(page.getByRole('dialog', { name: 'Digital access pass' })).toBeVisible();
});

test("a frozen member's pass says the front desk will not let it in", async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `pass frozen ${testInfo.project.name}`);
  expect((await request.post('/api/membership/freeze', { headers: auth(m.token) })).ok()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/pass');
  await expect(page.getByText('Frozen', { exact: true })).toBeVisible();
  await expect(page.getByText('Your membership is frozen, so the front desk will not let this pass in until you unfreeze it.')).toBeVisible();
});

test('without the switch /pass is no app screen on the website', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/pass');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Entry pass' })).toHaveCount(0);
});
```
In `e2e/app-shell.spec.ts` the tab names become `['Home', 'Classes', 'Pass', 'Train', 'Me']`, and the tab loop gains `['Pass', /\/pass$/]` after Classes.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-pass.spec.ts --project=mobile`
Expected: FAIL (no link named "Pass").

- [ ] **Step 3: Implement** the route, `PAGES` entry, robots doc line, `usePassQr`/`NOT_ACTIVE_NOTE` exports, `ui.tsx`, `appScreen`, `PassScreen` and the tab.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-pass.spec.ts e2e/app-shell.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/id-card.spec.ts e2e/flows.spec.ts` → PASS (the modal still works). Run: `cd server && npx vitest run tests/seo.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src server/src/lib/seo.ts docs/API.md e2e/app-pass.spec.ts e2e/app-shell.spec.ts
git commit -m "App mode: Pass tab with the member's real QR pass, ID, plan and status"
```

---

### Task 3: Home

**Files:**
- Create: `client/src/pages/app/HomeScreen.tsx`, `client/src/components/member/membershipNotice.ts`, `e2e/app-home.spec.ts`
- Modify: `client/src/pages/member/MemberDashboard.tsx` (imports the moved function), `client/src/types/index.ts` (`User`), `client/src/App.tsx` (`case 'member-dashboard'`: `appScreen('member-dashboard') ? <HomeScreen /> : <MemberDashboard …/>`)

**Interfaces:**
- Produces (`membershipNotice.ts`): `interface MembershipNotice { tone: 'warn' | 'info'; text: string; action: string; tab: string; params?: Record<string, string> }` and `membershipNotice(user: User): MembershipNotice | null`, moved unchanged from `MemberDashboard.tsx` with `daysUntil` and `EXPIRY_WARNING_DAYS`.
- Produces (`types/index.ts`): `User.active_days_this_week?: number` and `User.longest_streak_days?: number`, commented "Only in GET /auth/me (Task 9)".
- Produces (`HomeScreen.tsx`): `export const STREAK_GOAL = 5`; `export function streakCopy(streak: number, active?: number, longest?: number): { sessions: string | null; beatBest: string | null; ringPercent: number }` — `sessions` = `` `${active} of 5 sessions this week` `` (null when `active` is undefined); `ringPercent` = `min(active ?? 0, 5) / 5 * 100`; `beatBest` = null when `longest` is undefined or `longest <= streak`, else `n = longest - streak + 1` → `` `${n} more day${n === 1 ? '' : 's'} to beat your best.` ``. `HomeScreen: React.FC`.
- Home (`.app-screen`, column gap 18; sizes, colours and radii from README "1a → Home"), top to bottom:
  1. Header: `avatarOf(user)` image (alt "") in place of initials; h1 "Hi, {first name}"; `tierLabel(user.membership_tier, plans)` + `StatusPill`; "Valid through **{formatDate(expiry, { day: 'numeric', month: 'short', year: 'numeric' })}**", "Ended {date}" when expired, "No paid period yet" without an expiry.
  2. When `membershipNotice(user)` is not null: an `.app-inset` well with its text and a `.app-lime-btn` named `notice.action` → `navigate(notice.tab, notice.params)`.
  3. Streak card `<section aria-labelledby>` (h2 "Day streak"): ring `role="progressbar" aria-label="Sessions this week" aria-valuemin=0 aria-valuemax=5 aria-valuenow={min(active ?? 0, 5)}` drawn with `conic-gradient(#84cc16 0 var(--app-ring), var(--neu-inset-bg) var(--app-ring) 100%)` and inline `--app-ring: {ringPercent}%`; centre `streak_days` + `Flame` "DAYS"; "Sundays don't break it." + (" " + `beatBest`); the `sessions` line in `var(--app-lime)`. Null lines are left out.
  4. Quick actions (buttons): **Pass** → `navigate('pass')`; **ID card** → `navigate('profile')` (the handoff's goMe); **Log workout** (`.app-lime-btn`) → `navigate('workout-logger')`.
  5. "Upcoming classes" `<section aria-labelledby>` (h2): button "Timetable" (+ `ArrowRight`) → `navigate('schedule')`; the first 3 of `api.getMyBookings('upcoming')` as `.app-inset` rows: `start_time`, `formatDate(booking_date, { weekday: 'short', day: 'numeric' })` uppercase, `class_title`, `trainer_name`, `CircleCheck` `#84cc16`; more than 3: "See all {n}" → `navigate('my-bookings')`; empty: "No upcoming classes. Book a spot from the timetable."; loading: `<ShimmerList rows={2} label="Loading upcoming classes" />`; error: `ErrorState` with retry.
  6. "Note from your coach" `<section aria-labelledby>` (h2), only when `api.getMyNotes()` returns at least one: the newest note, "{trainer_name} · {category label}" and its body; more than one: "Show all {n} notes" / "Show fewer notes" toggle (`aria-expanded`), as the dashboard does.

- [ ] **Step 1: Write the failing test** `e2e/app-home.spec.ts`

```ts
/** GET /auth/me answered by the server, with `patch` merged into data and the `drop` keys removed. */
async function mockMe(page: Page, patch: Record<string, unknown>, drop: string[] = []): Promise<void> {
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const data = { ...body.data, ...patch };
    for (const key of drop) delete data[key];
    await route.fulfill({ response, json: { ...body, data } });
  });
}

test('Home shows the header, streak, quick actions, upcoming classes and the newest coach note', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const get = async (path: string) => (await (await request.get(path, { headers: auth(token) })).json()).data;
  const [me, upcoming, notes] = [await get('/api/auth/me'), await get('/api/bookings/my?scope=upcoming'), await get('/api/notes/my')];
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: `Hi, ${me.name.split(' ')[0]}` })).toBeVisible();
  await expect(page.getByText(/^Valid through /)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Sessions this week' })).toContainText(String(me.streak_days));
  await expect(page.getByText("Sundays don't break it.", { exact: false })).toBeVisible();
  for (const b of upcoming.slice(0, 3)) await expect(page.getByRole('region', { name: 'Upcoming classes' }).getByText(b.class_title).first()).toBeVisible();
  if (notes.length) await expect(page.getByText(notes[0].note)).toBeVisible();
});

test('quick actions open Pass, Me and Train, and Timetable opens Classes', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  for (const [name, url] of [['Pass', /\/pass$/], ['ID card', /\/profile$/], ['Log workout', /\/log-workout$/], ['Timetable', /\/schedule$/]] as const) {
    await page.goto('/dashboard');
    await page.getByRole('main').getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
  }
});

test('a new member sees the empty upcoming line and no coach-note card', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `home new ${testInfo.project.name}`);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  await expect(page.getByText('No upcoming classes. Book a spot from the timetable.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Note from your coach' })).toHaveCount(0);
});

test('an expired member sees the Expired pill and the renew notice', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `home expired ${testInfo.project.name}`);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const put = await request.put(`/api/members/${m.id}`, { headers: auth(m.adminToken), data: { membership_status: 'expired', membership_expiry: yesterday } });
  expect(put.ok(), await put.text()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  await expect(page.getByText('Expired', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Renew membership' }).click();
  await expect(page).toHaveURL(/\/pricing/);
});

test('the streak card follows the numbers GET /auth/me gives', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  const ring = page.getByRole('progressbar', { name: 'Sessions this week' });
  const cases = [
    { patch: { streak_days: 12, active_days_this_week: 4, longest_streak_days: 14 }, drop: [], now: '4', sessions: '4 of 5 sessions this week', best: '3 more days to beat your best.' },
    { patch: { streak_days: 12, active_days_this_week: 6, longest_streak_days: 12 }, drop: [], now: '5', sessions: '6 of 5 sessions this week', best: null },
    { patch: { streak_days: 0, active_days_this_week: 0, longest_streak_days: 1 }, drop: [], now: '0', sessions: '0 of 5 sessions this week', best: '2 more days to beat your best.' },
    { patch: {}, drop: ['active_days_this_week', 'longest_streak_days'], now: '0', sessions: null, best: null }
  ];
  for (const c of cases) {
    await page.unrouteAll();
    await mockMe(page, c.patch, c.drop);
    await page.goto('/dashboard');
    await expect(ring).toHaveAttribute('aria-valuenow', c.now);
    if (c.sessions) await expect(page.getByText(c.sessions)).toBeVisible();
    else await expect(page.getByText(/of 5 sessions/)).toHaveCount(0);
    if (c.best) await expect(page.getByText(c.best, { exact: false })).toBeVisible();
    else await expect(page.getByText(/beat your best/)).toHaveCount(0);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-home.spec.ts --project=mobile`
Expected: FAIL (the website dashboard still renders: no "Sundays don't break it." line, no "Sessions this week" progressbar).

- [ ] **Step 3: Implement** the move of `membershipNotice`, the `User` fields, `streakCopy` and `HomeScreen`, and the `App.tsx` case.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-home.spec.ts e2e/app-shell.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/fix-member-ui.spec.ts e2e/rewards.spec.ts` → PASS (the website dashboard is unchanged). `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/app-home.spec.ts
git commit -m "App mode: Home with the member header, streak card, quick actions, upcoming classes and coach note"
```

---

### Task 4: Classes

**Files:**
- Create: `client/src/pages/app/ClassesScreen.tsx`, `e2e/app-classes.spec.ts`
- Modify: `client/src/App.tsx` (`case 'schedule'`: `appScreen('schedule') ? <ClassesScreen /> : <SchedulePage …/>`)

**Interfaces:**
- Consumes: `api.getClasses({ week_start })`, `api.createBooking`, `api.cancelBooking`, `api.getPlans`, `planCovers` (`components/public/plans.ts`), `useAppConfig().config.gym.hours.closedWeekdays`, `mondayOf`, `weekdayOf` (`components/public/gymInfo.ts`), `addDays`, `gymToday`, `formatDate` (`lib/format.ts`), `ConfirmDialog`, `errorMessage`.
- Produces: `openDaysFrom(today: string, closedWeekdays: readonly number[]): string[]` — the next `7 - closedWeekdays.length` dates, starting today, whose `weekdayOf` is not closed (always inside the 14-day booking window). `classLook(c: Pick<GymClass, 'category' | 'intensity'>): { tint: string; ink: string; icon: LucideIcon }` — `'Zumba & Cardio'` → `rgba(236,72,153,.15)` / `var(--app-pink-tx)` / `Music2`; else intensity `'Extreme'` (the HIIT-like classes) → `rgba(245,158,11,.15)` / `var(--app-amber-tx)` / `Zap`; else `rgba(132,204,22,.15)` / `var(--app-lime)` / `Dumbbell`. `ClassesScreen: React.FC`.
- Classes (`.app-screen`, column gap 16; sizes from README "1a → Classes"): h1 "Timetable". Day chips `role="group" aria-label="Day"`, one button per `openDaysFrom` date, `aria-pressed`, `aria-label` = `formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })`; selected `.app-lime-btn` (no glow), others `.app-glass`. The selected day's week loads with `api.getClasses({ week_start: mondayOf(selected) })` (reload on week change); while it loads, `<ShimmerList rows={3} label="Loading classes" />` (never the previous week's cards); `ErrorState` on failure. The day's classes (`occurrence_date === selected`) in `start_time` order as `<ul aria-label="Classes on {chip aria-label}">` of `<li>` cards: `classLook` tile, title, "{start_time} · {trainer_name}", spots line, state button. Empty day: "No classes on {weekday}." A "Full timetable" button at the end → `navigate('schedule', { view: 'full' })` (today's month calendar, filters and the 14-day window).

| State (first match) | Button | Spots line |
|---|---|---|
| `my_booking_id` set | "Booked", `.app-inset`, lime text; tap → `ConfirmDialog` title "Cancel this booking?", message "{title} on {formatDate(occurrence_date, { weekday: 'long', day: 'numeric', month: 'long' })}.", confirm "Cancel booking", cancel "Keep it" → `cancelBooking`, toast, reload (no tap once started) | "You are booked" lime |
| `starts_at` ≤ now | "Started", disabled, `.app-inset`, muted | — |
| member plan loaded and `!planCovers(plan, c.category)` | "Not in plan", disabled, `.app-inset`, muted | "Your plan doesn't include {category}" muted |
| `is_full` | "Full", disabled, `.app-glass`, `var(--app-amber-tx)` (the handoff's Waitlist look; deviation 1) | "Class full" amber |
| otherwise | "Book", `.app-lime-btn`, `aria-label="Book {title} at {start_time}"`; busy while the request runs | "{n} spots left" ("1 spot left") muted |

  Booking: `createBooking({ class_id, booking_date: occurrence_date })` → success toast "Class booked", reload; any error → error toast with the server's message (`errorMessage(err)`), reload.

- [ ] **Step 1: Write the failing test** `e2e/app-classes.spec.ts` (each test on its own `freshMember`, whose Basic plan covers Workout & Strength only)

```ts
const chips = (page: Page) => page.getByRole('group', { name: 'Day' }).getByRole('button');

/** Select the i-th day chip and wait for that day's list or its empty line. */
async function openDay(page: Page, i: number): Promise<void> {
  const chip = chips(page).nth(i);
  await chip.click();
  const day = await chip.getAttribute('aria-label');
  await expect(page.getByRole('list', { name: `Classes on ${day}` }).or(page.getByText(/^No classes on /))).toBeVisible();
}

/** Tap the first Book button over the open days; returns the class title. */
async function bookFirst(page: Page): Promise<string> {
  for (let i = 0; i < (await chips(page).count()); i++) {
    await openDay(page, i);
    const book = page.getByRole('button', { name: /^Book .+ at / }).first();
    if (await book.count()) {
      const title = (await book.getAttribute('aria-label'))!.replace(/^Book (.+) at .+$/, '$1');
      await book.click();
      return title;
    }
  }
  throw new Error('no bookable class on the open days');
}

async function openClasses(page: Page, request: APIRequestContext, label: string) {
  const m = await freshMember(request, label);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/schedule');
  return m;
}

test("day chips are the gym's open days from today", async ({ page, request }, testInfo) => {
  const { closedWeekdays } = (await (await request.get('/api/config')).json()).data.gym.hours as { closedWeekdays: number[] };
  await openClasses(page, request, `classes days ${testInfo.project.name}`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const labels: string[] = [];
  for (let i = 0; labels.length < 7 - closedWeekdays.length; i++) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    if (!closedWeekdays.includes(d.getUTCDay())) labels.push(new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d));
  }
  await expect(chips(page)).toHaveCount(labels.length);
  for (const [i, label] of labels.entries()) await expect(chips(page).nth(i)).toHaveAttribute('aria-label', label);
});

test('booking from Classes shows Booked and the class appears on Home', async ({ page, request }, testInfo) => {
  await openClasses(page, request, `classes book ${testInfo.project.name}`);
  const title = await bookFirst(page);
  await expect(page.getByText('Class booked')).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: title }).first();
  await expect(card.getByRole('button', { name: 'Booked' })).toBeVisible();
  await expect(card.getByText('You are booked')).toBeVisible();
  await tabBar(page).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('region', { name: 'Upcoming classes' }).getByText(title)).toBeVisible();
});

test('tapping Booked asks before cancelling, and cancelling frees the spot', async ({ page, request }, testInfo) => {
  const m = await openClasses(page, request, `classes cancel ${testInfo.project.name}`);
  const title = await bookFirst(page);
  const card = page.getByRole('listitem').filter({ hasText: title }).first();
  await card.getByRole('button', { name: 'Booked' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
  await expect(dialog).toContainText(title);
  await dialog.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(card.getByRole('button', { name: /^Book / })).toBeVisible();
  expect((await (await request.get('/api/bookings/my?scope=upcoming', { headers: auth(m.token) })).json()).data).toHaveLength(0);
});

test('classes outside the plan say "Not in plan" and offer no Book button', async ({ page, request }, testInfo) => {
  await openClasses(page, request, `classes plan ${testInfo.project.name}`);
  for (let i = 0; i < (await chips(page).count()); i++) {
    await openDay(page, i);
    const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Not in plan' }) }).first();
    if (!(await card.count())) continue;
    await expect(card.getByRole('button', { name: 'Not in plan' })).toBeDisabled();
    await expect(card).toContainText("Your plan doesn't include Zumba & Cardio");
    await expect(card.getByRole('button', { name: /^Book / })).toHaveCount(0);
    return;
  }
  throw new Error('no Zumba & Cardio class on the open days');
});

test('full and started classes cannot be booked', async ({ page, request }, testInfo) => {
  type Cls = { occurrence_date: string; start_time: string } & Record<string, unknown>;
  await page.route(/\/api\/classes\?/, async route => {
    const response = await route.fetch();
    const body = await response.json();
    const byDay = new Map<string, Cls[]>();
    for (const c of body.data as Cls[]) byDay.set(c.occurrence_date, [...(byDay.get(c.occurrence_date) ?? []), c]);
    for (const day of byDay.values()) {
      const [first, second] = day.sort((a, b) => a.start_time.localeCompare(b.start_time));
      Object.assign(first, { is_full: true, spots_left: 0, my_booking_id: null, category: 'Workout & Strength', starts_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (second) Object.assign(second, { my_booking_id: null, starts_at: new Date(Date.now() - 60_000).toISOString() });
    }
    await route.fulfill({ response, json: body });
  });
  await openClasses(page, request, `classes full ${testInfo.project.name}`);
  const cards = page.getByRole('list', { name: /^Classes on / }).getByRole('listitem');
  await expect(cards.nth(0).getByRole('button', { name: 'Full' })).toBeDisabled();
  await expect(cards.nth(0)).toContainText('Class full');
  await expect(cards.nth(1).getByRole('button', { name: 'Started' })).toBeDisabled();
});

test("a frozen member who taps Book sees the server's reason", async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `classes frozen ${testInfo.project.name}`);
  expect((await request.post('/api/membership/freeze', { headers: auth(m.token) })).ok()).toBeTruthy();
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/schedule');
  const answer = page.waitForResponse(r => r.url().endsWith('/api/bookings') && r.request().method() === 'POST');
  await bookFirst(page);
  const { error } = await (await answer).json();
  await expect(page.getByText(error)).toBeVisible();
});

test("Full timetable opens today's timetable page with a Back arrow", async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'Full timetable' }).click();
  await expect(page).toHaveURL(/\/schedule\?view=full$/);
  await expect(page.getByRole('heading', { level: 1, name: /book a class/i })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('group', { name: 'Day' })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-classes.spec.ts --project=mobile`
Expected: FAIL (no group named "Day").

- [ ] **Step 3: Implement** `openDaysFrom`, `classLook`, `ClassesScreen` and the `App.tsx` case.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-classes.spec.ts e2e/app-home.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/flows.spec.ts` → PASS (website timetable). `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/app-classes.spec.ts
git commit -m "App mode: Classes with open-day chips and Book, Booked, Full, Started and Not in plan from the booking rules"
```

---

### Task 5: Train

**Files:**
- Create: `client/src/pages/app/TrainScreen.tsx`, `client/src/components/app/trainDraft.ts`, `client/src/components/member/workoutLimits.ts`, `e2e/app-train.spec.ts`
- Modify: `client/src/pages/member/WorkoutLogger.tsx` (imports `WORKOUT_LIMITS` instead of its local `LIMITS`), `client/src/App.tsx` (`case 'workout-logger'`: `appScreen('workout-logger') ? <TrainScreen /> : <WorkoutLogger …/>`)

**Interfaces:**
- Produces (`workoutLimits.ts`): `export const WORKOUT_LIMITS = { title: 100, notes: 1000, duration: 300, weight: 500, reps: 100, rpe: 10, setsTotal: 100, setsPerExercise: 50, daysBack: 365 }` (the existing `LIMITS`, moved).
- Produces (`trainDraft.ts`): `interface TrainDraft { title: string; startedAt: number; exercises: { exercise_id: string; exercise_name: string; sets: { weight_kg: number; reps: number }[] }[] }`; `loadDraft(userId: string): TrainDraft | null` (`storage` key `pulsefit_train_draft:<userId>`, JSON; anything malformed → null); `saveDraft(userId: string, draft: TrainDraft): void`; `clearDraft(userId: string): void`.
- Produces (`TrainScreen.tsx`): `toNewWorkout(draft: TrainDraft, today: string, now: number): NewWorkout` — title trimmed (empty → "Workout"), `date: today`, `duration_minutes` = `round((now - startedAt) / 60000)` clamped to 1…`WORKOUT_LIMITS.duration`, sets flattened in order with `set_number` from 1 per exercise and `is_warmup: false`. `weekVolumes(timeline: WorkoutAnalytics['volumeTimeline'], today: string): { days: number[]; changePct: number | null }` — `days[0..6]` = summed `volumeKg` Mon–Sun of today's week; `changePct` = `round((this week − last week) / last week × 100)`, null when last week is 0. `newRecords(before: WorkoutAnalytics['personalRecords'], after: WorkoutAnalytics['personalRecords']): number` — the `after` entries whose `exerciseId` has a `before` entry with a lower `e1rm`; an exercise with no earlier record does not count, so a first workout never claims PRs. `TrainScreen: React.FC`.
- Behaviour: the draft is saved on every change and restored on mount (`startedAt` = the first set's time). State `records: WorkoutAnalytics['personalRecords'] | null` = `analytics.data?.personalRecords` once the analytics resource loads, then each Finish's `after` (null while it has not loaded or has failed). Finish: `before = records` (the snapshot just before saving), `api.createWorkout(toNewWorkout(...))`, then `after` = `api.getWorkoutAnalytics()` (a failure leaves `after` null; otherwise `setRecords(after)`), `clearDraft`, `refreshUser()`, `analytics.reload()`, saved state. The PR suffix shows only when `before` and `after` are both known and `newRecords(before, after) > 0`. A `createWorkout` error → toast with the server's message, draft kept. Adding an exercise after saving starts a new draft.
- Train (`.app-screen`, column gap 16; sizes from README "1a → Train" and the markup), top to bottom: h1 "Workout", and while a draft has sets "{title || 'Workout'} · {elapsed} min" beside it. `FloorClockCard` (as on the dashboard: `user`, `stats` = `api.getMyTimeTrackingStats()`, `plans`, `onSessionChange` = `refreshUser` + `analytics.reload`, `onOpenPricing`, `onOpenProfile` → `navigate('profile', { tab: 'membership' })`). Volume card from `weekVolumes`, `role="img"` `aria-label="Volume this week: {total} kg"`: `changePct` as `+8%` / `−5%` (lime when ≥ 0, `var(--app-amber-tx)` when < 0, left out when null); 7 bars, today's `#84cc16` with `data-today`, others `var(--gym-700)`; `<ShimmerList rows={1} label="Loading this week's volume" />` while loading; left out on error. Input `aria-label="Workout name"` (max 100). Per draft exercise a `<section aria-label={exercise_name}>` card: "{n} sets"; set chips `{weight}×{reps}`, each with a remove button `aria-label="Remove set {i} of {exercise}"`; inputs `aria-label="Weight (kg)"` (0–500, step 0.5) and `aria-label="Reps"` (1–100, whole), prefilled from the last set; button "Add set (repeat last)" ("Add set" while the exercise has none), disabled when an input is out of range or `setsPerExercise`/`setsTotal` is reached. Then `select` `aria-label="Exercise"` (first option "Choose an exercise", value '', then `api.getExercises()`) + button "Add exercise" (disabled on ''). **Finish workout** (`.app-lime-btn`, full width), disabled without sets; saved state "Saved · nice work" + `, {n} PR`/`PRs`, `background: var(--gym-700); color: var(--app-tx)`, no glow. Then `ProgressSection` (as on the dashboard) and a `TabLink` "Workout log & history" → `workout-logger` `{ view: 'full' }` (today's logger: back-dating, RPE, templates, rest timer, history, delete).

- [ ] **Step 1: Write the failing test** `e2e/app-train.spec.ts`

```ts
/** Add the first exercise of the list; returns its name. */
async function addExercise(page: Page): Promise<string> {
  const select = page.getByRole('combobox', { name: 'Exercise' });
  await expect(select.locator('option').nth(1)).toBeAttached();
  const name = (await select.locator('option').nth(1).textContent())!.trim();
  await select.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add exercise' }).click();
  return name;
}

async function addSet(page: Page, exercise: string, weight: string, reps: string): Promise<void> {
  const card = page.getByRole('region', { name: exercise, exact: true });
  await card.getByLabel('Weight (kg)').fill(weight);
  await card.getByLabel('Reps').fill(reps);
  await card.getByRole('button', { name: /^Add set/ }).click();
}

async function openTrain(page: Page, request: APIRequestContext, label: string, theme?: 'light' | 'dark') {
  const m = await freshMember(request, label);
  await useAppMode(page, { theme }); await useSession(page, m.token);
  await page.goto('/log-workout');
  return m;
}

test('a member logs sets with Add set (repeat last) and Finish saves the workout', async ({ page, request }, testInfo) => {
  const m = await openTrain(page, request, `train ${testInfo.project.name}`, 'dark');
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
  const name = await addExercise(page);
  const card = page.getByRole('region', { name, exact: true });
  await addSet(page, name, '60', '8');
  await card.getByRole('button', { name: 'Add set (repeat last)' }).click();
  await expect(card.getByText('60×8')).toHaveCount(2);
  await expect(card.getByText('2 sets')).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const saved = page.getByRole('button', { name: 'Saved · nice work', exact: true });   // a first workout has no earlier records
  await expect(saved).toBeVisible();
  await expect(saved).toHaveCSS('color', 'rgb(241, 245, 249)');   // --app-tx in dark, not #090c10 on --gym-700
  const workouts = (await (await request.get('/api/workouts', { headers: auth(m.token) })).json()).data;
  expect(workouts).toHaveLength(1);
  expect(workouts[0].sets).toMatchObject([{ weight_kg: 60, reps: 8 }, { weight_kg: 60, reps: 8 }]);
  await expect(page.getByRole('img', { name: 'Volume this week: 960 kg' }).locator('[data-today]')).toHaveCSS('background-color', 'rgb(132, 204, 22)');
});

test('Finish counts a beaten record as a PR, and claims none when the records could not load', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train pr ${testInfo.project.name}`);
  const name = await addExercise(page);
  await addSet(page, name, '50', '8');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Saved · nice work', exact: true })).toBeVisible();
  await addExercise(page);
  await addSet(page, name, '60', '8');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Saved · nice work, 1 PR', exact: true })).toBeVisible();
  let failed = false;
  await page.route('**/api/workouts/analytics', route => (failed ? route.continue() : ((failed = true), route.abort())));
  await page.reload();
  await addExercise(page);
  await addSet(page, name, '70', '8');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Saved · nice work', exact: true })).toBeVisible();
});

test('logged sets survive another tab and a reload, and Finish clears them', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train draft ${testInfo.project.name}`);
  const name = await addExercise(page);
  await addSet(page, name, '40', '10');
  await tabBar(page).getByRole('link', { name: 'Home' }).click();
  await tabBar(page).getByRole('link', { name: 'Train' }).click();
  await expect(page.getByText('40×10')).toBeVisible();
  await page.reload();
  await expect(page.getByText('40×10')).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: /^Saved · nice work/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText('40×10')).toHaveCount(0);
});

test('Finish is disabled without sets, and weight or reps out of range cannot be added', async ({ page, request }, testInfo) => {
  await openTrain(page, request, `train limits ${testInfo.project.name}`);
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeDisabled();
  const name = await addExercise(page);
  const card = page.getByRole('region', { name, exact: true });
  const add = card.getByRole('button', { name: 'Add set', exact: true });
  await card.getByLabel('Weight (kg)').fill('501'); await card.getByLabel('Reps').fill('8');
  await expect(add).toBeDisabled();
  await card.getByLabel('Weight (kg)').fill('60'); await card.getByLabel('Reps').fill('0');
  await expect(add).toBeDisabled();
});

test('Train has the floor clock and progress, and Workout log & history opens the full logger', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/log-workout');
  await expect(page.getByRole('heading', { name: 'Floor time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal records' })).toBeVisible();
  await page.getByRole('link', { name: 'Workout log & history' }).click();
  await expect(page).toHaveURL(/\/log-workout\?view=full$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Log a workout' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-train.spec.ts --project=mobile`
Expected: FAIL (no h1 "Workout").

- [ ] **Step 3: Implement** the limits move, `trainDraft.ts`, the helpers, `TrainScreen` and the `App.tsx` case.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-train.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/fix-member-ui.spec.ts e2e/flows.spec.ts` → PASS (today's logger unchanged). `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/app-train.spec.ts
git commit -m "App mode: Train logger with weekly volume, set chips, repeat-last sets and Finish, kept across tabs"
```

---

### Task 6: Me, the Rewards card and section, and Explore

**Files:**
- Create: `client/src/pages/app/MeScreen.tsx`, `client/src/components/member/FreezeDialog.tsx`, `client/src/components/member/useShareReferral.ts`, `client/src/components/app/rewards.ts`, `e2e/app-me.spec.ts`, `e2e/app-rewards.spec.ts`
- Modify: `client/src/pages/member/MemberProfilePage.tsx` (`MembershipPanel`, `selectTab`), `client/src/pages/member/RewardsPage.tsx` (`share`), `client/src/pages/app/HomeScreen.tsx` (Rewards card), `client/src/components/app/ui.tsx` (`AppSwitch`), `client/src/App.tsx` (`case 'profile'`: `appScreen('profile') ? <MeScreen /> : <MemberProfilePage …/>`)

**Interfaces:**
- Produces (`FreezeDialog.tsx`): `FreezeDialog: React.FC<{ action: 'freeze' | 'unfreeze' | null; onClose: () => void }>` — `MembershipPanel`'s `ConfirmDialog`, `upcomingCount` effect, `run` and `bookingsLine`, moved unchanged; `MembershipPanel` renders `<FreezeDialog action={confirm} onClose={() => setConfirm(null)} />`.
- Produces (`useShareReferral.ts`): `useShareReferral(): (code: string) => Promise<void>` — `RewardsPage`'s `share` and `siteAddress`, moved unchanged (same text and toasts); `RewardsPage` uses it.
- Produces (`components/app/rewards.ts`): `nextMilestone(r: MyRewards): { gift_name: string; remaining: number; type: 'visits' | 'streak' } | null` — milestones with `!reached && threshold > value` (`value` = `r.visits` or `r.streak`), smallest `threshold − value`, visits first on a tie. Copy: visits "{n} more visit(s) to {gift}", streak "{n} more visit-streak day(s) to {gift}". `openClaims(claims: GiftClaim[]): GiftClaim[]` — `needs_size`, `ready` and `waiting` claims, in that order, newest first within each. `cheapestGifts(gifts: StoreGift[], n = 3): StoreGift[]` — in-stock gifts by `points_cost`, then name.
- Produces (`ui.tsx`): `AppSwitch: React.FC<{ checked: boolean; onChange: () => void; label: string; onColor: string; disabled?: boolean }>` — `<button role="switch" aria-checked aria-label={label}>`, the README's 52×30 switch with a 22 px knob, background `onColor` when on else `var(--neu-inset-bg)`, `box-shadow: inset 2px 2px 5px var(--neu-shadow-dark)`, knob `transition: left .2s`.
- Produces (`MemberProfilePage.tsx`): `selectTab` navigates `navigate('profile', id === 'details' && !isAppMode ? undefined : { tab: id }, { replace: true })`, so the full page keeps its query in the app.
- Home Rewards card (between quick actions and Upcoming classes), from `api.getMyRewards()`: one `.app-glass` button `aria-label="Rewards: {balance} points"` → `navigate('profile', { section: 'rewards' })`, showing `Gift` + "Rewards", the balance + "points", the `nextMilestone` line, a pill "Gift ready to collect" when any claim is `ready`, and a pill "Choose a size" when any claim is `needs_size`. `useGiftCelebration(user.id, rewards.data?.claims ?? null)`. `<ShimmerList rows={1} label="Loading rewards" />` while loading; left out on error.
- `MeScreen: React.FC` (`.app-screen`, column gap 16; sizes from README "1a → Me" and the markup), h1 "Profile", then:
  1. ID card button `aria-label="Open my ID card"` → `IdCardModal`: its own style, not `.app-glass` — radius 24, padding 18, `background-image: linear-gradient(135deg, var(--gym-800), var(--app-card))`, `box-shadow: 8px 8px 18px var(--neu-shadow-dark), -8px -8px 18px var(--neu-shadow-light)`, `border: 1px solid rgba(255,255,255,.07)`; `Zap` + "PulseFit" / "MEMBER ID", 64 px `avatarOf(user)`, name, `cardNumber(user)`, "Valid through {date}".
  2. Freeze row: `Snowflake` + "Freeze membership"; copy (active: "Pause your plan. When you unfreeze, the days the gym was open while you were frozen are added to your end date."; frozen: "Frozen since {date}. While frozen you cannot check in, book classes or clock in."; otherwise: "Only an active membership can be frozen."); `AppSwitch` label "Freeze membership", `onColor="#06b6d4"`, checked when frozen, disabled unless active or frozen, opening `FreezeDialog`.
  3. "Plans": `<ul aria-label="Plans">` of `api.getPlans()` rows: name, `description` (one line), `formatINR(price_monthly)`, label CURRENT (member's tier, active or frozen; plain row, `border: 1px solid rgba(132,204,22,.5)`), RENEW (member's tier, expired) or SWITCH; RENEW/SWITCH rows are buttons `aria-label="Renew {name}"` / `"Switch to {name}"` → `navigate('pricing', { plan: tier })` (the existing checkout). `<ShimmerList rows={3} label="Loading plans" />`.
  4. "Invoices": the 3 newest `api.getMyPayments()` (by `created_at`), each a button `aria-label="Invoice {invoice_number}"` opening `InvoiceModal` (download as today): `FileText`, number, `formatDate(created_at)`, `formatINR(amount_inr)`, `Download`. "All invoices" → `navigate('profile', { tab: 'billing' })` when there are more; "No invoices yet." when none; `<ShimmerList rows={3} label="Loading invoices" />`.
  5. "Rewards" `<section id="me-rewards" aria-labelledby>` (h2 "Rewards"), from `api.getMyRewards()` and `api.getStoreGifts()`: "{balance} points"; each of `openClaims(claims)`: `gift_name` + `ready` "Pickup code {pickup_code}" / `needs_size` a button "Choose a size" → `navigate('rewards')` / `waiting` "Waiting for stock"; the `nextMilestone` line; "Gift store": `cheapestGifts(store)` as buttons `aria-label="{name}, {points_cost} points"` (`GiftImage`, name, cost) → `navigate('rewards')`; "Your referral code {code}" + button "Share" (`useShareReferral`); a `TabLink` "Gift store, my gifts & points history" → `rewards`. `<ShimmerList rows={2} label="Loading rewards" />`; `ErrorState` on failure. With `?section=rewards`, scrolled into view once loaded.
  6. "My account" `TabLink` rows (`ChevronRight`): My bookings → `my-bookings`; Workout log & history → `workout-logger` `{ view: 'full' }`; Personal details & avatar → `profile` `{ tab: 'details' }`; Password & two-step sign-in → `profile` `{ tab: 'security' }`.
  7. "Explore" `TabLink` rows (icons as Navbar's `PUBLIC_LINKS`): Overview → `home` `{ view: 'full' }` (bare `/` sends a member Home, Task 1); Strength floor → `workout`; Zumba studio → `zumba`; Plans & diets → `guide`; Coaches → `trainers`; Memberships → `pricing`; Exercises → `exercise-library`; Contact us → `contact`.
  8. `AppSwitch` "Dark mode" (`onColor="#84cc16"`, `checked={isDark}`, `toggleTheme`).
  9. Button "Sign out" (`var(--app-red-tx)`): `clearDraft(user.id)`, `logout()`, `navigate('home')`, toast "You have signed out." (as Navbar).
  10. `TabLink`s Privacy policy · Terms of service · Refunds & cancellations (Footer's `LEGAL`).

- [ ] **Step 1: Write the failing tests** `e2e/app-me.spec.ts` and `e2e/app-rewards.spec.ts`

```ts
// app-me.spec.ts
test('the Freeze switch freezes and unfreezes through the existing confirmation', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `me freeze ${testInfo.project.name}`);
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/profile');
  const freeze = page.getByRole('switch', { name: 'Freeze membership' });
  await expect(freeze).toHaveAttribute('aria-checked', 'false');
  await freeze.click();
  await page.getByRole('dialog', { name: 'Freeze your membership?' }).getByRole('button', { name: 'Freeze membership' }).click();
  await expect(freeze).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/^Frozen since /)).toBeVisible();
  await freeze.click();
  await page.getByRole('dialog', { name: 'Unfreeze your membership?' }).getByRole('button', { name: 'Unfreeze' }).click();
  await expect(freeze).toHaveAttribute('aria-checked', 'false');
});

test('invoices list the newest payments and open the invoice', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const payments: { invoice_number: string; created_at: string }[] = (await (await request.get('/api/payments/my', { headers: auth(token) })).json()).data;
  const newest = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  await page.goto('/profile');
  for (const p of newest) await expect(page.getByRole('button', { name: `Invoice ${p.invoice_number}` })).toBeVisible();
  await page.getByRole('button', { name: `Invoice ${newest[0].invoice_number}` }).click();
  await expect(page.getByRole('dialog')).toContainText(newest[0].invoice_number);
});

test('plans mark the current one, and Switch opens Memberships for that plan', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  const plans: { tier: string; name: string }[] = (await (await request.get('/api/plans')).json()).data;
  const current = plans.find(p => p.tier === me.membership_tier)!;
  const other = plans.find(p => p.tier !== me.membership_tier)!;
  await page.goto('/profile');
  const list = page.getByRole('list', { name: 'Plans' });
  await expect(list.getByRole('listitem').filter({ hasText: current.name })).toContainText('CURRENT');
  await list.getByRole('button', { name: `Switch to ${other.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/pricing\\?plan=${other.tier}$`));
});

test('every former header and footer link is reachable from Me or a tab', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  for (const [name, url] of [
    ['Overview', /\/\?view=full$/], ['Strength floor', /\/strength$/], ['Zumba studio', /\/zumba$/], ['Plans & diets', /\/guide$/],
    ['Coaches', /\/coaches$/], ['Memberships', /\/pricing$/], ['Exercises', /\/exercises$/], ['Contact us', /\/contact$/],
    ['My bookings', /\/bookings$/], ['Gift store, my gifts & points history', /\/rewards$/],
    ['Privacy policy', /\/privacy$/], ['Terms of service', /\/terms$/], ['Refunds & cancellations', /\/refund-policy$/]
  ] as const) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await page.goBack();
    await expect(page).toHaveURL(/\/profile$/);
  }
  await expect(tabBar(page).getByRole('link')).toHaveText(['Home', 'Classes', 'Pass', 'Train', 'Me']);
});

test('links with a query open the full page in the shell, never the tab screen', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  await page.goto('/profile?tab=security');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=details$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toHaveCount(0);
  await page.goto('/schedule?trainer=trn_vikram');
  await expect(page.getByRole('heading', { level: 1, name: /book a class/i })).toBeVisible();
  const exercises: { id: string }[] = (await (await request.get('/api/exercises', { headers: auth(token) })).json()).data;
  await page.goto(`/log-workout?exercise=${exercises[0].id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Log a workout' })).toBeVisible();
});

test('Dark mode switches the theme, and Sign out clears the Train draft', async ({ page, request }) => {
  await useAppMode(page, { theme: 'light' }); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/profile');
  await page.evaluate(id => localStorage.setItem(`pulsefit_train_draft:${id}`, JSON.stringify({ title: '', startedAt: Date.now(), exercises: [] })), me.id);
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(id => localStorage.getItem(`pulsefit_train_draft:${id}`), me.id)).toBeNull();
});

// app-rewards.spec.ts
test('Home shows the Rewards card with the balance and a ready gift, and it opens the Rewards section in Me', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app rewards ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  const claim = (await (await request.post('/api/rewards/claims', { headers: auth(m.token), data: { gift_id: 'gift_sticker_pack' } })).json()).data;
  const rewards = (await (await request.get('/api/rewards/me', { headers: auth(m.token) })).json()).data;
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  const card = page.getByRole('button', { name: `Rewards: ${rewards.balance} points` });
  await expect(card).toContainText('Gift ready to collect');
  await card.click();
  await expect(page).toHaveURL(/\/profile\?section=rewards$/);
  const section = page.getByRole('region', { name: 'Rewards' });
  await expect(section).toBeInViewport();
  await expect(section.getByText(`Pickup code ${claim.pickup_code}`)).toBeVisible();
  await expect(section.getByText(rewards.referral_code)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(section.getByRole('button', { name: /, \d+ points$/ })).toHaveCount(3);
  await section.getByRole('link', { name: 'Gift store, my gifts & points history' }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/profile\?section=rewards$/);
});

test('a gift waiting for a size says Choose a size on Home and in Me, and opens the Rewards page', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `app sizes ${testInfo.project.name}`);
  // Apparel from a milestone or a joining bundle arrives without a size; the answer is given one here.
  await page.route('**/api/rewards/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.claims.unshift({
      id: 'clm_e2e_size', user_id: m.id, user_name: 'E2E', gift_id: 'gift_tshirt', gift_name: 'PulseFit T-shirt', source: 'joining', source_ref: 'pay_e2e',
      points_spent: 0, pickup_code: 'SIZE23', status: 'needs_size', created_at: new Date().toISOString(), sizes: ['S', 'M', 'L', 'XL', 'XXL']
    });
    await route.fulfill({ response, json: body });
  });
  await useAppMode(page); await useSession(page, m.token);
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: /^Rewards: / })).toContainText('Choose a size');
  await page.goto('/profile');
  const section = page.getByRole('region', { name: 'Rewards' });
  await expect(section.getByText('PulseFit T-shirt')).toBeVisible();
  await section.getByRole('button', { name: 'Choose a size' }).click();
  await expect(page).toHaveURL(/\/rewards$/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test e2e/app-me.spec.ts e2e/app-rewards.spec.ts --project=mobile`
Expected: FAIL (no switch named "Freeze membership").

- [ ] **Step 3: Implement** the three extractions (behaviour unchanged), `rewards.ts`, `AppSwitch`, `MeScreen`, the Home card, `selectTab` and the `App.tsx` case.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-me.spec.ts e2e/app-rewards.spec.ts e2e/app-home.spec.ts e2e/app-train.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/fix-member-ui.spec.ts e2e/rewards.spec.ts e2e/avatar.spec.ts` → PASS (freeze, Rewards page and profile on the website unchanged). `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/app-me.spec.ts e2e/app-rewards.spec.ts
git commit -m "App mode: Me with ID card, freeze switch, plans, invoices, rewards, account and explore links; Rewards card on Home"
```

---

### Task 7: Guest welcome and guest shell

**Files:**
- Create: `client/src/pages/app/WelcomeScreen.tsx`, `e2e/app-welcome.spec.ts`
- Modify: `client/src/lib/appMode.ts` (`isFirstLaunch`), `client/src/components/app/tabs.ts` (`AppTab`, `GUEST_TABS`), `client/src/components/app/AppShell.tsx` (`onSignIn`), `client/src/App.tsx` (`'guest'` shell)

**Interfaces:**
- Produces (`appMode.ts`): `export const isFirstLaunch: boolean` — in app mode only: true when `storage` key `pulsefit_welcome_seen` is not `'1'` at start-up, and the key is set to `'1'` at that moment (first launch only, whatever happens next).
- Produces (`tabs.ts`): `AppTab = { tab: string; label: string; icon } | { action: 'sign-in'; label: string; icon }`; `GUEST_TABS` = Explore `home` `House`, Contact `contact` `MessageCircle`, Sign in `{ action: 'sign-in' }` `KeyRound`; `isTabRoot` ignores action tabs.
- Produces (`AppShell.tsx`): optional `onSignIn?: () => void`; an action tab renders as a `<button>` calling it; Back's fallback uses the first tab that has a route.
- Produces (`WelcomeScreen.tsx`): `WelcomeScreen: React.FC<{ showSlides: boolean; onSlidesDone: () => void; onSignIn: () => void; onRegister: () => void; onFreePass: () => void; onExplore: () => void }>`, rendering its own `<div className="app-backdrop" aria-hidden="true" />` (the backdrop is fixed behind everything, so it never wraps the slides). One h1 "Welcome to PulseFit" (sr-only during the slides). Slides (horizontal `scroll-snap-type: x mandatory`, one 100%-wide slide each, swipeable; h2 per slide; emoji 72 px `aria-hidden`; body 13px muted): 💪 "Strength floor" — "Racks, barbells and coaches on the floor. Log every set in the app."; 💃 "Zumba studio" — "High-energy classes on every open day. Book your spot in two taps."; 🎁 "Rewards & gifts" — "Earn points for your visits and workouts, and collect gifts at the front desk." Three dots, "Skip" (top right) and "Next" (`.app-lime-btn`; "Get started" on the last slide) both end the slides (`onSlidesDone`). Panel: `Dumbbell` in a lime-gradient tile, h1 visible, "Sector 29 · Gurugram" muted, buttons stacked (radius 16, 44 px+): **Sign in** (`.app-lime-btn`) → `onSignIn`; **Create account** (`.app-glass`) → `onRegister`; **Get a free pass** (`.app-glass`, `Sparkles`) → `onFreePass`; **Contact us** (`.app-glass`) → `useNavigation().navigate('contact')`; **Explore first** (lime text) → `onExplore`.
- Produces (`App.tsx`): `appShell` gains `'guest'` (app mode, not initializing, no user). State `exploring` (false) and `slidesPending` (`isFirstLaunch`); both reset to false whenever a user is signed in (effect on `user?.id`). In `'guest'`: tab `home` and `!exploring` → `page` is `<WelcomeScreen showSlides={slidesPending} …/>` (`onSignIn` → `openAuthModal('login')`, `onRegister` → `openAuthModal('register')`, `onFreePass` → `openFreeTrialModal`, `onExplore` → `setExploring(true)`), and it replaces only `page` inside `<main>`: the root div (safe-area padding), skip link, announcer, toasts and the `AuthModal`/`FreeTrialModal` mounts stay, with no `AppShell`, Navbar or Footer (as `'starting'`). Every other case → `<AppShell tabs={GUEST_TABS} onSignIn={() => openAuthModal('login')}>` around the usual tree. Gating is untouched (`navigate` still opens the sign-in dialog for gated pages).

- [ ] **Step 1: Write the failing test** `e2e/app-welcome.spec.ts`

```ts
const signInDialog = (page: Page) => page.getByRole('dialog', { name: 'Sign in to PulseFit' });

async function openPanel(page: Page): Promise<void> {
  await useAppMode(page); await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
}

test('the first launch shows three slides, then the panel; the next launch opens on the panel', async ({ page }) => {
  await useAppMode(page); await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Strength floor' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Zumba studio' })).toBeInViewport();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Rewards & gifts' })).toBeInViewport();
  await page.getByRole('button', { name: 'Get started' }).click();
  for (const name of ['Sign in', 'Create account', 'Get a free pass', 'Contact us', 'Explore first']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Strength floor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('Sign in opens the sign-in dialog and a member lands on Home', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await signInDialog(page).getByRole('button', { name: /^Member/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(tabBar(page)).toBeVisible();
});

test('a coach who signs in from the panel gets the website layout, and signing out returns to the panel', async ({ page }) => {
  await offerApp(page); await openPanel(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await signInDialog(page).getByRole('button', { name: /^Coach/ }).click();
  await expect(page).toHaveURL(/\/trainer$/);
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'PulseFit Android app' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await expect(signInDialog(page)).toHaveCount(0);
});

test('Create account and Get a free pass open their forms; Contact us opens contact in the guest shell', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('dialog', { name: 'Create your account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Get a free pass' }).click();
  await expect(page.getByRole('dialog', { name: 'Claim a free 1-day pass' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Contact us' }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(tabBar(page).getByRole('link')).toHaveText(['Explore', 'Contact']);
  await expect(tabBar(page).getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(tabBar(page).getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page');
});

test('Explore first opens the public home with guest tabs; gated pages still ask to sign in; it is not remembered', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('button', { name: 'Explore first' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /YOUR GYM FOR/ })).toBeVisible();
  await expect(tabBar(page).getByRole('link')).toHaveText(['Explore', 'Contact']);
  await page.getByRole('main').locator('a[href="/schedule"]').first().click();
  await expect(signInDialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
});

test('signing out from Me opens the panel without slides and without the sign-in dialog', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Strength floor' })).toHaveCount(0);
  await expect(signInDialog(page)).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-welcome.spec.ts --project=mobile`
Expected: FAIL (no heading "Strength floor"; guests still get the website).

- [ ] **Step 3: Implement** `isFirstLaunch`, the guest tabs and action tab, `WelcomeScreen` and the `'guest'` shell.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-welcome.spec.ts e2e/app-shell.spec.ts e2e/app-me.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/access.spec.ts e2e/smoke.spec.ts` → PASS (gating and the website unchanged). `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/app-welcome.spec.ts
git commit -m "App mode: welcome slides on first launch, sign-in panel and guest shell for explorers"
```

---

### Task 8: Animations

**Files:**
- Create: `client/src/lib/appMotion.ts`, `e2e/app-motion.spec.ts`
- Modify: `client/src/index.css`, `client/src/context/NavigationContext.tsx` (`navigate` and its options, the `popstate` handler), `client/src/components/app/tabs.ts` (`navKindFor`), `client/src/components/app/AppShell.tsx`, `client/src/pages/app/*.tsx`, `client/src/components/layout/Navbar.tsx` (`handleLogout`, the demo bar's Guest button), `e2e/helpers.ts` (`Window.__vt`)

**Interfaces:**
- Produces (`appMotion.ts`): `prefersReducedMotion(): boolean` (`matchMedia('(prefers-reduced-motion: reduce)').matches`); `withViewTransition(kind: 'tab' | 'push' | 'pop', update: () => void): void` — calls `update()` directly unless `isAppMode`, `document.startViewTransition` exists and motion is allowed; otherwise sets `document.documentElement.dataset.nav = kind` and runs `document.startViewTransition(() => flushSync(update))`; `useCountUp(target: number, durationMs = 350): number` — `requestAnimationFrame` ease-out from 0 to `target` on mount and on change; returns `target` at once under reduced motion.
- Produces (`tabs.ts`): `navKindFor(tab: string, params: URLSearchParams): 'tab' | 'push'` — `'tab'` when `isTabRoot(MEMBER_TABS, tab, params) || isTabRoot(GUEST_TABS, tab, params)`, else `'push'` (so `/profile?tab=security` slides in and back out).
- `NavigationContext`: `navigate(tab, params?, options?: { replace?: boolean; instant?: boolean })` wraps its `pushState`/`setLocation`/`scrollTo` in `withViewTransition(navKindFor(route?.tab ?? '', search), …)` unless `options.instant`; `popstate` wraps `setLocation(readLocation())` in `withViewTransition('pop', …)`. Outside app mode both are plain calls (website unchanged).
- Sign-out paths navigate with `{ instant: true }`, so `user = null` and the new page render together (a deferred transition update would first render the old gated page signed out, which opens the sign-in dialog): `MeScreen`'s Sign out, and in `Navbar` `handleLogout` and the demo bar's Guest button, which take `navigate` from `useNavigation()` for this: `navigate('home', undefined, { instant: true })`.
- CSS (app classes only; all inside `@media (prefers-reduced-motion: no-preference)` or switched off under `reduce`):
  - `::view-transition-old(root), ::view-transition-new(root) { animation-duration: 200ms; animation-timing-function: ease-out }` (cross-fade); `html[data-nav='push']::view-transition-new(root) { animation: 280ms ease-out both app-slide-in }` (`from { transform: translateX(100%) }`), `html[data-nav='push']::view-transition-old(root) { animation: none }`; `html[data-nav='pop']::view-transition-old(root) { animation: 280ms ease-out both app-slide-out; z-index: 1 }` (`to { transform: translateX(100%) }`), `html[data-nav='pop']::view-transition-new(root) { animation: none }`; `.app-tabbar { view-transition-name: app-tabbar }` (the bar stays put); `::view-transition { pointer-events: none }`.
  - `.app-rise { animation: app-rise 300ms ease-out both; animation-delay: calc(min(var(--i, 0), 7) * 40ms) }`, `@keyframes app-rise { from { opacity: 0; transform: translateY(12px) } }`; screens put `.app-rise` and inline `--i` = the card's index in the screen (0, 1, 2… in DOM order) on each top-level card (Home sections, class cards, Pass card, Train cards, Me sections, welcome panel buttons).
  - `@property --app-ring { syntax: '<percentage>'; inherits: false; initial-value: 0% }`; `.app-ring { animation: app-ring 350ms ease-out both }`, `@keyframes app-ring { from { --app-ring: 0% } }`.
  - `.app-fill-x { transform-origin: left; animation: app-fill-x 350ms ease-out both }` (`from { transform: scaleX(0) }`) on progress bars; `.app-fill-y` (origin bottom, `scaleY(0)`) on the volume bars.
  - `.app-press { transition: transform 150ms ease-out, box-shadow 150ms ease-out }`, `.app-press:active:not(:disabled) { transform: scale(.97); box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light) }` on quick actions, tiles, chips, rows and buttons.
  - `.app-shimmer { background: linear-gradient(90deg, var(--neu-inset-bg) 25%, var(--gym-800) 50%, var(--neu-inset-bg) 75%); background-size: 200% 100%; animation: app-shimmer 1.2s linear infinite }`.
  - `@media (prefers-reduced-motion: reduce) { .app-rise, .app-ring, .app-fill-x, .app-fill-y, .app-shimmer { animation: none } .app-press:active { transform: none } }`.
- `useCountUp` drives the streak number and the Rewards balances: the moving number is `aria-hidden` with `data-count-up`, the final value sits in an sr-only span.

- [ ] **Step 1: Write the failing test** `e2e/app-motion.spec.ts`

```ts
async function countTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__vt = 0;
    const start = Document.prototype.startViewTransition;
    if (!start) return;
    Document.prototype.startViewTransition = function (this: Document, ...args: Parameters<typeof start>) {
      window.__vt = (window.__vt ?? 0) + 1;
      return start.apply(this, args);
    };
  });
}
const transitions = (page: Page) => page.evaluate(() => window.__vt ?? 0);
const navKind = (page: Page) => page.evaluate(() => document.documentElement.dataset.nav);

test('cards rise in with a 40 ms stagger capped at the eighth, within 150–350 ms', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await expect(page.locator('.app-rise').first()).toBeVisible();
  const styles = await page.locator('.app-rise').evaluateAll(els => els.map(el => {
    const s = getComputedStyle(el);
    return [s.animationName, s.animationDuration, s.animationDelay];
  }));
  expect(styles.length).toBeGreaterThan(1);
  styles.forEach((style, i) => expect(style).toEqual(['app-rise', '0.3s', `${Math.min(i, 7) * 0.04}s`]));
});

test('tab switches cross-fade, sub-screens slide in and Back slides out', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await expect.poll(() => transitions(page)).toBe(1);
  expect(await navKind(page)).toBe('tab');
  await tabBar(page).getByRole('link', { name: 'Me' }).click();
  await page.getByRole('link', { name: 'Password & two-step sign-in' }).click();
  await expect(page).toHaveURL(/\/profile\?tab=security$/);
  expect(await navKind(page)).toBe('push');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(await navKind(page)).toBe('pop');
});

test('without startViewTransition pages switch instantly and nothing breaks', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await page.addInitScript(() => { delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition; });
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await tabBar(page).getByRole('link', { name: 'Me' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(errors).toEqual([]);
});

test('reduced motion turns every animation off and shows final numbers at once', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countTransitions(page); await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/dashboard');
  await expect(page.locator('.app-rise').first()).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('progressbar', { name: 'Sessions this week' })).toBeVisible();
  expect(await page.locator('[data-count-up]').first().textContent()).toBe(String(me.streak_days));
  await tabBar(page).getByRole('link', { name: 'Classes' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  expect(await transitions(page)).toBe(0);
});

test('buttons press in and lists shimmer while loading', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  await page.route('**/api/bookings/my*', async route => { await new Promise(r => setTimeout(r, 1_000)); await route.continue(); });
  await page.goto('/dashboard');
  const shimmer = page.getByRole('status', { name: 'Loading upcoming classes' });
  await expect(shimmer).toBeVisible();
  await expect(shimmer.locator('.app-shimmer').first()).toHaveCSS('animation-name', 'app-shimmer');
  await expect(shimmer).toHaveCount(0);
  const pressRule = await page.evaluate(() => [...document.styleSheets]
    .flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
    .some(rule => rule.cssText.includes('.app-press:active') && rule.cssText.includes('scale(0.97)')));
  expect(pressRule).toBe(true);
});

test('signing out while view transitions run shows the panel without the sign-in dialog', async ({ page, request }) => {
  await countTransitions(page); await useAppMode(page); await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await tabBar(page).getByRole('link', { name: 'Me' }).click();
  await expect.poll(() => transitions(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Explore first' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in to PulseFit' })).toHaveCount(0);
});
```
`e2e/helpers.ts`: `Window` gains `__vt?: number`. From this task on, `app-welcome.spec.ts`'s two sign-out tests (a member through Me, a coach through Navbar) run with view transitions on and must still pass.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/app-motion.spec.ts --project=mobile`
Expected: FAIL (animation-name is `none`).

- [ ] **Step 3: Implement** `appMotion.ts`, `navKindFor`, the `NavigationContext` wrapping and `instant`, the sign-out paths, the CSS, and the classes, `--i` and `useCountUp` in the screens.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/app-motion.spec.ts e2e/app-shell.spec.ts e2e/app-home.spec.ts e2e/app-classes.spec.ts e2e/app-train.spec.ts e2e/app-me.spec.ts e2e/app-welcome.spec.ts --project=mobile` → PASS. Run: `npx playwright test e2e/smoke.spec.ts e2e/fix-core-ui.spec.ts` → PASS (navigation unchanged on the website). `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/app-motion.spec.ts e2e/helpers.ts
git commit -m "App mode: view transitions, rising cards, filling ring and bars, count-up, press and shimmer; off for reduced motion"
```

---

### Task 9: Active days this week and longest streak from the server

The existing data cannot give these cheaply on the phone (four requests plus a copy of the streak rule, and the whole history for the longest run), so `GET /auth/me` adds them.

**Files:**
- Create: `server/tests/streakFacts.test.ts`
- Modify: `server/src/lib/streak.ts`, `server/src/controllers/authController.ts` (`getMe`), `client/src/pages/app/HomeScreen.tsx` (`refreshUser` on mount), `docs/API.md` (`GET /auth/me` row), `e2e/app-home.spec.ts`

**Interfaces:**
- Produces (`streak.ts`): `activeDaysInWeek(days: Set<string>, today = gymToday()): number` — the days `d` with `startOfWeek(today) <= d <= addDays(startOfWeek(today), 6)` (`startOfWeek`, `addDays` from `lib/dates.ts`).
- Changes (`getMe`): `const days = activityDays(user.id)`; answers `{ ...toSafeUser(user), active_days_this_week: activeDaysInWeek(days), longest_streak_days: longestRun(days) }`. Only this endpoint carries them; `toSafeUser` is unchanged (member lists stay cheap).
- `docs/API.md`: `GET /auth/me` → `SafeUser` plus `active_days_this_week` (days this gym week, Monday–Sunday, with streak activity: staff check-in, attended class, completed floor session, workout logged on its own day) and `longest_streak_days` (the longest run by the streak rule over all history).
- `HomeScreen`: `useEffect(() => { refreshUser(); }, [refreshUser])`, so the numbers are fresh each time Home opens. Task 3's streak cases mock `GET /auth/me`, so they stay valid.

- [ ] **Step 1: Write the failing test** `server/tests/streakFacts.test.ts` (history rows carry only the fields `activityDays` reads)

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { activeDaysInWeek } from '../src/lib/streak.js';
import { addMember, api, authHeader, db, resetDb } from './helpers.js';

beforeEach(() => {
  resetDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T04:30:00Z'));   // Thu 19 Nov 2026, 10:00 at the gym; week Mon 16 – Sun 22
});
afterEach(() => vi.useRealTimers());

const me = async (email: string) => (await api().get('/api/auth/me').set(authHeader(email))).body.data;

it("activeDaysInWeek counts the days in today's gym week, Monday to Sunday", () => {
  const days = new Set(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-19', '2026-11-23']);
  expect(activeDaysInWeek(days, '2026-11-19')).toBe(3);
  expect(activeDaysInWeek(days, '2026-11-22')).toBe(3);
  expect(activeDaysInWeek(days, '2026-11-23')).toBe(1);
});

it("GET /auth/me counts this week's active days by the streak rule", async () => {
  const m = addMember();
  db.attendance_logs.push({ user_id: m.id, check_in_time: '2026-11-16T04:00:00Z' } as never);               // Mon: counts
  db.attendance_logs.push({ user_id: m.id, check_in_time: '2026-11-15T04:00:00Z' } as never);               // Sun 15: last week
  db.workouts.push({ user_id: m.id, date: '2026-11-17', created_at: '2026-11-17T12:00:00Z' } as never);      // Tue, logged that day
  db.workouts.push({ user_id: m.id, date: '2026-11-18', created_at: '2026-11-19T03:00:00Z' } as never);      // Wed, back-dated: no
  db.bookings.push({ user_id: m.id, status: 'attended', booking_date: '2026-11-19' } as never);               // Thu: counts
  db.bookings.push({ user_id: m.id, status: 'confirmed', booking_date: '2026-11-18' } as never);              // confirmed: no
  db.time_sessions.push({ user_id: m.id, status: 'active', clock_in_time: '2026-11-18T04:00:00Z' } as never); // still open: no
  expect((await me(m.email)).active_days_this_week).toBe(3);
});

it('longest_streak_days is the longest run, stepping over Sundays', async () => {
  const m = addMember();
  for (const d of ['02', '03', '04', '05', '06', '07', '09', '11', '12']) db.attendance_logs.push({ user_id: m.id, check_in_time: `2026-11-${d}T04:00:00Z` } as never);
  expect((await me(m.email)).longest_streak_days).toBe(7);   // Mon 2 – Mon 9 over the closed Sun 8; Tue 10 missed
});

it('a member with no history gets 0 and 0, and other answers do not carry the numbers', async () => {
  const m = addMember();
  expect(await me(m.email)).toMatchObject({ active_days_this_week: 0, longest_streak_days: 0 });
  const updated = await api().put('/api/auth/profile').set(authHeader(m.email)).send({ name: 'New Name' });
  expect(updated.body.data).not.toHaveProperty('active_days_this_week');
});
```
In `e2e/app-home.spec.ts`, add:

```ts
test('the streak card shows the real numbers from GET /auth/me', async ({ page, request }) => {
  await useAppMode(page); const token = await signInAs(page, request, 'member');
  const me = (await (await request.get('/api/auth/me', { headers: auth(token) })).json()).data;
  await page.goto('/dashboard');
  await expect(page.getByText(`${me.active_days_this_week} of 5 sessions this week`)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Sessions this week' })).toHaveAttribute('aria-valuenow', String(Math.min(me.active_days_this_week, 5)));
  await expect(page.getByText(/beat your best/)).toHaveCount(me.longest_streak_days > me.streak_days ? 1 : 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/streakFacts.test.ts`
Expected: FAIL (`activeDaysInWeek` is not exported).

- [ ] **Step 3: Implement** `activeDaysInWeek`, the `getMe` answer, the doc row and Home's refresh.

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run tests/streakFacts.test.ts tests/auth.test.ts tests/activity.workouts.test.ts tests/rewards.launch.test.ts` → PASS. Run: `npx playwright test e2e/app-home.spec.ts --project=mobile` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add server/src/lib/streak.ts server/src/controllers/authController.ts server/tests/streakFacts.test.ts client/src/pages/app/HomeScreen.tsx docs/API.md e2e/app-home.spec.ts
git commit -m "GET /auth/me: active days this week and longest streak for the app's streak card"
```

---

### Task 10: Changelog and APK 1.1.0

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]`), `client/android/app/build.gradle` (`defaultConfig`)

- [ ] **Step 1: Add the changelog entry** under `[Unreleased]` → Added: "**The app looks like an app (Android 1.1.0).** Inside the Android and iOS apps, members get a bottom tab bar (Home · Classes · Pass · Train · Me) and new screens in the soft neumorphic, lime look, in light and dark: a streak card with this week's sessions, one-tap class booking on the gym's open days, the entry pass, a quick workout logger, and Me with the ID card, freeze switch, plans, invoices, rewards and every page of the website. Guests get a welcome screen. Screens animate smoothly, and not at all when the phone asks for reduced motion. Coaches, admins and the website are unchanged. `GET /api/auth/me` adds `active_days_this_week` and `longest_streak_days`." Mention it in the section's opening paragraph.

- [ ] **Step 2: Bump the app version:** `versionCode 2`, `versionName "1.1.0"`.

- [ ] **Step 3: Verify**

Run: `grep -nE 'versionCode 2$|versionName "1.1.0"' client/android/app/build.gradle` → both lines.
Release (owner, only after the backend with Tasks 1–9 is deployed), from the repo root: `npm --prefix client run mobile:release` (the root `package.json` has no `mobile:release` script) → ends with `✅ PulseFit 1.1.0 (versionCode 2), built against https://pulsefit.up.railway.app`, with neither the guide nor the test-switch check failing.

- [ ] **Step 4: Commit** (owner-approved only)

```bash
git add CHANGELOG.md client/android/app/build.gradle
git commit -m "App 1.1.0: changelog and version bump for the new app look"
```

---

### Task 11: Full verification and the visual check

**Files:**
- Create: `e2e/app-visual.spec.ts`

- [ ] **Step 1: Write the test** `e2e/app-visual.spec.ts`

```ts
for (const theme of ['light', 'dark'] as const) {
  test(`Home matches the handoff tokens in ${theme}`, async ({ page, request }, testInfo) => {
    await useAppMode(page, { theme }); await signInAs(page, request, 'member');
    await page.goto('/dashboard');
    const dark = theme === 'dark';
    await expect(page.locator('body')).toHaveCSS('background-color', dark ? 'rgb(15, 20, 29)' : 'rgb(230, 235, 242)');
    await expect(page.locator('#root > div').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const backdrop = page.locator('.app-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS('z-index', '-1');   // behind the cards (elementFromPoint skips it: pointer-events none)
    expect(await backdrop.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('radial-gradient(');
    const streak = page.getByRole('region', { name: 'Day streak' });
    const box = (await streak.boundingBox())!;
    expect(await streak.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true);
    const bar = tabBar(page);
    await expect(bar).toHaveCSS('height', '58px');
    await expect(bar).toHaveCSS('background-color', dark ? 'rgba(20, 27, 39, 0.55)' : 'rgba(255, 255, 255, 0.55)');
    await expect(bar.getByRole('link', { name: 'Home' })).toHaveCSS('color', dark ? 'rgb(163, 230, 53)' : 'rgb(63, 98, 18)');
    await expect(bar.getByRole('link', { name: 'Classes' })).toHaveCSS('color', 'rgb(100, 116, 139)');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCSS('font-weight', '900');
    await expect(h1).toHaveCSS('font-size', '24px');
    expect(await h1.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"?Outfit/);
    await expect(streak).toHaveCSS('border-radius', '24px');
    await expect(page.getByRole('main').getByRole('button', { name: 'Pass', exact: true })).toHaveCSS('border-radius', '18px');
    expect(await page.getByRole('button', { name: 'Log workout' }).evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient(135deg, rgb(163, 230, 53), rgb(132, 204, 22))');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe('none');
    await page.screenshot({ path: testInfo.outputPath(`home-${theme}.png`) });
  });
}

test('every tab screen keeps the 20 px gutter', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  for (const path of ['/dashboard', '/schedule', '/pass', '/log-workout', '/profile']) {
    await page.goto(path);
    expect((await page.locator('.app-screen > *').first().boundingBox())!.x).toBe(20);
  }
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/app-visual.spec.ts --project=mobile`
Expected: PASS. A failure points to the token or class from Task 1 that drifted: fix it there.

- [ ] **Step 3: Compare by eye** each `home-<theme>.png` with `docs/design/pulsefit-mobile-handoff/screenshots/1a-member-home-<theme>.png` (data differs; layout, colours, radii, shadows, glows and type must match, except the light lime text, which is `#3f6212` by the accessibility rule). Note any difference for the owner, with the value the handoff pins.

- [ ] **Step 4: Run every suite**

Run: `cd server && npx vitest run` → all PASS. Run (repo root): `npx playwright test` → all PASS on desktop and mobile (the website suite unchanged). Run: `npm run typecheck` → no errors. Then `npm run build --prefix client` and `grep -rl pulsefit_test_app_mode client/dist || echo clean` → `clean` (the e2e run leaves an e2e build in `client/dist`; deployments build from source).

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add e2e/app-visual.spec.ts
git commit -m "E2E: the app's Home against the handoff tokens in light and dark"
```
