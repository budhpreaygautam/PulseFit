# Handoff: PulseFit Mobile Apps (Member, Coach, Front Desk, Admin)

## Overview
Mobile redesign of the PulseFit Athletics gym app (existing repo: `gym-webapp`, React 18 + Vite + Tailwind + Capacitor). Four role-based phone UIs sharing one visual language: **dark/light neumorphism with a frosted-glass layer, lime accent**. Both Dark and Light themes are designed.

## About the Design Files
`PulseFit Mobile.dc.html` is a **design reference built in HTML** — a prototype showing intended look and behavior, not production code. Recreate it in the existing `client/` codebase (React + Tailwind, Capacitor wrapper) using its established patterns: `neu-flat`, `neu-btn`, `neu-btn-lime`, `neu-pressed-sm`, `font-heading`, `gym-*` colors, `ThemeContext` (`.dark` / `.light`). Don't ship the HTML. Phone bezel, status bar and home indicator are mock chrome only — do not build them.

## Fidelity
**High-fidelity.** Colors, type, spacing, shadows and interactions are final. Recreate pixel-accurately with the codebase's tokens. Icons are FontAwesome Free solid in the mock; the repo uses `lucide-react` — map to the nearest lucide icon (house, calendar, qr-code, dumbbell, user, flame, snowflake, clipboard-list, camera, pen, chart-line, users, target, file-text, download, check).

## Global layout (all apps)
- Viewport 390×800 (content area 390 wide). Status bar 44px (system). Scrollable content: padding `8px 20px 24px`, hidden scrollbar.
- Bottom tab bar: 84px tall (incl. 34px home-indicator safe area), `padding 8px 8px 0`, background `--bar`, 1px top border `--bd`, `backdrop-filter: blur(14px)`. Tab = icon 17px above 10px/700 label, gap 5px, 50px tall. Active color `--lime`, inactive `--mu2`.
- Page titles: Outfit 900 26px. Section titles: Outfit 800 15–16px. Body: Inter 12–13px. Captions 10–11px, weight 700 for labels. Eyebrow labels 11px/700, letter-spacing .08em, uppercase.

## Screens / Views

### 1a — Member app (tabs: Home, Classes, Pass, Train, Me)
**Home**: Header row (56px avatar tile radius 16, 2px border `rgba(132,204,22,.5)`, initials Outfit 800 20px lime; "Hi, {first name}" Outfit 900 24px; plan name 12px/700 + "Active" pill (10px/700, bg `rgba(132,204,22,.15)`, lime text); "Valid through {date}" 11px). Then:
1. Streak card (radius 24, glass+neu): 84px conic ring (`#84cc16` to 72%, track `--inset`), centre number Outfit 900 24px + flame "DAYS"; title "Day streak" Outfit 800 15px; helper "Sundays don't break it…"; "4 of 5 sessions this week" lime 11px/700.
2. 3-up quick actions (gap 12, radius 18, padding 14 4): Pass, ID card (neu buttons), **Log workout** (lime gradient `135deg #a3e635→#84cc16`, text `#090c10`, glow `0 0 25px -5px rgba(132,204,22,.45)`).
3. "Upcoming classes" card with "Timetable →" link; rows are inset wells (radius 16, `inset` shadow) showing time/day, class, coach, check icon. Empty: "No upcoming classes. Book a spot from the timetable."
4. "Note from your coach" card with inset note well.

**Classes**: Day chips Mon–Fri (flex 1, radius 14; selected = lime gradient, else neu raised). Class cards (radius 22, 50px icon tile tinted per type: strength lime, HIIT amber `#f59e0b`, Zumba pink `#ec4899`; name Outfit 800 15px; "time · coach"; spots line 10px/700). Button states: **Book** (lime), **Booked** (inset well, lime text), **Waitlist** when 0 spots (amber text, raised). Tapping toggles booking; booked classes appear on Home.

**Pass**: Card (radius 28, `neu-flat-lg`) with white 21×21 QR (8px cells, 14px white padding, radius 18), name Outfit 800 18px, "ID · plan", status pill "Active · refreshes in 0:42". Helper text below. QR must be real, rotating token (existing `DigitalQrPassModal`).

**Train** (workout logger): header + "Push day · 38 min"; weekly volume bar chart (7 bars, today lime `#84cc16`, others `--chip2`, 70px high); exercise cards (name, "n sets", set chips like `60×8` in inset pills, **Add set (repeat last)** outlined lime button); full-width **Finish workout** lime button → toggles to saved state "Saved · nice work, 3 PRs".

**Me**: Digital ID card (gradient chip→card, radius 24, brand "⚡ PulseFit", MEMBER ID label, 64px avatar, name, id, validity); **Freeze membership** row with 52×30 switch (on = cyan `#06b6d4`, knob 22px) and explanatory copy that changes with state; **Plans** list (selected plan border `rgba(132,204,22,.5)`, price Outfit 900 17px lime, label CURRENT/SWITCH); **Invoices** card (3 rows: file icon, INV number, date, amount, download icon).

