# Rewards, Gifts and Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members earn points and gifts for staff-confirmed visits, same-day workouts, milestones, joining and referrals, spend points on gifts collected at the front desk, and pay sale or coupon prices that only the server computes.

**Architecture:** Everything lives in the existing Express server and JSON-file DB: six new collections, an append-only points ledger whose unique keys make every award (points *and* gifts) idempotent, small `lib/` modules (points, gifts, milestones, referrals, pricing, activation) and hooks called from the existing check-in, class-attendance, workout and payment-activation code. Online payments and the new front-desk sale share one activation function. The client adds a member Rewards page, admin tabs under "Plans & rewards", gift hand-over in the check-in scanner, and sale/coupon display on Memberships and the home page.

**Tech Stack:** Express 4 + TypeScript + zod 4, Vitest + supertest (server); React 18 + Vite + Tailwind, Capacitor 8 (`@capacitor/share` is already a dependency), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-rewards-offers-design.md` (approved). Read it with this plan.

## Global Constraints

The spec holds the rules and their reasons; this section holds the exact values every task must match.

- **Point defaults** (editable): `points_per_checkin` 10, `points_per_workout` 5, `points_per_referral` 200, `welcome_points_for_referred` 50.
- **Who earns:** `earnsRewards` (Task 1) gates every points and gift award except admin adjustments: `role === 'member'` and effective status `active` or `frozen`.
- **Ledger keys** (unique across `points_ledger`): `checkin:<attendanceId>`, `workout:<userId>:<date>`, `milestone:<milestoneId>:<userId>`, `launch-gift:<userId>`, `join:<paymentId>`, `join-once:<giftId>:<userId>`, `referral:<referredUserId>`, `referral-welcome:<referredUserId>`, `claim:<claimId>`, `refund:<claimId>`, `adjust:<uuid>`. Gift awards are 0-point `bonus` entries carrying their key. Balance = sum of a member's entries; nothing is stored.
- **Claims:** statuses `needs_size | waiting | ready | handed_over | cancelled`. Stock is taken when a claim becomes `ready` and given back when a `ready` claim is cancelled or its member is deleted; given-back or added stock promotes `waiting` claims oldest first. Automatic claims (milestone, joining, launch) never fail for stock. Sizes `S, M, L, XL, XXL` with `stock_by_size`; `stock: null` = unlimited.
- **Point-cost bands:** small 150–250, medium 300–500, big 700–1,200, premium 1,500–3,000.
- **Pricing:** best single discount (the larger of the live offer and the valid coupon; a tie goes to the offer), total floored at ₹1. Offers: `percent_off` 1–90 or `amount_off` in rupees. Coupon codes are trimmed and upper-cased, then must match `/^[A-Z0-9]{4,16}$/`; `per_member_limit` defaults to 1; `uses` grow only in `activateOrder`, inside its idempotency guard. Desk sales charge what staff collect (no offer or coupon); upgrade credit keeps list prices.
- **Coupon error codes:** 400 `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_USED_UP`, `COUPON_NOT_FOR_PLAN`; 429 `RATE_LIMITED` after 10 failed coupon attempts per user in 10 minutes. Every other code is in its task's table.
- **The server decides:** request bodies never carry points, prices or discounts.

**Sign-in gating** (lands before this plan; build on it, never undo it)
- `/pricing` is sign-in only; the home page is public and reads trimmed guest data; the guest projection of `GET /api/plans` (`getPlans`) is unchanged. Sale prices reach members through new signed-in endpoints; of the new endpoints guests get only `GET /promotions`, which carries no coupons, claims, stock counts or referral links. `SafeUser` never carries `referral_code` or `referred_by`.
- The gating and enquiry-form work edits `routes.ts`, `Navbar.tsx`, `admin/ui.tsx`, `App.tsx`, `AuthModal.tsx`, `PricingPage.tsx`, `LandingPage.tsx`, `planController.ts`, `authController.ts`, `memberController.ts`, `lib/seo.ts`, `seo.test.ts`, `e2e/fix-core-ui.spec.ts` and `docs/API.md`. Find code by symbol name, never by line number, and keep what those changes put there (the admin "Trial leads" link becomes "Leads").

**Engineering**
- No new runtime dependencies.
- Controllers: `asyncHandler` + `parse(zodSchema, input)` + `ok(res, data, message?, status?)`; errors through the `lib/http.ts` helpers with a `code`. New collections through `DatabaseSchema` + `emptySchema` + getter/setter; never mutate getter results. A request that writes ledger entries, claims, stock or coupon uses calls `db.saveSync()` before it answers.
- Server tests: `resetDb()` in `beforeEach`; `vi.useFakeTimers({ toFake: ['Date'] })` when dates matter. From Task 7 on, the demo seed gives personas points and claims and gives items stock, so tests count claims and entries only for `addMember()` members or as before/after differences, and set any stock they rely on.
- Show real data only: empty states, never invented numbers.
- `docs/API.md` is the contract: each task documents the behaviour it changes, in the same task.
- Commit only once the owner has approved committing; no Claude or AI attribution in messages; never push.

## Review Focus

1. **The coupon field as people type it:** `" welcome10 "` is applied as `WELCOME10`; `""` or `"  "` (an emptied field) means no coupon and the normal price, never `COUPON_INVALID` and never a rate-limit strike. Tests in Task 6.
2. **"Record" clicked twice on a desk sale:** a second identical desk sale (same member, tier, cycle and amount) within 2 minutes is refused with 409 `DESK_SALE_DUPLICATE` and creates no payment, period or gift. Test in Task 4; Task 11 disables the button while the request runs.
3. **An apparel claim for a size with no stock:** it waits with that size; stock added to another size leaves it waiting; stock added to its size promotes the oldest claim first. Test in Task 3.
4. **A gift edited after claims or rules use it:** a deactivated or renamed gift keeps its existing claims (name snapshot) collectable and leaves the store; removing a size that a `waiting` or `ready` claim holds is refused (409 `SIZE_IN_USE`); deactivating a gift that a milestone or joining rule names is refused (409 `GIFT_IN_RULES`). Tests in Task 3.
5. **A discounted YouPI order:** the YouPI session is opened for the discounted total; a SUCCESS for that total activates once and counts one coupon use; a SUCCESS for the list price is rejected. Test in Task 6.

## File Structure

New server modules (each task's **Files** lists everything it touches):
- `server/src/db/rewardDefaults.ts`: default catalogue (24 gifts, stable ids) and default reward settings. Pure data.
- `server/src/lib/points.ts`: who earns, award keys, balance.
- `server/src/lib/gifts.ts`: claim creation, per-size stock, pickup codes, gift grants, waiting-claim promotion, store projection.
- `server/src/lib/milestones.ts`: staff-confirmed visits and streak, crossing grants, launch step.
- `server/src/lib/rewardEvents.ts`: the hooks the existing controllers call (`onCheckIn`, `onClassAttended`, `onWorkoutLogged`, `onPaidActivation`).
- `server/src/lib/activation.ts`: one paid activation for online orders and desk sales (extracted from `activateOrder`).
- `server/src/lib/referrals.ts`: codes, lookup, first-payment credit.
- `server/src/lib/pricing.ts`: live offers, coupon checks, quotes.
- `server/src/controllers/rewardsController.ts`, `server/src/controllers/offerController.ts`, `server/src/routes/rewards.ts`, `server/src/db/seed/rewards.ts`.

New client files: `pages/member/RewardsPage.tsx`, `components/common/GiftImage.tsx`, `components/member/useGiftCelebration.ts`, `components/member/CouponField.tsx`, `components/admin/rewards/GiftCataloguePanel.tsx|PickupsPanel.tsx|OffersPanel.tsx|RulesPanel.tsx`, `components/admin/DeskSaleFields.tsx`.

Not built (the spec allows it or never asked): a Points column in the members table (member detail shows points), hard deletes of offers and coupons (`active: false` retires them), `?ref=` sign-up links (the shared text carries the code).

---

### Task 1: Data model, default catalogue and the points ledger

**Files:**
- Modify: `server/src/types/index.ts`, `server/src/db/database.ts`, `server/src/lib/users.ts` (`toSafeUser`), `server/src/controllers/memberController.ts` (`deleteMember`), `server/src/routes/api.ts`, `server/tests/helpers.ts`, `docs/API.md`
- Create: `server/src/db/rewardDefaults.ts`, `server/src/lib/points.ts`, `server/src/lib/gifts.ts`, `server/src/controllers/rewardsController.ts`, `server/src/routes/rewards.ts`
- Test: `server/tests/rewards.ledger.test.ts`

**Interfaces:**
- Produces (types, `server/src/types/index.ts`):
  ```ts
  export type GiftLevel = 'small' | 'medium' | 'big' | 'premium';
  export type GiftSize = 'S' | 'M' | 'L' | 'XL' | 'XXL';
  export interface Gift { id: string; name: string; description: string; image: string /* emoji, or an image data URL */; level: GiftLevel;
    points_cost: number | null /* null = reward-only */; stock: number | null /* null = unlimited; unused when sizes */; sizes?: GiftSize[];
    stock_by_size?: Partial<Record<GiftSize, number>>; kind: 'item' | 'service'; active: boolean; created_at: string }
  export type ClaimStatus = 'needs_size' | 'waiting' | 'ready' | 'handed_over' | 'cancelled';
  export type ClaimSource = 'store' | 'milestone' | 'joining';
  export interface GiftClaim { id: string; user_id: string; user_name: string; gift_id: string; gift_name: string; size?: GiftSize;
    source: ClaimSource; source_ref: string; points_spent: number; pickup_code: string; status: ClaimStatus; created_at: string;
    handed_over_at?: string; handed_over_by?: { id: string; name: string }; cancel_reason?: string }
  export type PointsReason = 'checkin' | 'workout' | 'referral' | 'claim' | 'refund' | 'admin_adjust' | 'bonus';
  export interface PointsEntry { id: string; user_id: string; key: string; points: number; reason: PointsReason; ref?: string; note?: string; created_at: string }
  export interface Milestone { id: string; type: 'visits' | 'streak'; threshold: number; gift_id: string }
  export interface JoiningGift { tier: Exclude<MembershipTier, 'none'>; billing_cycle: BillingCycle; gift_ids: string[]; once_per_member: boolean }
  export interface RewardSettings { points_per_checkin: number; points_per_workout: number; points_per_referral: number;
    welcome_points_for_referred: number; milestones: Milestone[]; joining_gifts: JoiningGift[]; launched_at?: string }
  export interface Offer { id: string; title: string; banner_text: string; percent_off: number | null; amount_off: number | null;
    tiers: Exclude<MembershipTier, 'none'>[] /* [] = all */; billing_cycles: BillingCycle[] /* [] = all */; starts_at: string; ends_at: string /* ISO */; active: boolean; created_at: string }
  export interface Coupon { code: string; percent_off: number | null; amount_off: number | null; tiers: Exclude<MembershipTier, 'none'>[]; billing_cycles: BillingCycle[];
    valid_from: string; valid_until: string /* gym dates, inclusive */; max_uses: number | null; per_member_limit: number; uses: number; active: boolean; created_at: string }
  export type DeskMethod = 'cash' | 'upi' | 'card';
  // User gains: referral_code?: string; referred_by?: string (user id)
  // SafeUser's Omit list gains 'referral_code' | 'referred_by'
  // PaymentOrder and Payment gain: base_amount_inr?: number; discount_inr?: number; offer_id?: string; coupon_code?: string
  // Payment gains: source adds 'desk'; desk_method?: DeskMethod; recorded_by?: { id: string; name: string }
  ```
- Produces (DB): collections `gifts`, `gift_claims`, `points_ledger`, `reward_settings` (one object), `offers`, `coupons` on `DatabaseSchema`, `emptySchema()` (which fills `gifts: defaultGifts()` and `reward_settings: defaultRewardSettings()`, so `load()` and `restore()` give an older file the defaults) and getters/setters.
- Produces (`server/src/db/rewardDefaults.ts`): `defaultGifts(createdAt?: string): Gift[]`, `defaultRewardSettings(): RewardSettings`. Gift ids: `gift_sticker_pack, gift_keychain, gift_sweatband, gift_skipping_rope, gift_sample_pack, gift_mug, gift_water_bottle, gift_shaker, gift_towel, gift_cap, gift_resistance_bands, gift_gloves, gift_tshirt, gift_lifting_straps, gift_wrist_wraps, gift_knee_sleeves, gift_yoga_mat, gift_tank_top, gift_hoodie, gift_duffel_bag, gift_foam_roller, gift_pt_session, gift_free_week, gift_guest_pass`. Milestone ids: `ms_visits_10, ms_streak_30, ms_visits_100, ms_visits_250`. Items start at stock 0 (apparel 0 per size; the gym enters real counts), services `null`; every gift priced inside its band, `active: true`.
- Produces (`server/src/lib/points.ts`):
  `earnsRewards(user: Pick<User, 'role' | 'membership_status' | 'membership_expiry'>, today?: string): boolean`,
  `hasAward(key: string): boolean`,
  `recordAward(entry: Omit<PointsEntry, 'id' | 'created_at'>): PointsEntry | null` (null when the key exists; never saves),
  `pointsBalance(userId: string): number`.
- Produces (`server/src/lib/gifts.ts`):
  `GIFT_SIZES: readonly GiftSize[]`, `hasStock(gift: Gift, size?: GiftSize): boolean`, `takeStock(giftId: string, size?: GiftSize): void`, `returnStock(giftId: string, size?: GiftSize): void`,
  `newPickupCode(): string` (6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unique among claims),
  `createClaim(user: User, gift: Gift, fields: { source: ClaimSource; source_ref: string; points_spent: number; size?: GiftSize }): GiftClaim` (status: `needs_size` when the gift has sizes and none is given; else `ready` + `takeStock` when `hasStock`; else `waiting`),
  `grantGifts(user: User, award: { key: string; gift_ids: string[]; source: 'milestone' | 'joining'; source_ref: string; note: string }): GiftClaim[]` (returns `[]` when the key exists; otherwise one 0-point `bonus` ledger entry with that key, then `createClaim` for each *active* gift id; missing or inactive ids are skipped, the key is still written).
- Produces (HTTP): `GET /rewards/ledger` (member) → `{ balance, items: PointsEntry[] newest first, total }`, query `limit` 1–100 (default 20), `offset`; `POST /members/:id/points` (admin) body `{ points: int −100000..100000, ≠ 0; note: 1–200 chars }` → `{ balance, entry }`, 400 `POINTS_NEGATIVE` when the balance would drop below 0. Handlers `getMyLedger`, `adjustPoints` in `rewardsController.ts`, routes in `routes/rewards.ts` (mounted in `routes/api.ts` before `notFoundHandler`).
- Produces (tests): `addMember(patch?: Partial<User>): User` in `server/tests/helpers.ts`: inserts an active `basic` member with expiry today + 30, no history, and returns it.

- [ ] **Step 1: Write the failing test** `server/tests/rewards.ledger.test.ts`

```ts
const BANDS = { small: [150, 250], medium: [300, 500], big: [700, 1200], premium: [1500, 3000] } as const;
const joining = (tier: string, cycle: string) => db.reward_settings.joining_gifts.find(j => j.tier === tier && j.billing_cycle === cycle);
beforeEach(() => resetDb());

