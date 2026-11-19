# Rewards, gifts and offers — design

Date: 2026-11-19 · Status: draft for the owner's approval

## Why

The owner wants members to join, choose longer plans, keep coming and bring friends. Physical
gym goodies (mugs, bottles, shakers, apparel, accessories) and price offers are the levers. The
owner approved all three ways of earning gifts and all offer types: "do the best, i like all the
plans".

## Goals

1. **Joining gifts:** buying a plan unlocks a gift bundle (an annual plan gets a welcome kit).
2. **Milestone gifts:** gifts unlock automatically at visit-count and streak milestones.
3. **Points and a gift store:** members earn points for check-ins, workouts logged on the day and
   referrals that turn into paying members, and spend them on gifts.
4. **Referrals:** every member has a code to share; a friend who signs up with it and buys a plan
   earns the member points.
5. **Offers:** admin-set limited-time sales (banner with a countdown) and coupon codes at
   checkout. The server computes the price.
6. **Front-desk pickup:** every gift is a claim the front desk hands over and marks done.
7. **Admin control:** catalogue, stock, point values, milestones, joining gifts, offers and coupons
   are editable without code.

## Non-goals

- Selling merchandise for money, shipping or delivery.
- Points that expire, member levels or tiers of loyalty.
- Email/SMS notifications for rewards (Brevo comes with the enquiry form; reuse later).
- Refunds of payments (none exist today).
- Stacking discounts.
- Gift-wrapping, personalisation, size exchange workflow.

## Anti-goals (failure even if it "works")

- Anything the browser can change that creates points, gifts or a lower price.
- Promising a gift that is out of stock.
- Granting the same reward twice (streaks can drop and rebuild; payments can be confirmed by
  verify and webhook).
- Self-reported activity that can be farmed for unlimited points.
- Front-desk sign-ups silently missing their joining gift or a referrer missing their points.

## Constraints (from the code)

- **Prices are server-side today.** `createOrder` computes `amountInr = planPrice(plan, cycle)`
  and stores `PaymentOrder.amount_inr`; the Razorpay webhook and YouPI both reject a payment whose
  amount differs from the stored order. A discount therefore only has to change the stored amount.
- **Activation:** one function, `activateOrder` (paymentController), serves verify, the Razorpay
  webhook and YouPI, with an idempotency check. It is the hook for online joining gifts and
  referral points.
- **Front-desk activations create no Payment or order** (`PUT /members/:id`, `POST /members`
  with `expiry_months`). Joining gifts and referrals must also hook in there.
- **Streaks** (`server/src/lib/streak.ts`) count consecutive gym days with any activity (floor
  sessions, attendance logs, attended bookings, workouts logged on their own day). They can drop
  to 0 and be rebuilt, and `creditSession` writes `streak_days` directly. Only `streak_days` and
  `last_active_date` are stored; there is no longest streak or achievement logic.
- **Check-ins** are created only by staff (`POST /attendance/check-in`, admin/trainer), at most
  one per member per gym day. Trial check-ins never touch members.
- **Workouts** are self-reported for any date; only same-day ones count toward streaks.
- **Plans:** three fixed tiers (`basic`, `pro`, `vip`) × `monthly | annual`; prices in whole
  rupees; plan `price_monthly` has a ₹1 minimum; plans are edited, never created or deleted.
- **DB:** JSON file; new collections via `DatabaseSchema` + `emptySchema` + setter; never mutate
  getter results; money paths call `db.saveSync()`. `load()` fills missing collections.
- **Nav width:** the admin role row has 9 links and wraps with a 10th at 1280 px. The member row
  has 5 and has room.
- **Sign-in gating** (being built now): the 6 public service pages, including Memberships, need
  sign-in; the home page and the contact form stay public. Guest API responses are trimmed.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **Built into the existing server and JSON DB** | Free, works in the app and the website, every rule enforced server-side, reuses activation and check-in code | **Chosen** (owner handed the how to the builder) |
| Third-party loyalty service (Smile.io etc.) | Monthly cost, web-only widgets, data outside the app, still needs custom gym rules | Rejected: owner prefers free; doesn't cover the Capacitor app or front-desk flow |
| Points as one balance number on the user | Simplest, but no audit, double-credit risk, hard refunds | Rejected in favour of an **append-only ledger with unique keys** |
| Discounts: stack sale + coupon | More generous, harder to reason about margins | Rejected: **best single discount wins** |