### 1b — Coach app (tabs: Classes, Scan, Notes)
**Classes**: "TODAY · THU 20 NOV" eyebrow + "Coach {name}". Current-class card: "NOW · 18:00–19:00", class name, present count `n/total` (Outfit 900 26px lime), 8px progress bar (inset track, lime fill). Roster rows (radius 18): 40px initials tile, name, note (e.g. "Knee injury noted"), 28px round toggle (present = lime fill + check; absent = inset + minus). Tap row toggles attendance.
**Scan**: 290px black viewfinder (radius 26) with 190px frame, four lime 4px corner brackets, animated scan line, caption. **Scan** primary button; result card shows member name + status (success = lime border/check; failure = red `rgba(239,68,68,.4)` border/x, e.g. expired).
**Notes**: category chips (Progress, Assessment, Injury, General), inset textarea well, "Share with member" lime button, list of prior notes (author · category, body).

### 1c — Front desk (single screen, no tab bar)
Header "Check-in" with live "ON THE FLOOR" count (Outfit 900 30px lime). 210px viewfinder with dashed lime frame and animated scan line. Buttons: **Scan pass** (lime) + **Enter ID** (neu). Result banner (green success / red failure with reason, e.g. "Membership expired… send to desk"). Two stat tiles (Today's check-ins, Trial leads "3 new" amber). "Recent" list: initials tile, name, plan, time, method (QR / Front desk).

### 1d — Admin app (tabs: Overview, Members, Leads)
**Overview**: eyebrow "PULSEFIT · GURUGRAM", revenue card (₹ amount Outfit 900 30px, "+12%" pill, 12 monthly bars 84px high, selected bar lime — tap to select; caption "{Month} · ₹x collected"); 2×2 stat tiles (Active members, Expiring in 7 days, Today check-ins, Avg class fill); "Busiest classes this week" with fill bars.
**Members**: filter chips (All/Active/Expiring/Expired); rows with initials tile, name, "plan · end date", status pill (Active lime, Expiring amber `#d97706`, Expired red `#ef4444`).
**Leads**: trial-pass leads with name, meta line, **Call** (lime) → **Contacted** (inset, lime text) toggle.

## Interactions & Behavior
- Tab bars switch screens instantly (no transition specified). Toggles/buttons: `transition: all .2s ease`; switch knob animates `left .2s`; progress bar width `.25s`.
- Scan lines alternate between 20% and 80% every ~900ms (`top .6s`).
- Light/Dark toggle switches the token set below; follow the app's existing `ThemeContext`.
- Mock simulations to replace with real behavior: QR/camera scanning (use existing check-in API), booking, attendance, freeze, plan change, lead status, notes.

## State Management
Per app: current tab; Member: selected day, booked class ids, logged sets per exercise, workout finished flag, freeze flag, current plan. Coach: present map, scan result, note category, notes list. Desk: feed, floor count, last scan result. Admin: selected revenue month, member filter, lead contacted map. Data comes from existing endpoints (`getMyBookings`, `getPlans`, `getMyNotes`, attendance, check-in, admin revenue/members/leads — see `docs/API.md`).

## Design Tokens
**Fonts**: Outfit (headings, big numbers, 700–900), Inter (UI, 400–800).
**Dark**: bg `#0f141d`, card `rgba(30,41,59,.5)` (glass; solid `#141b27`), inset `#0c1017`, shadow-dark `#080b10`, shadow-light `#1e2838`, chip `#202b3d`, chip2 `#2c3b52`, text `#f1f5f9` / `#e2e8f0` / `#cbd5e1`, muted `#94a3b8` / `#64748b`, lime text `#a3e635`, border `rgba(255,255,255,.10)`, bar `rgba(20,27,39,.55)`.
**Light**: bg `#e6ebf2`, card `rgba(255,255,255,.5)` (solid `#ecf1f8`), inset `#dfe5ee`, shadow-dark `#b8c3d1`, shadow-light `#ffffff`, chip `#dce3ee`, chip2 `#c5d0df`, text `#0f172a` / `#1e293b` / `#334155`, muted `#475569` / `#64748b`, lime text `#4d7c0f`, border `rgba(255,255,255,.9)`, bar `rgba(255,255,255,.55)`.
**Accents**: lime `#84cc16` / glow `#a3e635`; amber `#f59e0b`; crimson `#ef4444`; cyan `#06b6d4`; pink `#ec4899`. Lime button gradient `135deg #a3e635 → #84cc16`, text `#090c10`.
**Backdrop glows** (behind content, per phone): radial lime (15% 12%), cyan (95% 45%), pink (10% 88%), ~220–260px, alpha .18–.35 dark / .2–.35 light.
**Radii**: cards 22–28, inner wells 16–18, tiles 14–16, chips/pills 99, buttons 12–16.
**Shadows**: raised `6px 6px 14px shadow-dark, -6px -6px 14px shadow-light` (hero `8px/18px`, buttons `5px/12px`); inset `inset 3px 3px 6px shadow-dark, inset -3px -3px 6px shadow-light`.
**Glass layer**: on cards `backdrop-filter: blur(16px) saturate(160%)`, `inset 1px 1px 0 rgba(255,255,255,.14)`, 1px border `--bd`, overlay `linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.02) 45%, transparent)` (light: `.7 → .1`). Tab bar blur 14–20px.
**Spacing**: screen gutter 20; section gap 16–18; card padding 14–18; chip gap 8–12.

## Assets
No bitmap assets. Avatars are initials tiles (replace with existing `avatarOf(user)` images). QR is a decorative placeholder. Icons: FontAwesome Free solid in mock → use `lucide-react` in the app. Fonts via Google Fonts (Inter, Outfit) — already in the repo.

## Files
- `PulseFit Mobile.dc.html` — the full prototype (all four apps, interactive, Dark/Light toggle in the header).