describe('defaults', () => {
  it('has the 24-gift catalogue with costs inside each level band', () => {
    expect(db.gifts).toHaveLength(24);
    for (const g of db.gifts) { expect(g.points_cost!).toBeGreaterThanOrEqual(BANDS[g.level][0]); expect(g.points_cost!).toBeLessThanOrEqual(BANDS[g.level][1]); }
    expect(db.gifts.filter(g => g.sizes).map(g => g.id).sort()).toEqual(['gift_hoodie', 'gift_tank_top', 'gift_tshirt']);
    for (const g of db.gifts.filter(g => g.sizes)) expect(Object.keys(g.stock_by_size!).sort()).toEqual(['L', 'M', 'S', 'XL', 'XXL']);
    expect(db.gifts.filter(g => g.kind === 'service').map(g => g.stock)).toEqual([null, null, null]);
  });
  it('has the default rules', () => {
    expect(db.reward_settings).toMatchObject({ points_per_checkin: 10, points_per_workout: 5, points_per_referral: 200, welcome_points_for_referred: 50 });
    expect(db.reward_settings.milestones.map(m => [m.type, m.threshold, m.gift_id])).toEqual([
      ['visits', 10, 'gift_keychain'], ['streak', 30, 'gift_shaker'], ['visits', 100, 'gift_lifting_straps'], ['visits', 250, 'gift_hoodie']]);
    for (const t of ['basic', 'pro']) expect(joining(t, 'annual')).toMatchObject({ gift_ids: ['gift_tshirt', 'gift_shaker'], once_per_member: false });
    expect(joining('vip', 'annual')).toMatchObject({ gift_ids: ['gift_hoodie', 'gift_shaker', 'gift_water_bottle'], once_per_member: false });
    for (const t of ['basic', 'pro', 'vip']) expect(joining(t, 'monthly')).toMatchObject({ gift_ids: ['gift_sample_pack'], once_per_member: true });
  });
  it('gives a database written before rewards the default catalogue and rules', () => {
    const { gifts, gift_claims, points_ledger, reward_settings, offers, coupons, ...older } = db.snapshot();
    db.restore(older as DatabaseSchema);
    expect(db.gifts).toHaveLength(24); expect(db.reward_settings.points_per_checkin).toBe(10);
    expect([db.gift_claims, db.points_ledger, db.offers, db.coupons]).toEqual([[], [], [], []]);
  });
});

describe('ledger', () => {
  it('records an award once per key and sums the balance', () => {
    const m = addMember();
    expect(recordAward({ user_id: m.id, key: 'test:1', points: 10, reason: 'bonus' })).not.toBeNull();
    expect(recordAward({ user_id: m.id, key: 'test:1', points: 10, reason: 'bonus' })).toBeNull();
    recordAward({ user_id: m.id, key: 'test:2', points: -4, reason: 'claim' });
    expect(pointsBalance(m.id)).toBe(6);
  });
  it('lets only members with an active or frozen plan earn', () => {
    expect(earnsRewards(addMember())).toBe(true);
    expect(earnsRewards(addMember({ membership_status: 'frozen' }))).toBe(true);
    expect(earnsRewards(addMember({ membership_expiry: addDays(gymToday(), -1) }))).toBe(false);   // effectively expired
    expect(earnsRewards(addMember({ membership_status: 'pending', membership_tier: 'none', membership_expiry: null }))).toBe(false);
    expect(earnsRewards(addMember({ role: 'trainer' }))).toBe(false);
    expect(earnsRewards(addMember({ role: 'admin' }))).toBe(false);
  });
});

describe('grantGifts', () => {
  it('starts claims ready (taking stock), waiting at zero stock, needs_size for apparel, ready for services', () => {
    db.gifts = db.gifts.map(g => (g.id === 'gift_mug' ? { ...g, stock: 1 } : g.id === 'gift_cap' ? { ...g, stock: 0 } : g));
    const m = addMember();
    const claims = grantGifts(m, { key: 'test:join', gift_ids: ['gift_mug', 'gift_cap', 'gift_tshirt', 'gift_pt_session'], source: 'joining', source_ref: 'pmt_x', note: 'test' });
    expect(claims.map(c => [c.gift_id, c.status, c.points_spent])).toEqual([
      ['gift_mug', 'ready', 0], ['gift_cap', 'waiting', 0], ['gift_tshirt', 'needs_size', 0], ['gift_pt_session', 'ready', 0]]);
    expect(db.gifts.find(g => g.id === 'gift_mug')!.stock).toBe(0);
    expect(claims.every(c => /^[A-Z2-9]{6}$/.test(c.pickup_code))).toBe(true);
  });
  it('grants nothing twice for one key, writes one 0-point bonus entry, and skips inactive gifts', () => {
    db.gifts = db.gifts.map(g => (g.id === 'gift_cap' ? { ...g, active: false } : g));
    const m = addMember();
    const award = { key: 'test:k', gift_ids: ['gift_cap', 'gift_pt_session'], source: 'milestone' as const, source_ref: 'ms_x', note: 'test' };
    expect(grantGifts(m, award).map(c => c.gift_id)).toEqual(['gift_pt_session']);
    expect(grantGifts(m, award)).toEqual([]);
    expect(db.points_ledger.filter(e => e.key === 'test:k')).toEqual([expect.objectContaining({ points: 0, reason: 'bonus', user_id: m.id })]);
  });
});