## Design

### Data (new collections)

- **`gifts`** — catalogue: `id`, `name`, `description`, `image` (bundled SVG/emoji icon path or
  admin photo data URL, same rules as avatars), `level` (`small | medium | big | premium`),
  `points_cost` (number, or `null` = not in the store, reward-only), `stock` (number, or `null` =
  unlimited, e.g. services), `sizes?` (`['S','M','L','XL','XXL']` for apparel; apparel keeps
  **stock per size**, `stock_by_size: { S: n, … }`, instead of one number), `kind`
  (`item | service`), `active`, `created_at`.
- **`gift_claims`** — one per gift a member is owed: `id`, `user_id`, `user_name` snapshot,
  `gift_id`, `gift_name` snapshot, `size?`, `source` (`store | milestone | joining`),
  `source_ref` (milestone id / order id / desk activation id), `points_spent`, `pickup_code`
  (short, human-readable), `status` (`needs_size | waiting | ready | handed_over | cancelled`),
  `created_at`, `handed_over_at?`, `handed_over_by?` (id + name snapshot), `cancel_reason?`.
  `needs_size`: an automatically granted apparel gift waiting for the member (in the app) or the
  desk (at hand-over) to pick a size. `waiting`: owed but out of stock; becomes `ready` in
  first-come order when an admin adds stock. Stock is reserved when a claim becomes `ready`.
- **`points_ledger`** — append-only: `id`, `user_id`, `key` (**unique**; makes every award
  idempotent), `points` (positive earn, negative spend/reversal), `reason`
  (`checkin | workout | referral | claim | refund | admin_adjust | bonus`), `ref?`, `note?`,
  `created_at`. Balance = sum of the member's entries (computed; no stored balance).
- **`reward_settings`** — one object: `points_per_checkin` (10), `points_per_workout` (5),
  `points_per_referral` (200), `welcome_points_for_referred` (50), `milestones` (list of
  `{ id, type: 'visits' | 'streak', threshold, gift_id }`), `joining_gifts` (list of
  `{ tier, billing_cycle, gift_ids[], once_per_member: boolean }`).
- **`offers`** — sales: `id`, `title`, `banner_text`, `percent_off` (1–90) or `amount_off`
  (rupees), `tiers[]`, `billing_cycles[]`, `starts_at`, `ends_at`, `active`.
- **`coupons`** — `code` (unique, upper-case A–Z0–9, 4–16), `percent_off` or `amount_off`,
  `tiers[]`, `billing_cycles[]`, `valid_from`, `valid_until`, `max_uses` (null = unlimited),
  `per_member_limit` (default 1), `uses` (counted on paid activation), `active`.
- **Users** gain `referral_code` (unique, generated lazily on first need) and `referred_by?`
  (user id, set only at account creation). `SafeUser` exposes `referral_code` to the owner only.
- **`PaymentOrder` and `Payment`** gain `base_amount_inr`, `discount_inr`, `offer_id?`,
  `coupon_code?` so invoices show the discount.

### Earning rules (server-side only)

- **Who earns:** members only (not coaches or admins), and only while their membership is
  `active` or `frozen`. Trial passes never earn.
- **Check-in:** when staff create an attendance log for a member → `+points_per_checkin`, key
  `checkin:<attendanceId>`. Staff-only creation and one-per-day already limit it.
- **Workout:** first workout a member logs **on its own date** → `+points_per_workout`, key
  `workout:<userId>:<date>`. Deleting it does not reverse the points, but re-logging that day can
  never earn again (the key exists). Back-dated workouts earn nothing.
- **Milestones count only days the gym confirmed:** `visits` = the member's attendance logs
  (created by staff); `streak` = consecutive gym days with a staff check-in or a class marked
  attended, computed with the same gym-day calendar as `streak.ts` (closed days don't break it).
  Self-reported floor clock-ins and logged workouts do **not** count toward milestones (they still
  feed the app's existing streak display, which is unchanged).
- **A milestone fires when it is crossed:** after a check-in or attended class, compare the
  member's value before and after; grant every milestone with `before < threshold ≤ after`.
  Each is granted **once per member, ever** (key `milestone:<milestoneId>:<userId>`), so a
  dropped and rebuilt streak cannot earn it again, and a milestone an admin adds or lowers later
  only counts for future crossings. A milestone grants its gift as a claim (no points spent).
- **Launch (owner's decision: "one welcome gift for regulars"):** a one-time launch step gives
  each existing member **only the highest milestone they have already passed** as a single
  welcome gift (key `launch-gift:<userId>`), and records the lower passed milestones as done
  with no gift. Points start at 0 for everyone; past check-ins and workouts earn nothing.
- **Front-desk sales are recorded explicitly.** A new admin action "Record a front-desk sale"
  (member editor and Add member form: plan, monthly/annual, amount collected, method
  cash/UPI/card) creates a `Payment` with `source: 'desk'` and an invoice, and activates the
  period through the same `computeActivation` rules as online payments. Ordinary member edits
  (date corrections, unfreezing, free time, fulfilling a "free week" gift) never trigger joining
  gifts or referral points.
- **Joining gifts:** on every paid activation — online (`activateOrder`) and a recorded desk sale
  — look up `joining_gifts` for the tier and cycle and create claims, key `join:<paymentId>`.
  `once_per_member: true` entries (default for monthly sample packs) use
  `join-once:<giftId>:<userId>` so 12 monthly renewals don't give 12 packs. Annual kits are given
  on every annual purchase (rewards renewing annually).
- **Referrals:** registration (email and Google) and the admin Add member form accept an optional
  `referral_code`; it sets `referred_by` once and refuses the member's own code. An admin can
  attach a referrer later (friend forgot the code) only until the member's first paid
  activation. On the referred member's **first paid activation** (online or recorded desk sale) → referrer
  `+points_per_referral` (key `referral:<referredUserId>`) and the new member
  `+welcome_points_for_referred` (key `referral-welcome:<referredUserId>`).
- **Admin adjustment:** admins can add or remove points with a note (key `adjust:<uuid>`).

### Claiming and pickup

- Automatic claims (milestone, joining, launch) never fail for stock: they start as
  `needs_size` (apparel) or `waiting` (out of stock) and move to `ready` when a size is picked and
  stock exists. So a member who paid always gets the kit, possibly later; the Memberships page
  keeps advertising it.
- `POST /rewards/claims { gift_id, size? }` (member): gift active, in the store, size valid when
  sizes exist, stock > 0 for that size (or unlimited), balance ≥ cost. Writes a negative ledger entry
  (`claim:<claimId>`), decrements stock, creates a `ready` claim with a pickup code, `saveSync()`.
- Members see claims with status and pickup code; they can cancel a `ready` store claim
  (refund entry `refund:<claimId>`, stock back). Milestone and joining claims can't be cancelled
  by members (nothing to refund) but admins can cancel any `ready` claim.
- Front desk: `PATCH /rewards/claims/:id { status: 'handed_over' }` (admin, trainer) records who
  and when. Service gifts (free PT session, free week, guest pass) are fulfilled manually by staff
  (e.g. extending the membership in the member editor) and then marked handed over.
- The staff check-in scanner shows "N gifts ready" for the member being checked in, with a
  "Hand over" action per claim.

### Offers and pricing

- `POST /payment/quote { tier, billing_cycle, coupon_code? }` (signed-in) returns
  `{ base, discount, total, applied: { type: 'offer' | 'coupon', id|code, label } | null, offer_ends_at? }`
  using the same function `createOrder` uses.
- `createOrder` accepts `coupon_code?`, computes base price, finds the active offer for that
  tier/cycle now and the valid coupon (window, tier/cycle, `uses < max_uses`, member's paid uses
  < `per_member_limit`), applies the **larger** discount, floors the total at ₹1, stores
  base/discount/offer/coupon on the order. An invalid coupon returns 400 with a clear code
  (`COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_USED_UP`, `COUPON_NOT_FOR_PLAN`).
- Coupon `uses` and per-member counts increase only in `activateOrder` (paid), inside the
  existing idempotency guard. A coupon that ran out between order and payment is still honoured
  (the member already paid).
- Front-desk activations charge whatever staff collect; offers/coupons don't apply there.
- Plan credit for upgrades keeps using list prices (unchanged).

### Where people see it

- **Member "Rewards" page** (new member route `/rewards`, in the member nav row): points balance,
  current streak and visits with progress to the next milestone, the gift store (affordable first,
  out-of-stock greyed, size picker for apparel), "My gifts" with status and pickup code, the
  referral code with Share (Capacitor Share in the app, Web Share / copy on the web), and a
  points history.
- **Member dashboard:** banner "You have a gift ready to collect" when any claim is `ready`.
- **Memberships page:** active sale shown on each plan card (strike-through price, "20% off",
  countdown to `ends_at`), a coupon field at checkout that calls `/payment/quote`, and the joining
  gift listed per plan ("Annual: free welcome kit — T-shirt, shaker, bottle").
- **Home page (public):** one offer banner for guests when a sale is live ("20% off annual plans
  — ends in 3 days · Sign up"), plus a "Join and get a welcome kit" line. The banner uses a
  guest-safe projection (title, percent, end time) — no coupon codes ever reach guests.
- **Invoices:** show base price, discount line (offer or coupon) and total.
- **Celebration:** the existing confetti helper fires when a milestone or joining gift is earned
  (shown on next load) and when a store claim succeeds.

### Admin

- The admin nav link **"Plans" becomes "Plans & rewards"** (no 10th link), one page with tabs:
  **Plans** (existing editor) · **Offers & coupons** · **Gift catalogue** (CRUD, stock, sizes,
  active) · **Pickups** (ready claims, filter, hand over / cancel) · **Rules** (point values,
  milestones, joining gifts per plan).
- **Member detail modal:** points balance, recent ledger entries, claims, and an "Adjust points"
  action. Members table gains a Points column next to Streak if it fits; otherwise detail only.

### Defaults (seeded, all editable)

- **Catalogue:** Small — sticker pack, keychain, sweatband, skipping rope, supplement sample
  pack. Medium — coffee mug, water bottle, shaker, gym towel, cap, resistance bands, gym gloves.
  Big — T-shirt (sizes), lifting straps, wrist wraps, knee sleeves, yoga mat, tank top (sizes).
  Premium — hoodie (sizes), gym duffel bag, foam roller, free personal-training session
  (service), free week of membership (service), guest pass for a friend (service).
- **Point costs:** small 150–250, medium 300–500, big 700–1,200, premium 1,500–3,000.
- **Milestones:** 10 visits → keychain; 30-day streak → shaker; 100 visits → lifting straps;
  250 visits → hoodie.
- **Joining gifts:** basic/pro annual → T-shirt + shaker; vip annual → hoodie + shaker + water
  bottle; any monthly → supplement sample pack (once per member).
- **Demo data:** demo mode seeds points, one ready claim, one live sale (e.g. 15% off annual,
  ends in 7 days) and one coupon (`WELCOME10`, 10%, monthly plans). Production starts with the
  catalogue, rules and joining gifts only — no offers or coupons until an admin creates them.

### Security and privacy

- Every award, claim, refund, price and coupon decision happens on the server; the client only
  displays. Request bodies never carry points, prices or discounts.
- Unique ledger keys + `saveSync()` on money/points paths; claim creation checks balance and
  stock in the same synchronous step.
- Coupons are never listed to non-admins; quote/order responses reveal only whether a typed code
  works and its effect. Rate-limit coupon attempts per member (e.g. 10 per 10 minutes).
- Referral relationships and ledgers are personal data: privacy policy updated; ledger/claims
  deleted with the member account.
- Guest API projections (from the gating work) must not expose coupons, other members' claims,
  stock counts beyond in/out of stock, or the referral graph.

### Testing

- Server: ledger idempotency (each key once), every earning rule, milestones once ever after a
  streak drop and rebuild, joining gifts online and at the desk, once-per-member packs, referral
  first-payment-only and self-referral refusal, claims (balance, stock, sizes, cancel/refund,
  hand-over roles), quote/order pricing (best single discount, ₹1 floor, coupon limits, wrong
  plan, expired), webhook amount check with a discounted order, guest projections.
- E2E: member earns points from a check-in, claims a gift, front desk hands it over from the
  scanner; pricing shows a live sale and accepts `WELCOME10`; admin creates a gift and an offer.

## Left to the builder

- Exact UI layout and copy, icons/illustrations for gifts (bundled SVGs or emoji), the pickup
  code format, how the countdown renders, ledger page size.
- Whether the members table can fit a Points column.
- Splitting the work into reviewable steps.