describe('points API', () => {
  it('GET /rewards/ledger lists the member's own entries newest first with the balance', ...);   // two awards → items[0] is the later; balance; total; ?limit=1 → 1 item, total 2
  it('GET /rewards/ledger is for members only', ...);                                            // trainer and admin → 403
  it('POST /members/:id/points adds or removes points with a note', ...);                       // +100 → 200, entry.key starts 'adjust:', reason 'admin_adjust', note kept; balance 100
  it('POST /members/:id/points refuses a balance below zero, zero points and non-admins', ...);  // −101 → 400 POINTS_NEGATIVE; 0 → 400 VALIDATION_ERROR; member token → 403
});

it('keeps referral_code and referred_by out of SafeUser', () => {
  const safe = toSafeUser({ ...addMember(), referral_code: 'ABCD2345', referred_by: 'usr_x' });
  expect(safe).not.toHaveProperty('referral_code'); expect(safe).not.toHaveProperty('referred_by');
});
it('deletes a member's ledger entries and claims with the account', ...);   // award + grantGifts, DELETE /members/:id as admin → none left for that id
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/rewards.ledger.test.ts`
Expected: FAIL (cannot resolve `../src/lib/points.js`).

- [ ] **Step 3: Add the types and the default data** in `server/src/types/index.ts` and `server/src/db/rewardDefaults.ts` (Interfaces above).

- [ ] **Step 4: Add the six collections** to `DatabaseSchema`, `emptySchema()` and the getters/setters in `server/src/db/database.ts`. `migrate()` needs no change: `load()` and `restore()` spread `emptySchema()` under the file's data.

- [ ] **Step 5: Implement `server/src/lib/points.ts` and `server/src/lib/gifts.ts`** (Interfaces above). `earnsRewards` = `role === 'member'` and `effectiveStatus(user, today)` is `active` or `frozen`. Ids: `newId('pts')`, `newId('clm')`.

- [ ] **Step 6: Strip `referral_code` and `referred_by` in `toSafeUser`; make `deleteMember` also drop the member's `points_ledger` entries and `gift_claims`.**

- [ ] **Step 7: Add `getMyLedger` and `adjustPoints`** to `rewardsController.ts`; routes `GET /rewards/ledger` (`authenticate, requireRole(['member'])`) and `POST /members/:id/points` (admin) in `routes/rewards.ts`; mount it in `routes/api.ts`. `adjustPoints` key `adjust:${crypto.randomUUID()}`, then `db.saveSync()`. Add `addMember` to `tests/helpers.ts`.

- [ ] **Step 8: Document it in `docs/API.md`:** a new section "Rewards — owner: `rewards` (routes/rewards.ts, controllers/rewardsController.ts, lib/points.ts, gifts.ts)" with `GET /rewards/ledger` and "Additional rules" (who earns, the ledger key formats, balance = sum of entries); under Members, `POST /members/:id/points` and that deleting a member deletes their points and claims.

- [ ] **Step 9: Run the tests and the typecheck**

Run: `cd server && npx vitest run tests/rewards.ledger.test.ts` → PASS. Run (repo root): `npm run typecheck` → no errors.

- [ ] **Step 10: Commit** (only once the owner has approved committing; no AI attribution; never push)

```bash
git add server/src/types/index.ts server/src/db/database.ts server/src/db/rewardDefaults.ts server/src/lib/points.ts server/src/lib/gifts.ts server/src/lib/users.ts server/src/controllers/memberController.ts server/src/controllers/rewardsController.ts server/src/routes/rewards.ts server/src/routes/api.ts server/tests/helpers.ts server/tests/rewards.ledger.test.ts docs/API.md
git commit -m "Rewards: gift catalogue, reward rules and an append-only points ledger with unique award keys"
```

---

### Task 2: Earning from check-ins, workouts and milestones

**Files:**
- Create: `server/src/lib/milestones.ts`, `server/src/lib/rewardEvents.ts`
- Modify: `server/src/controllers/attendanceController.ts` (`checkIn`), `server/src/controllers/bookingController.ts` (`markAttendance`), `server/src/controllers/workoutController.ts` (`createWorkout`), `docs/API.md`
- Test: `server/tests/rewards.earning.test.ts`

**Interfaces:**
- Consumes: `earnsRewards`, `recordAward`, `hasAward` (points.ts); `grantGifts` (gifts.ts); `runEndingOn` (streak.ts); `previousOpenDay` (hours.ts).
- Produces (`server/src/lib/milestones.ts`):
  `interface MilestoneValues { visits: number; streak: number }`,
  `confirmedDays(userId: string): Set<string>` (gym dates of the member's attendance logs and `attended` bookings),
  `milestoneValues(userId: string, today?: string): MilestoneValues` (visits = attendance-log count; streak = `runEndingOn(confirmedDays, last)` for the latest confirmed day `last ≤ today`, or 0 once an open day has passed without one, the same lapse rule as `currentStreak`),
  `grantCrossedMilestones(user: User, before: MilestoneValues, after: MilestoneValues): GiftClaim[]`: for each `m` in `reward_settings.milestones` with `before[m.type] < m.threshold && m.threshold <= after[m.type]`, `grantGifts(user, { key: 'milestone:' + m.id + ':' + user.id, gift_ids: [m.gift_id], source: 'milestone', source_ref: m.id, note })`.
- Produces (`server/src/lib/rewardEvents.ts`), each a no-op unless `earnsRewards(user)`:
  `onCheckIn(user: User, log: AttendanceLog, before: MilestoneValues): GiftClaim[]` (`+points_per_checkin`, key `checkin:<log.id>`, reason `checkin`, ref log id; then milestones),
  `onClassAttended(userId: string, before: MilestoneValues): GiftClaim[]` (milestones only),
  `onWorkoutLogged(user: User, workout: Workout): void` (only when `workout.date === gymToday()`: `+points_per_workout`, key `workout:<userId>:<date>`, reason `workout`).

- [ ] **Step 1: Write the failing test** `server/tests/rewards.earning.test.ts`. Fake time starting Mon 5 Oct 2026, 10:00 IST (`2026-10-05T04:30:00Z`); `at(date)` moves the clock to 10:00 IST that day; `checkIn(email)` posts `{ code: email, method: 'manual' }` as admin; `ledger(userId)` = that member's entries.

```ts
it('a staff check-in earns points_per_checkin once, keyed by the attendance log', ...);   // entry { points: 10, reason: 'checkin', key: `checkin:${res.body.data.log.id}` }
it('a second check-in on the same day earns nothing', ...);                                // already_checked_in → still one checkin entry
it('staff accounts and trial passes earn nothing at check-in', ...);                       // check in personas.trainer and a trial code → no ledger entries for them
it('a workout logged for today earns points_per_workout once per gym day', ...);           // two POST /workouts for today → one entry key `workout:${id}:2026-10-05`, points 5
it('deleting and re-logging that day's workout earns nothing more; back-dated workouts earn nothing', ...);
it('a frozen member earns workout points; expired and pending members and coaches do not', ...);
it('a check-in that crosses a visits milestone grants its gift once, with no points spent', () => {
  const m = addMember(); const before = milestoneValues(m.id).visits;
  db.reward_settings = { ...db.reward_settings, milestones: [{ id: 'ms_t', type: 'visits', threshold: before + 1, gift_id: 'gift_pt_session' }] };
  // check in → one claim { source: 'milestone', source_ref: 'ms_t', points_spent: 0, status: 'ready' }; ledger has key `milestone:ms_t:${m.id}` with 0 points
});
it('a milestone added or lowered below a member's value never fires retroactively', ...);   // threshold = current visits − 1 → next check-in grants nothing
it('a streak milestone is granted once ever, even after the streak drops and is rebuilt', () => {
  // threshold 3 (streak). Check in Mon 5, Tue 6, Wed 7 → 1 claim. Skip Thu 8 (open day). Check in Fri 9, Sat 10, Mon 12 (Sun closed) → streak 3 again → still 1 claim.
});
it('self-reported floor sessions and logged workouts do not count toward the milestone streak', ...);  // same-day workouts Mon–Wed + one check-in Wed → milestoneValues(m.id).streak === 1
it('a class marked attended can cross a streak milestone', ...);  // check-ins Mon, Tue; a confirmed booking dated Wed (past) marked 'attended' by admin via PATCH /bookings/:id/attendance on Thu → threshold-3 claim
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/rewards.earning.test.ts`
Expected: FAIL (cannot resolve `../src/lib/milestones.js`).

- [ ] **Step 3: Implement `server/src/lib/milestones.ts` and `server/src/lib/rewardEvents.ts`** (Interfaces above).

- [ ] **Step 4: Call the hooks.**
  - `checkIn` (member branch, new log only): `const before = milestoneValues(user.id)` *before* `db.attendance_logs = [log, ...]`; after `recordActivity`, `onCheckIn(user, log, before)`; `db.saveSync()`.
  - `markAttendance`: `before` read before `db.bookings` is updated; when `status === 'attended' && booking.status !== 'attended'`, after `creditSession`, `onClassAttended(booking.user_id, before)`; `db.saveSync()`.
  - `createWorkout`: after the streak block, `onWorkoutLogged(user, workout)`; `db.saveSync()`.

- [ ] **Step 5: Add to the Rewards "Additional rules" in `docs/API.md`:** check-in and same-day workout points; milestones count only staff check-ins and attended classes and fire once ever, when crossed.

- [ ] **Step 6: Run the new and neighbouring tests**

Run: `cd server && npx vitest run tests/rewards.earning.test.ts tests/members.attendance.test.ts tests/activity.workouts.test.ts tests/classes.bookings.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 7: Commit** (owner-approved only)

```bash
git add server/src/lib/milestones.ts server/src/lib/rewardEvents.ts server/src/controllers/attendanceController.ts server/src/controllers/bookingController.ts server/src/controllers/workoutController.ts server/tests/rewards.earning.test.ts docs/API.md
git commit -m "Rewards: points for staff check-ins and same-day workouts; milestone gifts on staff-confirmed visits and streaks, once ever"
```

---

### Task 3: Claims, stock and the rewards API

**Files:**
- Modify: `server/src/lib/gifts.ts`, `server/src/controllers/rewardsController.ts`, `server/src/routes/rewards.ts`, `server/src/controllers/attendanceController.ts` (`checkIn` response), `server/src/controllers/memberController.ts` (`getMemberById`, `deleteMember`), `docs/API.md`
- Test: `server/tests/rewards.claims.test.ts`

**Interfaces:**
- Consumes: Task 1 (`createClaim`, `hasStock`, `takeStock`, `returnStock`, `recordAward`, `pointsBalance`), Task 2 (`milestoneValues`).
- Produces (`gifts.ts`):
  `promoteWaiting(giftId: string): number` (waiting claims of that gift, oldest `created_at` first, become `ready` while `hasStock(gift, claim.size)`; returns how many),
  `openClaimsOf(userId: string): GiftClaim[]` (status `ready` or `needs_size`, oldest first),
  `interface StoreGift { id; name; description; image; level; points_cost: number; kind; sizes?: GiftSize[]; in_stock: boolean; sizes_in_stock?: GiftSize[] }`, `toStoreGift(gift: Gift): StoreGift`.
- Produces (HTTP, `rewardsController.ts`):

| Route | Who | Body / query | Answer | Errors |
|---|---|---|---|---|
| `GET /rewards/me` | member | — | `MyRewards` (below) | |
| `GET /rewards/gifts` | signed in | — | admin: `Gift[]` (all); others: `StoreGift[]` (active, `points_cost !== null`, by cost) | |
| `POST /rewards/gifts` | admin | gift fields | `Gift` 201 | 400 |
| `PUT /rewards/gifts/:id` | admin | partial gift fields (strict) | `Gift`, message names claims promoted | 404 `GIFT_NOT_FOUND`, 409 `SIZE_IN_USE` (a removed size that a `waiting` or `ready` claim holds), 409 `GIFT_IN_RULES` (`active: false` on a gift a milestone or joining entry names; change the rule first) |
| `DELETE /rewards/gifts/:id` | admin | — | `{ deleted: true }` | 404 `GIFT_NOT_FOUND`, 409 `GIFT_IN_USE` (any claim, milestone or joining entry names it) |
| `POST /rewards/claims` | member | `{ gift_id, size? }` | `GiftClaim` 201 | 404 `GIFT_NOT_FOUND` (inactive or reward-only), 400 `SIZE_REQUIRED` / `SIZE_INVALID`, 409 `OUT_OF_STOCK`, 409 `NOT_ENOUGH_POINTS` |
| `PATCH /rewards/claims/:id` | see below | one of `{ status: 'handed_over', size? }`, `{ status: 'cancelled', reason? }`, `{ size }` | `GiftClaim` | 404 `CLAIM_NOT_FOUND` (also another member's), 409 `CLAIM_NOT_READY` (wrong status for the action, including a size for a claim that is not `needs_size`), 403 `CLAIM_NOT_CANCELLABLE`, 400 `SIZE_REQUIRED`, 409 `OUT_OF_STOCK` |
| `GET /rewards/claims` | admin | `status?`, `user_id?`, `search?` (name or pickup code) | `GiftClaim[]` oldest first | |
| `GET /rewards/settings` / `PUT /rewards/settings` | admin | `RewardSettings` minus `launched_at` (strict) | `RewardSettings` | 400 `VALIDATION_ERROR` (unknown or inactive gift id, path e.g. `milestones.0.gift_id`) |

  `MyRewards = { balance: number; visits: number; streak: number; milestones: { id; type; threshold; gift_name; reached: boolean }[]; earning: { checkin; workout; referral; referral_welcome }; claims: GiftClaim[] /* newest first */ }`. `visits` and `streak` are `milestoneValues(user.id)` (staff-confirmed days), not the dashboard's `currentStreak`; `reached` = `hasAward('milestone:<id>:<userId>')`.

  PATCH roles: `handed_over` by admin or trainer, on a `ready` claim without a size, or on a `needs_size` claim with a `size` that has stock (which takes it); records `handed_over_at` and `handed_over_by: { id, name }`. `{ size }` alone: the member on their own `needs_size` claim, or staff on any `needs_size` claim → `ready` with stock taken when that size has stock, else `waiting` with the size. A size sent for a claim in any other status → 409 `CLAIM_NOT_READY` (no size exchange). `cancelled`: a member only their own `ready` **store** claim (refund `refund:<claimId>` `+points_spent`, reason `refund`); an admin any `ready` claim (refund only for store claims); stock goes back, then `promoteWaiting`.

  Gift fields (zod, strict): `name` 2–60, `description` ≤ 300, `image` an emoji (1–8 chars, none of `<>/:"'`) or a data URL passing `validateImageDataUrl` (≤ 350 000 chars), `level`, `points_cost` int 1–100 000 or `null`, `kind`, `sizes?` (non-empty, unique, from `GIFT_SIZES`) with `stock_by_size` holding exactly those sizes (ints ≥ 0) and `stock: null`; otherwise `stock` int ≥ 0 or `null`; services have no sizes; `active` (default true). New ids `newId('gift')`. Settings: point values int 0–100 000, ≤ 30 milestones (`threshold` int 1–10 000; new ones get `newId('ms')`, existing ids are kept so their award keys stay valid), joining entries with ≤ 5 gift ids each; every gift id a rule names must exist and be active.
- Produces (other answers): the member check-in answer (`checkIn`, both the new and the `already_checked_in` branches) gains `gifts_to_collect: GiftClaim[]` = `openClaimsOf(user.id)`; `getMemberById` gains `rewards: { balance: number; recent_points: PointsEntry[] /* 20 newest */; claims: GiftClaim[] /* newest first */ }`.
- Changes `deleteMember`: note the member's `ready` claims, drop all their claims (Task 1), then `returnStock(gift_id, size)` for each noted claim and `promoteWaiting` once per affected gift, then `db.saveSync()`. Dropping first keeps the deleted member's own waiting claims from taking the returned stock.

- [ ] **Step 1: Write the failing test** `server/tests/rewards.claims.test.ts` (fixtures: `addMember()`, `recordAward` for a balance, `db.gifts` stock set per test)

```ts
it('claims a store gift: spends points, takes stock, ready with a pickup code', ...);   // 201; ledger `claim:${id}` = −cost; stock −1; status 'ready'
it('allows a claim when the balance equals the cost exactly', ...);
it('refuses inactive or reward-only gifts, missing or unknown sizes, no stock and too few points', ...);  // 404 GIFT_NOT_FOUND ×2, 400 SIZE_REQUIRED, 400 SIZE_INVALID, 409 OUT_OF_STOCK, 409 NOT_ENOUGH_POINTS; balance and stock unchanged
it('lets only members claim', ...);                                                      // trainer → 403
it('a member cancels their own ready store claim: refund entry, stock back', ...);       // ledger `refund:${id}` +cost; status 'cancelled'; cancelling again → 409 CLAIM_NOT_READY
it('a member cannot cancel a milestone or joining claim, or see another member's', ...); // 403 CLAIM_NOT_CANCELLABLE; other member's id → 404 CLAIM_NOT_FOUND
it('an admin cancels any ready claim; only store claims are refunded', ...);
it('admins and coaches hand a ready claim over and the claim records who and when', ...); // handed_over_by { id, name } of the trainer; member → 403; waiting claim → 409 CLAIM_NOT_READY
it('a size picked for a needs_size claim takes stock, or waits when that size is out', ...);
  // also: { size } and { status: 'handed_over', size } on a ready claim → 409 CLAIM_NOT_READY, stock of both sizes unchanged
it('the desk hands over a needs_size claim with a size in stock; without a size it asks for one', ...); // 400 SIZE_REQUIRED
it('added stock promotes waiting claims oldest first, only for the size that got stock', () => {
  // Review Focus 3: two waiting tshirt claims size M (older first) + one size L; PUT stock_by_size { …, S: 5 } → none promoted;
  // PUT M: 1 → only the older M claim is 'ready'; message mentions 1 claim
});
it('deleting a member with a ready mug claim returns the mug and promotes the oldest waiting mug claim', ...);
  // mug stock 1: A's store claim (ready, stock 0); grantGifts mug to B then C (waiting); DELETE A → B 'ready', C 'waiting', mug stock 0
it('a deactivated or renamed gift keeps existing claims collectable and leaves the store', ...); // Review Focus 4, on gift_mug (no rule names it): ready claim keeps gift_name snapshot and can be handed over; GET /rewards/gifts (member) omits it
it('members see in/out of stock, never stock counts; admins see the full catalogue', ...);    // member item keys exclude stock/stock_by_size/active/created_at
it('guests get nothing from the rewards routes', ...);                                     // GET /rewards/me, /rewards/gifts, /rewards/claims without a session → 401
it('GET /rewards/me returns balance, visits, streak, milestone progress, earning values and claims', ...);
it('GET /rewards/claims filters by status and member for admins only', ...);               // trainer → 403
it('the check-in answer lists the member's ready and needs_size gifts', ...);              // gifts_to_collect on new and already_checked_in answers
it('PUT /rewards/settings keeps milestone ids, gives new ones ids, and refuses unknown or inactive gifts', ...);
it('gift create/update validation', ...);   // sizes without stock_by_size → 400; service with sizes → 400; image 'http://x' → 400; points_cost null accepted;
  // Review Focus 4: dropping XXL from gift_tshirt while a waiting XXL claim exists → 409 SIZE_IN_USE, sizes unchanged;
  // active: false on gift_keychain (ms_visits_10 names it) → 409 GIFT_IN_RULES, still active
it('DELETE /rewards/gifts/:id removes only a gift that no claim or rule names', ...);  // new unused gift → 200, gone; gift with a claim → 409 GIFT_IN_USE; gift_keychain → 409 GIFT_IN_USE; member → 403
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/rewards.claims.test.ts`
Expected: FAIL (404s for the new routes).

- [ ] **Step 3: Implement `promoteWaiting`, `openClaimsOf`, `toStoreGift`** in `gifts.ts`.

- [ ] **Step 4: Implement the handlers** `getMyRewards`, `getGifts`, `createGift`, `updateGift`, `deleteGift`, `claimGift`, `updateClaim`, `listClaims`, `getRewardSettings`, `updateRewardSettings` and their routes. `claimGift` and `updateClaim` stay synchronous between checks and writes and end with `db.saveSync()`; so do `updateGift` (promotion), `deleteGift` and `updateRewardSettings`.

- [ ] **Step 5: Add `gifts_to_collect` to the member check-in answers, `rewards` to `getMemberById`, and the stock return to `deleteMember`.**

- [ ] **Step 6: Document it in `docs/API.md`:** the Rewards route table above; "Additional rules" for claim statuses, stock per size, waiting-claim promotion, the pickup flow and the gift edit refusals; under Members, `rewards` on `GET /members/:id`, `gifts_to_collect` on the check-in answer, and stock returned when a member is deleted.

- [ ] **Step 7: Run the tests**

Run: `cd server && npx vitest run tests/rewards.claims.test.ts tests/rewards.ledger.test.ts tests/members.attendance.test.ts tests/members.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 8: Commit** (owner-approved only)

```bash
git add server/src/lib/gifts.ts server/src/controllers/rewardsController.ts server/src/routes/rewards.ts server/src/controllers/attendanceController.ts server/src/controllers/memberController.ts server/tests/rewards.claims.test.ts docs/API.md
git commit -m "Rewards: gift store claims, per-size stock, waiting claims, desk hand-over and the admin catalogue and rules API"
```

---

### Task 4: Front-desk sales and joining gifts

**Files:**
- Create: `server/src/lib/activation.ts`
- Modify: `server/src/controllers/paymentController.ts` (`activateOrder`), `server/src/lib/rewardEvents.ts` (`onPaidActivation`), `server/src/controllers/memberController.ts` (`createMember`, new `recordDeskSale`), `server/src/routes/members.ts`, `docs/API.md`
- Test: `server/tests/rewards.joining.test.ts`

**Interfaces:**
- Consumes: `computeActivation`, `nextInvoiceNumber` (billing.ts); `releaseUnentitledBookings`; `grantGifts`; `earnsRewards`.
- Produces (`server/src/lib/activation.ts`):
  ```ts
  export type PaymentDetails = Pick<Payment, 'order_id' | 'razorpay_payment_id' | 'amount_inr' | 'source'> &
    Partial<Pick<Payment, 'provider' | 'utr' | 'base_amount_inr' | 'discount_inr' | 'offer_id' | 'coupon_code' | 'desk_method' | 'recorded_by'>>;
  export function applyPaidActivation(user: User, purchase: { tier: PaidTier; billing_cycle: BillingCycle }, details: PaymentDetails, today?: string):
    { payment: Payment; user: User; cancelledBookings: number; gifts: GiftClaim[] };
  ```
  It moves out of `activateOrder` unchanged: compute the activation, build the `Payment` (invoice number, snapshots, period), update the user, release unentitled bookings on a tier change, append the payment; from Step 5 it then calls `onPaidActivation(updatedUser, payment)` (until then `gifts: []`). It never saves. `activateOrder` keeps the order lookup, idempotency guard and orphan path, calls it, marks the order paid with `cancelled_bookings`, then `db.saveSync()`.
- Produces (`rewardEvents.ts`): `onPaidActivation(user: User, payment: Payment): GiftClaim[]`. Unless `earnsRewards(user)`, nothing. Matching `joining_gifts` (tier and cycle): every non-once gift id in one `grantGifts` with key `join:<paymentId>` (source `joining`, source_ref payment id); each once gift id alone with key `join-once:<giftId>:<userId>`. (Task 5 adds the referral credit here.)
- Produces (HTTP): `POST /members/:id/desk-sale` (admin), handler `recordDeskSale`, body `deskSaleSchema = { tier: 'basic'|'pro'|'vip', billing_cycle, amount_inr: int 1–1 200 000, method: 'cash'|'upi'|'card' }` (strict) → `{ user: SafeUser, payment: Payment, gifts: GiftClaim[] }`, message naming the plan, its last day (`displayDate`) and any joining gifts. The payment: `source: 'desk'`, `order_id: ''`, `razorpay_payment_id: ''`, `desk_method`, `recorded_by: { id, name }` of the admin; no base/discount fields. 409 `DESK_SALE_DUPLICATE` when a `desk` payment for the same member, tier, cycle and amount was created in the last 2 minutes (a double-clicked Record), with nothing written. `POST /members` accepts `desk_sale?: deskSaleSchema` (400 `VALIDATION_ERROR` on path `desk_sale` together with `expiry_months > 0`, or with a `membership_tier` other than `none` or the sale's tier): the member is inserted `pending` with tier `none`, then the sale's activation sets the plan; the answer gains `payment?` and `gifts?`. Both end with `db.saveSync()`.

- [ ] **Step 1: Write the failing test** `server/tests/rewards.joining.test.ts` (Razorpay set up as in `payments.test.ts`: `setRazorpayClientForTests`, `sign`, `verify`, `webhook`; give the joining gifts stock)

```ts
it('verify grants the annual joining bundle once, keyed join:<paymentId>', ...);   // basic annual → claims tshirt (needs_size) + shaker; ledger key `join:${payment.id}`
it('the webhook arriving after verify grants nothing more', ...);                   // still 2 claims, 1 join entry
it('the monthly sample pack comes once per member across renewals', ...);          // two monthly purchases → 1 sample pack; key `join-once:gift_sample_pack:${id}`
it('the annual kit comes with every annual purchase', ...);                         // two annual purchases → 2 shakers
it('staff accounts buying a plan get no joining gifts', ...);                       // admin buys → no claims
it('a desk sale records a desk Payment with an invoice and activates like an online payment', ...);
  // renewal of an active same-tier member starts the day after expiry; payment { source: 'desk', desk_method: 'cash', recorded_by.name: admin name, invoice_number /^PF-\d{4}-\d{6}$/ }; GET /payments/my as the member lists it
it('a desk sale grants the joining gifts', ...);
it('a second identical desk sale within 2 minutes is refused and grants nothing', ...);  // Review Focus 2: 409 DESK_SALE_DUPLICATE; still 1 desk payment, same expiry, same claims; 2 min later (fake time) → 200
it('Add member with desk_sale creates an active member, a desk payment and joining gifts', ...);
it('Add member refuses desk_sale together with free months or another tier', ...);  // 400 VALIDATION_ERROR, issue path 'desk_sale'
it('ordinary member edits never grant joining gifts or points', ...);              // PUT /members/:id status active + expiry, tier change, unfreeze → no claims, no ledger entries
it('desk sale validation and access', ...);                                         // amount 0 → 400; method 'cheque' → 400; trainer → 403; unknown id → 404
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/rewards.joining.test.ts`
Expected: FAIL (no joining claims; 404 for `/desk-sale`).

- [ ] **Step 3: Extract `applyPaidActivation`** into `server/src/lib/activation.ts` without the hook (it returns `gifts: []`) and make `activateOrder` call it.

- [ ] **Step 4: Run the payment suites to prove the extraction changed nothing**

Run: `cd server && npx vitest run tests/payments.test.ts tests/youpi.test.ts tests/payments.membership.test.ts tests/fix-membership.test.ts` → PASS.

- [ ] **Step 5: Implement `onPaidActivation` and call it at the end of `applyPaidActivation`; implement `deskSaleSchema`, `recordDeskSale` (with the duplicate check) and the `createMember` extension**; route `POST /members/:id/desk-sale` with the admin middleware in `routes/members.ts`.

- [ ] **Step 6: Document it in `docs/API.md`:** under Members, `POST /members/:id/desk-sale` and `desk_sale` on `POST /members`; under payments, `source: 'desk'`, `desk_method` and `recorded_by` on `Payment`; in the Rewards "Additional rules", joining gifts on every paid activation and the once-per-member keys.

- [ ] **Step 7: Run the tests**

Run: `cd server && npx vitest run tests/rewards.joining.test.ts tests/members.test.ts tests/payments.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 8: Commit** (owner-approved only)

```bash
git add server/src/lib/activation.ts server/src/lib/rewardEvents.ts server/src/controllers/paymentController.ts server/src/controllers/memberController.ts server/src/routes/members.ts server/tests/rewards.joining.test.ts docs/API.md
git commit -m "Front-desk sales with invoices; joining gifts on every paid activation, online or at the desk"
```

---

### Task 5: Referrals

**Files:**
- Create: `server/src/lib/referrals.ts`
- Modify: `server/src/controllers/authController.ts` (`register`, `googleSignIn`, `newMember`), `server/src/controllers/memberController.ts` (`createMember`, `getMemberById`, `deleteMember`), `server/src/lib/rewardEvents.ts` (`onPaidActivation`), `server/src/controllers/rewardsController.ts` (`getMyRewards`, new `attachReferrer`), `server/src/routes/rewards.ts`, `client/src/pages/public/LegalPage.tsx` (`PRIVACY`), `docs/API.md`
- Test: `server/tests/rewards.referrals.test.ts`

**Interfaces:**
- Produces (`server/src/lib/referrals.ts`):
  `ensureReferralCode(userId: string): string` (generates once: 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unique; stored on the user),
  `referrerFor(code: string | undefined): User | undefined` (undefined for no code; trims and upper-cases; only `role === 'member'` users; throws 400 `REFERRAL_CODE_INVALID` for an unknown code),
  `hasPaidActivation(userId: string, exceptPaymentId?: string): boolean` (any `paid` payment of the user other than that one),
  `creditReferral(user: User, payment: Payment): void` (when `user.referred_by` is set and `!hasPaidActivation(user.id, payment.id)`: referrer `+points_per_referral`, key `referral:<user.id>`, only if the referrer still exists and `earnsRewards(referrer)`; the member `+welcome_points_for_referred`, key `referral-welcome:<user.id>`; reason `referral` for both).
- Consumes/changes: `onPaidActivation` calls `creditReferral` after the joining gifts. `newMember(fields)` takes `referred_by?`. `registerSchema`, `googleSchema` and `createBody` gain `referral_code?: string` (trimmed, ≤ 32); Google applies it only when it creates the account; an unknown code refuses the request before anything is created. `createMember` order: `referrerFor` before the password hash, `referred_by` on the new member object at the insert, and only then the Task 4 desk sale, so `creditReferral` sees the referrer.
- Produces (HTTP): `POST /members/:id/referrer` (admin), handler `attachReferrer`, body `{ referral_code }` → `{ referred_by: { id, name } }`; 400 `REFERRAL_CODE_INVALID`, 400 `REFERRAL_SELF` (the member's own code), 409 `REFERRAL_LOCKED` (already referred, or `hasPaidActivation(id)`). `GET /rewards/me` gains `referral_code` (via `ensureReferralCode`). `getMemberById` `rewards` gains `referred_by: { id, name } | null`. `deleteMember` clears `referred_by` on users who named the deleted member.

- [ ] **Step 1: Write the failing test** `server/tests/rewards.referrals.test.ts`

```ts
it('GET /rewards/me gives a member one stable referral code', ...);            // /^[A-Z2-9]{8}$/, same on a second call, different for another member
it('register with a referral code sets referred_by; an unknown code creates no account', ...);  // 400 REFERRAL_CODE_INVALID; lower-case code accepted
it('Google sign-up takes a referral code; signing in to an existing account ignores it', ...);  // setGoogleVerifierForTests
it('Add member takes a referral code', ...);
it('Add member with a referral code and a desk sale credits the referrer +points_per_referral and the member +welcome_points_for_referred in one request', ...);
it('the first paid activation credits the referrer and welcomes the new member', ...);   // online verify: referrer +200 key `referral:${id}`, member +50 key `referral-welcome:${id}`
it('verify and webhook for the same first order credit once; a second payment credits nothing', ...);
it('a first paid activation by desk sale credits the referral too', ...);
it('a referrer whose membership has expired earns nothing; the new member is still welcomed', ...);
it('an admin attaches a referrer before the first paid activation only', ...);   // 200; own code → 400 REFERRAL_SELF; after a payment or when already referred → 409 REFERRAL_LOCKED
it('referral codes and links never leave the API in SafeUser', ...);              // /auth/me, GET /members, check-in member summary: no referral_code / referred_by
it('the member detail shows who referred the member', ...);                      // rewards.referred_by { id, name }
it('deleting a referrer clears referred_by on the members they referred', ...);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/rewards.referrals.test.ts`
Expected: FAIL (no `referral_code` in `/rewards/me`).

- [ ] **Step 3: Implement `server/src/lib/referrals.ts`** and call `creditReferral` from `onPaidActivation`.

- [ ] **Step 4: Accept `referral_code` in `register`, `googleSignIn` (new accounts) and `createMember` (in the order above); add `attachReferrer` and its route; extend `getMyRewards`, `getMemberById` and `deleteMember`.**

- [ ] **Step 5: Document it.** `docs/API.md`: `referral_code` on register and Google (Auth); `referral_code` on `POST /members`, `POST /members/:id/referrer` and `rewards.referred_by` (Members); `referral_code` on `GET /rewards/me` and the referral rules (Rewards). Privacy policy (`PRIVACY` in `LegalPage.tsx`): a "Rewards and referrals" item under "What we collect and why" (points history, gifts claimed and who handed them over, who referred whom; used only to run rewards; staff see them, other members never do); the deletion item adds points history, gift claims and referral links; bump `updated`.

- [ ] **Step 6: Run the tests**

Run: `cd server && npx vitest run tests/rewards.referrals.test.ts tests/auth.test.ts tests/authGoogle.test.ts tests/members.test.ts` → PASS. Run: `npx playwright test e2e/smoke.spec.ts` → PASS (legal pages render). `npm run typecheck` → no errors.

- [ ] **Step 7: Commit** (owner-approved only)

```bash
git add server/src/lib/referrals.ts server/src/lib/rewardEvents.ts server/src/controllers/authController.ts server/src/controllers/memberController.ts server/src/controllers/rewardsController.ts server/src/routes/rewards.ts server/tests/rewards.referrals.test.ts client/src/pages/public/LegalPage.tsx docs/API.md
git commit -m "Referrals: a code per member, set at sign-up or by the desk before the first payment; points on the friend's first paid activation"
```

---

### Task 6: Offers, coupons and server-side quotes

**Files:**
- Create: `server/src/lib/pricing.ts`, `server/src/controllers/offerController.ts`
- Modify: `server/src/controllers/paymentController.ts` (`createOrder`, `activateOrder`), `server/src/lib/authRateLimits.ts`, `server/src/routes/payments.ts`, `docs/API.md`
- Test: `server/tests/payments.offers.test.ts`, `server/tests/youpi.test.ts` (one discounted-order test, using its YouPI fake)

**Interfaces:**
- Produces (`server/src/lib/pricing.ts`):
  ```ts
  export type AppliedDiscount = { type: 'offer'; id: string; label: string } | { type: 'coupon'; code: string; label: string };
  export interface Quote { tier: PaidTier; billing_cycle: BillingCycle; base: number; discount: number; total: number; applied: AppliedDiscount | null; offer_ends_at?: string }
  export function discountOf(base: number, d: { percent_off: number | null; amount_off: number | null }): number; // floor(base × pct / 100), or min(amount_off, base)
  export function liveOffers(now?: Date): Offer[];               // active && starts_at ≤ now < ends_at
  export function normalizeCouponCode(input: string): string;     // trim + upper-case
  export function quoteFor(userId: string, tier: PaidTier, cycle: BillingCycle, couponCode?: string, now?: Date): Quote; // throws 400 COUPON_*
  export function guestSale(o: Offer): { title: string; banner_text: string; percent_off: number | null; amount_off: number | null; ends_at: string };
  ```
  `quoteFor` (the algorithm the tests pin):
  ```text
  base = planPrice(plan, cycle)
  offer = live offer matching tier and cycle ([] = all) with the largest discountOf(base, offer)
  coupon (when a code is given), checked in this order:
    not found, inactive, malformed or before valid_from → COUPON_INVALID
    after valid_until (gym date)                          → COUPON_EXPIRED
    tier or cycle not covered                             → COUPON_NOT_FOR_PLAN
    uses ≥ max_uses, or the member's paid payments with this coupon_code ≥ per_member_limit → COUPON_USED_UP
  pick the larger of the two discounts; a tie goes to the offer; a discount of 0 applies nothing
  total = max(1, base − discount); discount = base − total
  label: '15% off' | '₹500 off' (offer), 'WELCOME10: 10% off' (coupon); offer_ends_at only when an offer applies
  ```
- Produces (`authRateLimits.ts`): `couponLimiter`: 10 per 10 minutes, key `userOrIp`, `skip` when `String(req.body?.coupon_code ?? '').trim()` is empty, `skipSuccessfulRequests: true`, message "Too many coupon attempts. Please wait 10 minutes and try again.".
- Produces (HTTP):

| Route | Who | Body | Answer | Errors |
|---|---|---|---|---|
| `POST /payment/quote` | signed in (`authenticate, couponLimiter`) | `{ tier, billing_cycle, coupon_code? }` | `Quote` | 400 `COUPON_*`, 429 `RATE_LIMITED` |
| `GET /payment/quotes` | signed in | — | `Quote[]`, all 3 tiers × 2 cycles, no coupon | |
| `GET /promotions` | public | — | `{ sales: guestSale[] (live, soonest end first), joining_gifts: { tier, billing_cycle, gifts: string[] /* active gift names */ }[] }` | |
| `GET/POST /offers`, `PUT /offers/:id` | admin | `{ title 2–80, banner_text ≤ 160, percent_off int 1–90 xor amount_off int 1–100 000, tiers, billing_cycles, starts_at, ends_at (ISO, after starts_at), active }` | `Offer[]` / `Offer` | 404 `OFFER_NOT_FOUND` |
| `GET/POST /coupons`, `PUT /coupons/:code` | admin | `{ code, percent_off xor amount_off, tiers, billing_cycles, valid_from, valid_until (YYYY-MM-DD, ≥ from), max_uses int ≥ 1 or null, per_member_limit int ≥ 1 (default 1), active }`; `code` normalised then `/^[A-Z0-9]{4,16}$/`; immutable on PUT; `uses` is never in a body | `Coupon[]` / `Coupon` | 409 `COUPON_EXISTS`, 404 `COUPON_NOT_FOUND` |

  In the quote and create-order schemas `coupon_code` is a trimmed string ≤ 32; empty after trimming means no coupon (`quoteFor` gets `undefined`). `createOrder` takes `coupon_code?` (route gains `couponLimiter` after `authenticate`), calls `quoteFor`, charges `total` (Razorpay `amount`, YouPI `amountPaise` and the YouPI session amount check all use `total × 100`), stores `base_amount_inr`, `discount_inr`, `offer_id?`, `coupon_code?` on the order, and adds `base_amount_inr`, `discount_inr`, `applied` to its answer. `activateOrder` passes those four fields to `applyPaidActivation` and, inside the idempotency guard, increments that coupon's `uses` (even past `max_uses`).

- [ ] **Step 1: Write the failing test** `server/tests/payments.offers.test.ts` (fake time `2026-10-07T06:30:00Z`; Razorpay fake as in `payments.test.ts`; `db.offers = []; db.coupons = []` after `resetDb()`; `offer(patch)` / `coupon(patch)` insert fixtures)

```ts
it('quotes the list price when nothing applies', ...);                     // { base: price, discount: 0, total: price, applied: null }
it('applies a live offer for its tiers and cycles only', ...);             // outside window, inactive, other tier or cycle → applied null; offer_ends_at = ends_at
it('takes the larger of offer and coupon, never both; a tie goes to the offer', ...);
it('floors the total at ₹1 and rounds percentages down', ...);            // amount_off ≥ price → total 1, discount price − 1; 15% → discount === Math.floor(plan('basic').price_annual * 15 / 100)
it('names each coupon problem with its code', ...);                        // COUPON_INVALID (unknown, inactive, 'ab', not yet valid), COUPON_EXPIRED, COUPON_NOT_FOR_PLAN, COUPON_USED_UP (max_uses, per_member_limit)
it('accepts a coupon typed in lower case or with spaces', ...);           // Review Focus 1: ' welcome10 ' → applied.code 'WELCOME10'
it('quote and create-order with coupon_code "" or "  " charge the normal price', ...);  // Review Focus 1: 200, applied null, order amount_inr = list price
it('GET /payment/quotes lists all six plan prices for signed-in accounts only', ...);  // guest → 401
it('create-order charges the quoted total and stores how it was priced', ...);         // createOrderMock amount = total × 100; order { amount_inr: total, base_amount_inr, discount_inr, coupon_code }
it('create-order ignores prices in the body and refuses a bad coupon without an order', ...);  // { amount_inr: 1, discount: 999 } ignored; bad code → 400, no new payment_orders
it('the webhook activates a discounted order for its total and rejects the list price', ...);
it('counts a coupon use once, on activation, even when verify and the webhook both arrive', ...);  // uses 0 after create-order, 1 after verify + webhook
it('honours a coupon that ran out between order and payment', ...);       // max_uses 1, two orders, both pay → both activate, uses 2
it('copies base, discount, offer and coupon onto the payment', ...);
// in server/tests/youpi.test.ts, with its fake, `sessionFor`, `successEvent` and `webhook` (Review Focus 5):
it('a YouPI order with WELCOME10 is created for the total; a SUCCESS webhook for the total activates it once and counts one coupon use; a SUCCESS for the list price is rejected', ...);
  // coupon fixture in db.coupons; create-order { tier: 'pro', billing_cycle: 'monthly', coupon_code: 'WELCOME10' } → session amountPaise = total × 100;
  // webhook(successEvent(s)) twice → 1 payment, uses 1; second order: successEvent(s, { amountPaise: list × 100 }) → order 'rejected'
it('rate-limits failed coupon attempts per member', ...);                 // config.rateLimit.enabled = true: 10 bad quotes → 400, 11th → 429 RATE_LIMITED; a valid quote is not counted
it('GET /promotions shows guests only the sale headline and joining gift names', () => {
  // sales keys exactly ['amount_off', 'banner_text', 'ends_at', 'percent_off', 'title']; JSON body contains no coupon code, no 'stock', no user ids
});
it('offer and coupon admin validation and access', ...);                  // percent and amount both → 400; percent 91 → 400; code 'ab!' → 400; duplicate → 409 COUPON_EXISTS; member GET /coupons → 403
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/payments.offers.test.ts tests/youpi.test.ts`
Expected: FAIL (404 for `/api/payment/quote`; the YouPI order is charged the list price).

- [ ] **Step 3: Implement `server/src/lib/pricing.ts`** (algorithm above).

- [ ] **Step 4: Add `couponLimiter`; implement `offerController.ts` (`getQuote`, `getQuotes`, `getPromotions`, `listOffers`, `createOffer`, `updateOffer`, `listCoupons`, `createCoupon`, `updateCoupon`); add the routes to `routes/payments.ts`.**

- [ ] **Step 5: Price `createOrder` with `quoteFor`; carry the fields and count coupon uses in `activateOrder`; `db.saveSync()` stays the last write.**

- [ ] **Step 6: Document it in `docs/API.md`** ("Plans, payments & membership"): the route table above with `GET /promotions` as a guest view, `coupon_code` and the new answer fields on `create-order`, the coupon error codes and rate limit, and `base_amount_inr`, `discount_inr`, `offer_id`, `coupon_code` on `PaymentOrder` and `Payment`.

- [ ] **Step 7: Run the tests**

Run: `cd server && npx vitest run tests/payments.offers.test.ts tests/payments.test.ts tests/youpi.test.ts tests/rewards.joining.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 8: Commit** (owner-approved only)

```bash
git add server/src/lib/pricing.ts server/src/controllers/offerController.ts server/src/controllers/paymentController.ts server/src/lib/authRateLimits.ts server/src/routes/payments.ts server/tests/payments.offers.test.ts server/tests/youpi.test.ts docs/API.md
git commit -m "Offers and coupons: server-side quotes, best single discount with a ₹1 floor, coupon uses counted on payment"
```

---

### Task 7: Launch step and demo data

**Files:**
- Modify: `server/src/lib/milestones.ts`, `server/src/index.ts`, `server/src/db/seed.ts` (`seedDatabase` `!demo` block), `server/src/db/seed/index.ts` (`runSeedExtensions`)
- Create: `server/src/db/seed/rewards.ts`
- Modify: `docs/API.md` (the launch rule); server test fixtures that Step 4 finds relying on the old demo data (expected: the `beforeEach` of `payments.test.ts`, possibly `fix-membership.test.ts`, `guide.test.ts`, `youpi.test.ts`)
- Test: `server/tests/rewards.launch.test.ts`

**Interfaces:**
- Produces (`milestones.ts`): `longestRun(days: Set<string>): number` (largest `runEndingOn(days, d)` over the days) and `launchRewards(today?: string): { members: number; gifts: number }`:
  ```text
  for each user with earnsRewards(user):
    passed = milestones where (type 'visits': attendance-log count ≥ threshold) or (type 'streak': longestRun(confirmedDays) ≥ threshold)
    if none: continue
    highest = passed ranked by gift level (premium > big > medium > small), then points_cost, then later position in the list
    grantGifts(user, { key: `launch-gift:${id}`, gift_ids: [highest.gift_id], source: 'milestone', source_ref: highest.id, note: 'Welcome gift for regulars' })
    every passed milestone: recordAward({ user_id: id, key: `milestone:${m.id}:${id}`, points: 0, reason: 'bonus', ref: m.id, note: 'Reached before rewards launched' })
  reward_settings.launched_at = now; no points are written
  ```
- Produces (`server/src/db/seed/rewards.ts`): `seedRewards(): void`, called last in `runSeedExtensions` (after `seedStreaks`): sets demo stock (items 25, apparel 5 per size), runs `launchRewards()`, gives `usr_member_1` 400 points (key `seed-bonus:usr_member_1`, reason `bonus`), gives `usr_member_2` a `ready` store claim for `gift_mug` (bonus then `claim:<id>` entry), adds the live sale `offer_demo_annual` (15% off, all tiers, `billing_cycles: ['annual']`, starts 1 day ago, ends in 7 days, relative to now) and coupon `WELCOME10` (10%, all tiers, `['monthly']`, valid today to today + 90, `max_uses: null`, `per_member_limit: 1`).
- Changes: `seedDatabase({ demo: false })` resets `gifts` and `reward_settings` to the defaults and empties `gift_claims`, `points_ledger`, `offers`, `coupons` ("Production starts with the catalogue, rules and joining gifts only"). `index.ts`, after the catalogue block: when `!db.reward_settings.launched_at`, run `launchRewards()`, `db.saveSync()`, and log how many members got a welcome gift.

- [ ] **Step 1: Write the failing test** `server/tests/rewards.launch.test.ts` (each test starts with `db.gift_claims = []; db.points_ledger = []; db.reward_settings = { ...db.reward_settings, launched_at: undefined }`; members via `addMember` with attendance logs injected per date)

```ts
it('gives each regular only the highest passed milestone, and marks every passed one done', ...);
  // 120 visits incl. a 35-open-day run → one claim (lifting straps, key `launch-gift:${id}`); keys milestone:ms_visits_10, ms_streak_30, ms_visits_100 exist
it('a member past only the first milestone gets its gift', ...);              // 12 scattered visits → keychain
it('a streak passed before launch is not granted again when rebuilt later', ...);  // after launch, a check-in that crosses 30 again → no new claim
it('gives expired members, coaches and admins nothing, and writes no points', ...);  // ledger has no non-zero entries after launch
it('runs once: a second run grants nothing', ...);                             // launched_at set; second call → { gifts: 0 }
it('demo data has points, a ready claim, a live sale and WELCOME10', ...);     // after resetDb(): invariants, not fixed numbers
it('the catalogue-only seed has gifts and rules but no claims, points, offers or coupons', ...);  // seedDatabase({ demo: false })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/rewards.launch.test.ts`
Expected: FAIL (`launchRewards` is not exported).

- [ ] **Step 3: Implement `longestRun`, `launchRewards`, `seedRewards`, the `!demo` reset and the `index.ts` launch; add the launch step to the Rewards "Additional rules" in `docs/API.md`.**

- [ ] **Step 4: Run the whole server suite**

Run: `cd server && npx vitest run`
Expected: the demo now has a live annual sale, stock and persona points and claims, so a test that assumed the old demo data can fail. Fix the fixture, not the code: a file whose tests are about list-price activation gets `db.offers = [];` right after `resetDb()` in its `beforeEach`; a test that relies on a stock level sets it; a test that counts a persona's claims or entries compares before and after. A failure for any other reason is a defect in this task. Run `cd server && npx vitest run` again → all PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add server/src/lib/milestones.ts server/src/index.ts server/src/db/seed.ts server/src/db/seed/index.ts server/src/db/seed/rewards.ts server/tests/rewards.launch.test.ts server/tests/payments.test.ts docs/API.md
git commit -m "Rewards launch: one welcome gift per regular for the highest milestone already passed; demo points, sale and coupon"
```
(add any other test file Step 4 touched)

---

### Task 8: Member Rewards page

**Files:**
- Modify: `client/src/types/index.ts`, `client/src/api/client.ts`, `client/src/routes.ts`, `client/src/App.tsx`, `client/src/components/layout/Navbar.tsx` (`ROLE_LINKS.member`), `client/src/pages/member/MemberDashboard.tsx`, `client/src/lib/native.ts`, `server/src/lib/seo.ts` (`PAGES`), `e2e/helpers.ts`, `e2e/fix-core-ui.spec.ts`, `docs/API.md` (`/rewards` in the robots.txt list of pages that need an account)
- Create: `client/src/pages/member/RewardsPage.tsx`, `client/src/components/common/GiftImage.tsx`, `client/src/components/member/useGiftCelebration.ts`
- Test: `e2e/rewards.spec.ts`

**Interfaces:**
- Consumes (HTTP): Tasks 1, 3, 5.
- Produces (client types): `GiftLevel`, `GiftSize`, `Gift`, `StoreGift`, `GiftClaim`, `ClaimStatus`, `PointsEntry`, same shapes as the server; `MyRewards` = Task 3's shape plus Task 5's `referral_code: string`.
- Produces (`api/client.ts`): `getMyRewards: () => get<MyRewards>('/rewards/me')`, `getPointsLedger: (params: { limit?: number; offset?: number } = {}) => get<Paginated<PointsEntry> & { balance: number }>('/rewards/ledger' + qs)`, `getStoreGifts: () => get<StoreGift[]>('/rewards/gifts')`, `claimGift: (payload: { gift_id: string; size?: GiftSize }) => post<GiftClaim>('/rewards/claims', payload)`, `updateClaim: (id: string, payload: { status?: 'cancelled' | 'handed_over'; size?: GiftSize; reason?: string }) => patch<GiftClaim>('/rewards/claims/' + id, payload)`.
- Produces: route `{ tab: 'rewards', path: '/rewards', title: 'Rewards', description: <110–160 chars>, indexable: false, access: ['member'] }`, the same entry in server `PAGES` (`seo.test.ts` compares them); member nav link `{ tab: 'rewards', label: 'Rewards', icon: Gift }` before 'My account'; `GiftImage: React.FC<{ image: string; name: string; className?: string }>` (an `<img alt="">` for a data URL, otherwise the emoji in an `aria-hidden` span); `useGiftCelebration(userId: string, claims: GiftClaim[] | null): void` (calls `triggerCelebration` once when a milestone or joining claim is newer than `storage` key `pulsefit_gifts_seen:<userId>`, or when there is no mark and an open one exists; then stores the newest `created_at`); `shareText(text: string): Promise<'shared' | 'copied' | 'failed'>` in `lib/native.ts` (`@capacitor/share` in the app, `navigator.share` on the web when present, else `copyText` from `components/member/clipboard.ts`; a cancelled share sheet counts as `shared`).
- Produces (e2e helper, `e2e/helpers.ts`): `freshMember(request: APIRequestContext, label: string): Promise<{ id: string; email: string; token: string; adminToken: string }>`: admin demo-login, `POST /api/members` (unique email from `label` + time, `membership_tier: 'basic'`, `expiry_months: 1`), then `POST /api/auth/login` with the temp password for a bearer token; and `auth(token: string) => ({ Authorization: 'Bearer ' + token })`, used by every rewards spec.

Page content (`RewardsPage`, all from `GET /rewards/me`, the store and the ledger): balance with the earning values; visits and "Confirmed-visit streak (check-ins and attended classes)", so members see why it differs from the dashboard streak, each with progress to the next unreached milestone of its type; the store (affordable first, out of stock greyed and disabled, a size picker for apparel, Claim through `ConfirmDialog`, then `triggerCelebration` and a toast with the pickup code); "My gifts" (status, pickup code when ready, Cancel on a ready store claim, size picker on `needs_size`); "Refer a friend" (code, Share button: "Join me at PulseFit Athletics: use my code <CODE> when you sign up. <site>"); points history (20 per page, "Show more"; 0-point `bonus` rows read "Gift unlocked: <note>"). Every list has an empty state. `MemberDashboard`: a banner "You have a gift ready to collect" linking to Rewards when any claim is `ready`, plus `useGiftCelebration`.

- [ ] **Step 1: Write the failing e2e test** `e2e/rewards.spec.ts`

```ts
test('a member sees their points, claims a gift from the store and the dashboard says it is ready', async ({ page, request }, testInfo) => {
  const m = await freshMember(request, `rewards ${testInfo.project.name}`);
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  await useSession(page, m.token);
  await page.goto('/rewards');
  await expect(page.getByText('300', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Claim .*Sticker pack/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText(/Pickup code [A-Z2-9]{6}/)).toBeVisible();
  const me = (await (await request.get('/api/rewards/me', { headers: auth(m.token) })).json()).data;
  expect(me.claims[0]).toMatchObject({ gift_id: 'gift_sticker_pack', status: 'ready' });
  await page.goto('/dashboard');
  await expect(page.getByText('You have a gift ready to collect')).toBeVisible();
});
```
Also in `e2e/fix-core-ui.spec.ts` (header test), the member row labels become `['Dashboard', 'My bookings', 'Log workout', 'Exercises', 'Rewards', 'My account']`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/rewards.spec.ts --project=desktop`
Expected: FAIL (`/rewards` shows the not-found page).

- [ ] **Step 3: Add the types, API functions, route, server `PAGES` entry, nav link and lazy page in `App.tsx` (`named(...)` inside the existing `ErrorBoundary` flow); build `RewardsPage`, `GiftImage`, `useGiftCelebration`, `shareText` and the dashboard banner; add `/rewards` to the robots.txt page list in `docs/API.md`.**

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/rewards.spec.ts e2e/fix-core-ui.spec.ts` → PASS (desktop and mobile). Run: `cd server && npx vitest run tests/seo.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src server/src/lib/seo.ts e2e/helpers.ts e2e/rewards.spec.ts e2e/fix-core-ui.spec.ts docs/API.md
git commit -m "Member Rewards page: points, milestone progress, gift store, my gifts, referral sharing and points history"
```

---

### Task 9: Admin "Plans & rewards": gift catalogue and pickups

**Files:**
- Modify: `client/src/pages/admin/PlanManagement.tsx`, `client/src/routes.ts` (`admin-plans` title), `server/src/lib/seo.ts` (`PAGES` copy), `client/src/components/layout/Navbar.tsx` (`ROLE_LINKS.admin`), `client/src/components/admin/ui.tsx` (`ADMIN_LINKS`), `client/src/api/client.ts`, `e2e/fix-core-ui.spec.ts`
- Create: `client/src/components/admin/rewards/GiftCataloguePanel.tsx`, `client/src/components/admin/rewards/PickupsPanel.tsx`
- Test: `e2e/rewards-admin.spec.ts`

**Interfaces:**
- Produces (`api/client.ts`): `getGiftCatalogue: () => get<Gift[]>('/rewards/gifts')`, `createGift: (payload: GiftInput) => post<Gift>('/rewards/gifts', payload)`, `updateGift: (id: string, payload: Partial<GiftInput>) => putWithMessage<Gift>('/rewards/gifts/' + id, payload)`, `deleteGift: (id: string) => del<{ deleted: true }>('/rewards/gifts/' + id)`, `getClaims: (params: { status?: ClaimStatus; user_id?: string; search?: string } = {}) => get<GiftClaim[]>('/rewards/claims' + qs)`; `GiftInput` = `Gift` without `id` and `created_at`.
- Produces (UI): `PlanManagement` becomes "Plans & rewards" with tabs from `?section=` (`plans` default, `offers`, `gifts`, `pickups`, `rules`; tab buttons call `navigate('admin-plans', { section })`). The Plans tab is the current editor list, unchanged. Nav label `'Plans'` → `'Plans & rewards'` in `ROLE_LINKS.admin` and `ADMIN_LINKS` (same icon, no new link); route title `'Plans & rewards'` in client `ROUTES` and server `PAGES`. `GiftCataloguePanel`: table of all gifts (image, name, level, cost or "Reward only", stock or per-size stock, active) and a create/edit `Modal` form (fields of Task 3; sizes toggle shows one stock input per size; image is an emoji text field or a photo upload turned into a data URL with `resizeAvatar` from `components/member/avatarImage.ts`); server `VALIDATION_ERROR`s through `formErrorsFrom`; the update toast is the server message (it names promoted claims); a 409 (`SIZE_IN_USE`, `GIFT_IN_RULES`) shows the server message in the form. A Delete icon per row (`ConfirmDialog`) calls `deleteGift`; a 409 `GIFT_IN_USE` shows the server message. `PickupsPanel`: claims filtered by status (`ready` default, `needs_size`, `waiting`, `handed_over`) and search; Hand over (with a size select for `needs_size`) and Cancel (`ConfirmDialog` with a reason) through `api.updateClaim`.

- [ ] **Step 1: Write the failing e2e test** `e2e/rewards-admin.spec.ts`

```ts
test('an admin adds a gift to the catalogue', async ({ page, request }, testInfo) => {
  const token = await signInAs(page, request, 'admin');
  const name = `E2E bottle ${testInfo.project.name} ${Date.now().toString(36)}`;
  await page.goto('/admin/plans?section=gifts');
  await page.getByRole('button', { name: 'Add gift' }).click();
  // fill name, level 'medium', points 400, stock 3; save
  await expect(page.getByRole('cell', { name })).toBeVisible();
  const gifts = (await (await request.get('/api/rewards/gifts', { headers: auth(token) })).json()).data;
  expect(gifts.find((g: any) => g.name === name)).toMatchObject({ level: 'medium', points_cost: 400, stock: 3, active: true });
});
test('the pickups tab lists ready claims', ...);  // freshMember + 300 points + API claim → visible by its pickup code under 'Pickups'
```
In `e2e/fix-core-ui.spec.ts` the admin row label `'Plans'` becomes `'Plans & rewards'`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/rewards-admin.spec.ts --project=desktop`
Expected: FAIL (no "Add gift" button).

- [ ] **Step 3: Build the tabs, `GiftCataloguePanel`, `PickupsPanel`, the API functions and the renames.**

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/rewards-admin.spec.ts e2e/fix-core-ui.spec.ts` → PASS. If the header test reports the admin row wrapping at 1280 px with the longer label, shorten the visible label in `ROLE_LINKS.admin` only (its tooltip and the menu keep "Plans & rewards") and update that test's list to match. `cd server && npx vitest run tests/seo.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src server/src/lib/seo.ts e2e/rewards-admin.spec.ts e2e/fix-core-ui.spec.ts
git commit -m "Admin: Plans & rewards with a gift catalogue (stock per size) and a pickups list"
```

---

### Task 10: Admin offers & coupons and reward rules

**Files:**
- Create: `client/src/components/admin/rewards/OffersPanel.tsx`, `client/src/components/admin/rewards/RulesPanel.tsx`
- Modify: `client/src/pages/admin/PlanManagement.tsx` (wire the two tabs), `client/src/api/client.ts`, `client/src/types/index.ts`
- Test: `e2e/rewards-admin.spec.ts`

**Interfaces:**
- Produces (types): `Offer`, `Coupon`, `RewardSettings`, `Milestone`, `JoiningGift` (server shapes).
- Produces (`api/client.ts`): `getOffers`, `createOffer`, `updateOffer(id, payload)`, `getCoupons`, `createCoupon`, `updateCoupon(code, payload)`, `getRewardSettings`, `updateRewardSettings(payload)`; reads with `get`, creates with `post`, updates with `putWithMessage`, paths as in Task 3 and Task 6.
- Produces (UI): `OffersPanel`: two lists (sales with live/upcoming/ended status from `starts_at`/`ends_at`; coupons with uses / max) and create/edit `Modal` forms (percent or amount radio; tier and cycle checkboxes where none ticked means all; datetime inputs for sales converted to ISO; date inputs for coupons; code upper-cased as typed; Active toggle retires). `RulesPanel`: the four point values, the milestone list (type, threshold, gift select from `getGiftCatalogue`, add/remove rows) and joining gifts per tier × cycle (gift multi-select, once-per-member checkbox), one Save through `formErrorsFrom`.

- [ ] **Step 1: Write the failing e2e test** (append to `e2e/rewards-admin.spec.ts`)

```ts
test('an admin schedules a sale and it is not live before it starts', async ({ page, request }, testInfo) => {
  const token = await signInAs(page, request, 'admin');
  const title = `E2E sale ${testInfo.project.name} ${Date.now().toString(36)}`;
  await page.goto('/admin/plans?section=offers');
  await page.getByRole('button', { name: 'New sale' }).click();
  // title, 20% off, Monthly, starts tomorrow, ends in 8 days; save
  await expect(page.getByText(title)).toBeVisible();
  const offers = (await (await request.get('/api/offers', { headers: auth(token) })).json()).data;
  expect(offers.find((o: any) => o.title === title)).toMatchObject({ percent_off: 20, billing_cycles: ['monthly'], active: true });
  const promos = (await (await request.get('/api/promotions')).json()).data;
  expect(promos.sales.map((s: any) => s.title)).not.toContain(title);   // starts tomorrow, so the WELCOME10 pricing test is unaffected
});
test('an admin changes the points per check-in', ...);   // Rules tab: set 12, save; GET /api/rewards/settings → 12; set back to 10 at the end
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/rewards-admin.spec.ts --project=desktop`
Expected: FAIL (no "New sale" button).

- [ ] **Step 3: Build `OffersPanel`, `RulesPanel` and the API functions; wire the tabs.**

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/rewards-admin.spec.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/rewards-admin.spec.ts
git commit -m "Admin: sales, coupons and reward rules (point values, milestones, joining gifts) without code changes"
```

---

### Task 11: Front desk: scanner hand-over, member rewards and desk sales

**Files:**
- Modify: `client/src/pages/admin/QuickCheckInScanner.tsx`, `client/src/components/admin/MemberDetailModal.tsx`, `client/src/components/admin/MemberForms.tsx` (`CreateMemberModal`, `EditMemberModal`), `client/src/api/client.ts`, `client/src/types/index.ts` (`CheckInResult`, `MemberDetail`, `Payment`)
- Create: `client/src/components/admin/DeskSaleFields.tsx`
- Test: `e2e/rewards-desk.spec.ts`

**Interfaces:**
- Consumes: `updateClaim` (Task 8), `GiftImage`.
- Produces (types): `CheckInResult.gifts_to_collect?: GiftClaim[]`; `MemberDetail.rewards: { balance: number; recent_points: PointsEntry[]; claims: GiftClaim[]; referred_by: { id: string; name: string } | null }`; `Payment.source` adds `'desk'`, plus `desk_method?`, `recorded_by?`, `base_amount_inr?`, `discount_inr?`, `offer_id?`, `coupon_code?`; `DeskSale = { tier: PaidTier; billing_cycle: BillingCycle; amount_inr: number; method: 'cash' | 'upi' | 'card' }`; `DeskSaleForm = Omit<DeskSale, 'amount_inr'> & { amount_inr: string }` (the editable input), turned into a `DeskSale` with `Number(amount_inr)` on submit.
- Produces (`api/client.ts`): `adjustPoints: (userId: string, payload: { points: number; note: string }) => postWithMessage<{ balance: number; entry: PointsEntry }>(...)`, `attachReferrer: (userId: string, referral_code: string) => post<{ referred_by: { id: string; name: string } }>(...)`, `recordDeskSale: (userId: string, sale: DeskSale) => postWithMessage<{ user: User; payment: Payment; gifts: GiftClaim[] }>(...)`; `createMember` payload gains `desk_sale?: DeskSale; referral_code?: string` and its answer `payment?`, `gifts?`.
- Produces (UI): `DeskSaleFields: React.FC<{ value: DeskSaleForm; onChange: (v: DeskSaleForm) => void; errors: Record<string, string>; plans: MembershipPlan[] | null; idPrefix: string }>` (plan, monthly/annual, amount collected prefilled from the list price and editable, method cash/UPI/card), used by both forms. `CreateMemberModal`: a "Payment collected at the desk" toggle that swaps the free-months field for `DeskSaleFields`; choosing a plan turns it on (the sale's plan follows the form's Plan select), and the free-months path is labelled "Free time: no payment, no joining gift or referral points"; plus an optional referral code field. `EditMemberModal`: the same "Free time" note next to expiry and status, and a "Record a front-desk sale" section with its own Record button calling `recordDeskSale` (separate from Save), disabled while the request runs; the toast is the server message. `MemberDetailModal`: a Rewards section (balance, recent points, claims with status and pickup code, "Adjust points" form with points and note, "Referred by" or an "Add referrer code" field while there is no referrer and no payment). Scanner: for a member result with `gifts_to_collect`, "N gift(s) ready" and one Hand over button per claim (a size select first for `needs_size`), updating the list from the answer.

- [ ] **Step 1: Write the failing e2e test** `e2e/rewards-desk.spec.ts`

```ts
test('the desk records a sale from the member editor and the joining gift shows in the member details', ...);
  // admin opens /admin/members → Add member, Plan 'Basic' → "Payment collected at the desk" is checked; close the dialog;
  // freshMember; search the email, Edit → "Record a front-desk sale": Basic, Annual, cash → Record;
  // toast mentions the joining gift; details → Rewards lists T-shirt (needs size) and Shaker; GET /api/payments?user_id → source 'desk'
test('the check-in scanner shows a ready gift and hands it over', ...);
  // freshMember + 300 points + API claim of gift_sticker_pack; admin on /admin/check-in types the email → "1 gift ready" → Hand over;
  // GET /api/rewards/claims?user_id=… → status 'handed_over', handed_over_by.name = admin's name
test('an admin adjusts a member's points from the member details', ...);   // +50 with a note → balance 50 shown and via API
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/rewards-desk.spec.ts --project=desktop`
Expected: FAIL (no "Record a front-desk sale").

- [ ] **Step 3: Build `DeskSaleFields`, the form changes, the member-detail Rewards section and the scanner hand-over.**

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/rewards-desk.spec.ts e2e/fix-staff.spec.ts e2e/flows.spec.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src e2e/rewards-desk.spec.ts
git commit -m "Front desk: record desk sales, hand over gifts from the check-in scanner, see and adjust a member's points"
```

---

### Task 12: Memberships sale prices and coupons, home banner, sign-up referral code, invoices

**Files:**
- Modify: `client/src/pages/public/PricingPage.tsx`, `client/src/hooks/useCheckout.ts`, `client/src/pages/public/LandingPage.tsx`, `client/src/pages/public/AuthModal.tsx`, `client/src/components/member/InvoiceModal.tsx`, `client/src/lib/format.ts`, `client/src/api/client.ts`, `client/src/types/index.ts`, `server/src/lib/seo.ts` (`PUBLIC_API_PATHS`), `docs/API.md` (robots.txt `Allow` list)
- Create: `client/src/components/member/CouponField.tsx`
- Test: `e2e/rewards-pricing.spec.ts`

**Interfaces:**
- Produces (types): `Quote`, `AppliedDiscount`, `Promotions = { sales: { title; banner_text; percent_off: number | null; amount_off: number | null; ends_at: string }[]; joining_gifts: { tier: PaidTier; billing_cycle: BillingCycle; gifts: string[] }[] }`; `PaymentOrder` gains `base_amount_inr`, `discount_inr`, `applied`.
- Produces (`api/client.ts`): `getPromotions: () => get<Promotions>('/promotions')`, `getPaymentQuotes: () => get<Quote[]>('/payment/quotes')`, `getPaymentQuote: (payload: { tier: PaidTier; billing_cycle: BillingCycle; coupon_code?: string }) => post<Quote>('/payment/quote', payload)`; `createPaymentOrder` payload gains `coupon_code?`; `register` payload gains `referral_code?`; `googleSignIn(credential: string, referral_code?: string)`.
- Produces: `endsIn(iso: string, now?: number): string` in `lib/format.ts` ("ends in 3 days" / "ends in 5 hours" / "ends in 20 minutes" / "ended"); `useCheckout().checkout({ tier, billingCycle, couponCode?, onSuccess })` (passes `coupon_code`; a 400 `COUPON_*` shows the server message); `CouponField: React.FC<{ tier: PaidTier; billingCycle: BillingCycle; onQuote: (q: Quote | null) => void }>` (input + Apply calling `getPaymentQuote`; shows the applied label, the server message on `COUPON_*` or `RATE_LIMITED`, and "The sale price is already lower" when the quote applied an offer instead; Remove clears it). It lives in `components/member/` because `seo.test.ts` treats every `components/public` widget's API reads as guest reads.
- `PUBLIC_API_PATHS` gains `'/api/promotions'` (the public home page reads it; `seo.test.ts` requires it).

UI rules: `PricingPage` loads `getPaymentQuotes()` and `getPromotions()`. A card whose quote has a discount shows the list price struck through, the total, the label and `endsIn(offer_ends_at)`, and its pay button says the total. Under the pay button (only while online payments are enabled), "Have a coupon?" opens `CouponField` for that tier and cycle; an applied coupon quote replaces the card's numbers and is passed to `checkout`. Each card lists its joining gift ("Annual: free welcome kit: T-shirt, Shaker"). `LandingPage`, guests only: when `sales` is non-empty, one banner "<banner_text or title> · <endsIn> · Sign up" (opens the register dialog), and a "Join on an annual plan and get a welcome kit: …" line when an annual joining entry exists. `AuthModal` register mode: optional "Referral code" field, sent with email registration and with Google sign-in. `InvoiceModal`: when `discount_inr > 0`, rows "List price" (`base_amount_inr`) and "Coupon <code>" or "Sale discount" (−`discount_inr`) above "Amount paid"; for `source === 'desk'` the payment reference reads "Front desk (cash|UPI|card)".

- [ ] **Step 1: Write the failing e2e test** `e2e/rewards-pricing.spec.ts`

```ts
test('Memberships shows the live annual sale and accepts WELCOME10 on a monthly plan', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.route('**/api/config', async route => {      // online payments on, as fix-member-ui.spec.ts does
    const response = await route.fetch(); const json = await response.json();
    json.data.payments = { enabled: true, provider: 'razorpay', keyId: 'rzp_test_e2e' };
    await route.fulfill({ response, json });
  });
  await page.goto('/pricing?cycle=annual');
  await expect(page.getByText('15% off').first()).toBeVisible();
  await expect(page.getByText(/ends in/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Monthly' }).click();
  await page.getByRole('button', { name: 'Have a coupon?' }).first().click();
  await page.getByLabel('Coupon code').fill('welcome10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('WELCOME10: 10% off')).toBeVisible();
});
test('guests see the sale banner on the home page and never a coupon code', ...);  // '/' → banner with 'ends in'; page has no 'WELCOME10'
test('the sign-up form sends a referral code', ...);   // register through the dialog with a demo member's code (GET /api/rewards/me) → new account's GET /api/members/:id (admin) rewards.referred_by.name
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/rewards-pricing.spec.ts --project=desktop`
Expected: FAIL (no "15% off").

- [ ] **Step 3: Implement the types, API functions, `endsIn`, `CouponField`, the `useCheckout` change, `PricingPage`, `LandingPage`, `AuthModal`, `InvoiceModal`, and add `'/api/promotions'` to `PUBLIC_API_PATHS` and to the robots.txt API list in `docs/API.md`.**

- [ ] **Step 4: Run the tests**

Run: `npx playwright test e2e/rewards-pricing.spec.ts e2e/fix-member-ui.spec.ts e2e/smoke.spec.ts e2e/register-gender.spec.ts` → PASS. Run: `cd server && npx vitest run tests/seo.test.ts` → PASS. `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add client/src server/src/lib/seo.ts e2e/rewards-pricing.spec.ts docs/API.md
git commit -m "Memberships: sale prices with a countdown, coupons at checkout and joining gifts; home-page sale banner; referral code at sign-up; discounts on invoices"
```

---

### Task 13: End-to-end journey, changelog and full verification

**Files:**
- Modify: `e2e/rewards.spec.ts`, `CHANGELOG.md`
- Test: whole server, e2e and typecheck suites

**Interfaces:**
- Consumes: `freshMember` (Task 8), the scanner hand-over (Task 11), the Rewards page (Task 8).

- [ ] **Step 1: Write the journey test** (append to `e2e/rewards.spec.ts`)

```ts
test('a member earns points from a check-in, claims a gift, and the front desk hands it over from the scanner', async ({ page, browser, request }, testInfo) => {
  const m = await freshMember(request, `journey ${testInfo.project.name}`);
  const desk = await browser.newContext(); const deskPage = await desk.newPage();
  await signInAs(deskPage, request, 'admin');
  await deskPage.goto('/admin/check-in');
  // type m.email → granted
  await useSession(page, m.token);
  await page.goto('/rewards');
  await expect(page.getByText(/Check-in/).first()).toBeVisible();          // history row +earning.checkin
  const me = (await (await request.get('/api/rewards/me', { headers: auth(m.token) })).json()).data;
  expect(me.balance).toBe(me.earning.checkin);                             // not a literal: Task 10's spec edits this value
  await request.post(`/api/members/${m.id}/points`, { headers: auth(m.adminToken), data: { points: 300, note: 'e2e' } });
  await page.reload();
  // claim the Sticker pack through the dialog; pickup code shown
  await deskPage.reload();
  // type m.email again → already checked in, "1 gift ready" → Hand over
  const claims = (await (await request.get(`/api/rewards/claims?user_id=${m.id}`, { headers: auth(m.adminToken) })).json()).data;
  expect(claims[0].status).toBe('handed_over');
  await desk.close();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/rewards.spec.ts`
Expected: PASS on desktop and mobile with no new production code. A failure is a defect in the Task 8 page or the Task 11 scanner: fix it there and re-run that task's spec too.

- [ ] **Step 3: Add a `CHANGELOG.md` entry** under `[Unreleased]` → Added: rewards (points, milestone and joining gifts, gift store, front-desk pickup, referrals), offers and coupons, front-desk sales; Changed: admin "Plans" is now "Plans & rewards".

- [ ] **Step 4: Run every suite**

Run: `cd server && npx vitest run` → all PASS. Run (repo root): `npx playwright test` → all PASS; an existing spec that asserted an annual price now sees the demo sale: assert the struck-through list price or the quote instead. Run: `npm run typecheck` → no errors.

- [ ] **Step 5: Commit** (owner-approved only)

```bash
git add e2e CHANGELOG.md
git commit -m "E2E: a member earns points from a check-in, claims a gift and the desk hands it over; changelog"
```
