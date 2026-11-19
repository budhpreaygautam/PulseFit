import crypto from 'crypto';
import { isDeepStrictEqual } from 'util';
import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, ok, parse } from '../lib/http.js';
import { entriesOf, hasAward, pointsBalance, recordAward } from '../lib/points.js';
import { claimsOf, createClaim, GIFT_SIZES, hasStock, promoteWaiting, returnStock, takeStock, toStoreGift } from '../lib/gifts.js';
import { milestoneValues } from '../lib/milestones.js';
import { ensureReferralCode, referrerFor, referrerLocked } from '../lib/referrals.js';
import { validateImageDataUrl } from '../lib/imageValidation.js';
import { newId } from '../lib/users.js';
import { ClaimStatus, Gift, GiftClaim, GiftLevel, GiftSize, Milestone, RewardSettings } from '../types/index.js';

const LEVELS = ['small', 'medium', 'big', 'premium'] as const satisfies readonly GiftLevel[];
const CLAIM_STATUSES = ['needs_size', 'waiting', 'ready', 'handed_over', 'cancelled'] as const satisfies readonly ClaimStatus[];

const ledgerQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const adjustBody = z
  .object({
    points: z
      .number('Points must be a number.')
      .int('Points must be a whole number.')
      .min(-100_000)
      .max(100_000)
      .refine(p => p !== 0, 'Enter a number of points other than 0.'),
    note: z.string().trim().min(1, 'Add a note saying why.').max(200, 'Note must be at most 200 characters.')
  })
  .strict();

// An emoji, or a photo checked like an avatar. Never an address: every member's browser would fetch it.
const imageField = z
  .string()
  .min(1, 'Choose an emoji or upload a photo.')
  .max(350_000, 'The photo is too large. Please choose a smaller image.')
  .superRefine((v, ctx) => {
    if (v.startsWith('data:')) {
      const check = validateImageDataUrl(v);
      if (!check.ok) ctx.addIssue({ code: 'custom', message: check.error });
    } else if (v.length > 8 || /[<>/:"']/.test(v)) {
      ctx.addIssue({ code: 'custom', message: 'Use an emoji, or upload a PNG, JPEG or WebP photo.' });
    }
  });

const stockCount = z.number('Stock must be a number.').int('Stock must be a whole number.').min(0, 'Stock cannot be negative.').max(100_000);

// Sizes come with a count for each of them and no single stock; anything else has a stock (null = unlimited).
// PUT validates the stored gift with the changes laid over it, so unknown keys are refused there too.
const giftBody = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name must be at most 60 characters.'),
    description: z.string().trim().max(300, 'Description must be at most 300 characters.').optional(),
    image: imageField,
    level: z.enum(LEVELS),
    points_cost: z.number('Points must be a number.').int('Points must be a whole number.').min(1).max(100_000).nullable(),
    kind: z.enum(['item', 'service']),
    sizes: z
      .array(z.enum(GIFT_SIZES))
      .min(1, 'Choose at least one size.')
      .refine(s => new Set(s).size === s.length, 'List each size once.')
      .optional(),
    stock_by_size: z.partialRecord(z.enum(GIFT_SIZES), stockCount).optional(),
    stock: stockCount.nullable().optional(),
    active: z.boolean().optional()
  })
  .strict()
  .superRefine((g, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (g.sizes) {
      if (g.kind === 'service') issue('sizes', 'Services have no sizes.');
      const counted = Object.keys(g.stock_by_size ?? {}).sort().join();
      if (counted !== [...g.sizes].sort().join()) issue('stock_by_size', 'Give a stock count for each size, and only for those sizes.');
    } else if (g.stock_by_size) {
      issue('stock_by_size', 'Stock per size needs sizes.');
    } else if (g.stock === undefined) {
      issue('stock', 'Enter the stock, or null for unlimited.');
    }
  });

// The counts an edit of stock was based on. Claims take stock at any time, so a count is never saved over one that changed.
const stockSeen = z.object({
  expected_stock: z.object(
    { stock: stockCount.nullable(), stock_by_size: z.partialRecord(z.enum(GIFT_SIZES), stockCount).optional() },
    { error: 'Send expected_stock: the stock and stock_by_size this change was based on.' }
  )
});

const referrerBody = z.object({ referral_code: z.string().trim().min(1, 'Enter the referral code.').max(32, 'That referral code is too long.') }).strict();

const claimBody = z.object({ gift_id: z.string().trim().min(1).max(100), size: z.string().trim().min(1).max(10).optional() }).strict();

const claimPatch = z
  .object({
    status: z.enum(['handed_over', 'cancelled']).optional(),
    size: z.string().trim().min(1).max(10).optional(),
    reason: z.string().trim().max(200, 'Reason must be at most 200 characters.').optional()
  })
  .strict()
  .refine(b => b.status || b.size, { message: 'Send a status or a size.', path: ['status'] })
  .refine(b => !(b.status === 'cancelled' && b.size), { message: 'A cancellation takes no size.', path: ['size'] })
  .refine(b => b.reason === undefined || b.status === 'cancelled', { message: 'A reason goes with a cancellation.', path: ['reason'] });

const claimsQuery = z.object({
  status: z.enum(CLAIM_STATUSES).optional(),
  user_id: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional()
});

const pointsValue = z.number('Points must be a number.').int('Points must be a whole number.').min(0).max(100_000);

const settingsBody = z
  .object({
    points_per_checkin: pointsValue,
    points_per_workout: pointsValue,
    points_per_referral: pointsValue,
    welcome_points_for_referred: pointsValue,
    milestones: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(40).optional(),
            type: z.enum(['visits', 'streak']),
            threshold: z.number().int().min(1).max(10_000),
            gift_id: z.string().trim().min(1).max(100)
          })
          .strict()
      )
      .max(30, 'At most 30 milestones.'),
    joining_gifts: z
      .array(
        z
          .object({
            tier: z.enum(['basic', 'pro', 'vip']),
            billing_cycle: z.enum(['monthly', 'annual']),
            gift_ids: z.array(z.string().trim().min(1).max(100)).max(5, 'At most 5 gifts per plan.'),
            once_per_member: z.boolean()
          })
          .strict()
      )
      .max(30)
  })
  .strict()
  .superRefine((s, ctx) => {
    const usable = (id: string) => db.gifts.some(g => g.id === id && g.active);
    const message = 'Choose an active gift from the catalogue.';
    s.milestones.forEach((m, i) => {
      if (!usable(m.gift_id)) ctx.addIssue({ code: 'custom', path: ['milestones', i, 'gift_id'], message });
    });
    s.joining_gifts.forEach((j, i) =>
      j.gift_ids.forEach((id, k) => {
        if (!usable(id)) ctx.addIssue({ code: 'custom', path: ['joining_gifts', i, 'gift_ids', k], message });
      })
    );
  });

const CLAIM_STATUS_WORDS: Record<ClaimStatus, string> = {
  needs_size: 'waiting for a size',
  waiting: 'waiting for stock',
  ready: 'ready for pickup',
  handed_over: 'already handed over',
  cancelled: 'cancelled'
};

function findGiftOr404(id: string): Gift {
  const gift = db.gifts.find(g => g.id === id);
  if (!gift) throw notFound('No gift with that id.', 'GIFT_NOT_FOUND');
  return gift;
}

const namedInRules = (giftId: string) =>
  db.reward_settings.milestones.some(m => m.gift_id === giftId) || db.reward_settings.joining_gifts.some(j => j.gift_ids.includes(giftId));

/** A size the request names, checked against the gift's sizes. */
function checkSize(gift: Gift, size: string): GiftSize {
  if (!gift.sizes?.includes(size as GiftSize)) {
    throw badRequest(gift.sizes ? `Choose one of ${gift.sizes.join(', ')}.` : `${gift.name} has no sizes.`, 'SIZE_INVALID');
  }
  return size as GiftSize;
}

const outOfStock = (gift: Gift, size?: GiftSize) => conflict(`${gift.name}${size ? ` in ${size}` : ''} is out of stock.`, 'OUT_OF_STOCK');
const notReady = (claim: GiftClaim) => conflict(`That gift claim is ${CLAIM_STATUS_WORDS[claim.status]}.`, 'CLAIM_NOT_READY');

/** Validated gift fields with the defaults of a new gift; sized gifts keep stock per size only. */
function giftFieldsFrom(input: unknown) {
  const fields = parse(giftBody, input);
  return { description: '', active: true, ...fields, stock: fields.sizes ? null : (fields.stock ?? null) };
}

function saveClaim(claim: GiftClaim): void {
  db.gift_claims = db.gift_claims.map(c => (c.id === claim.id ? claim : c));
}

/** The signed-in member's points history, newest first, with the balance. */
export const getMyLedger = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { limit, offset } = parse(ledgerQuery, req.query);
  const userId = req.user!.id;
  const mine = entriesOf(userId);
  return ok(res, { balance: pointsBalance(userId), items: mine.slice(offset, offset + limit), total: mine.length });
});

/** An admin adds or removes points with a note; the balance may not go below zero. */
export const adjustPoints = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) throw notFound('No member with that id.', 'NOT_FOUND');
  const { points, note } = parse(adjustBody, req.body);

  const balance = pointsBalance(user.id);
  if (balance + points < 0) {
    throw badRequest(`${user.name} has ${balance} points, so at most ${balance} can be removed.`, 'POINTS_NEGATIVE');
  }
  const entry = recordAward({ user_id: user.id, key: `adjust:${crypto.randomUUID()}`, points, reason: 'admin_adjust', note })!;
  db.saveSync();
  const verb = points > 0 ? `added to` : `removed from`;
  return ok(res, { balance: balance + points, entry }, `${Math.abs(points)} points ${verb} ${user.name}'s balance.`);
});

/** The member's Rewards page: balance, confirmed visits and streak, milestones, point values, gifts and their referral code. */
export const getMyRewards = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const userId = req.user!.id;
  const settings = db.reward_settings;
  const { visits, streak } = milestoneValues(userId);
  return ok(res, {
    balance: pointsBalance(userId),
    visits,
    streak,
    milestones: settings.milestones.map(m => ({
      id: m.id,
      type: m.type,
      threshold: m.threshold,
      gift_name: db.gifts.find(g => g.id === m.gift_id)?.name ?? '',
      reached: hasAward(`milestone:${m.id}:${userId}`)
    })),
    earning: {
      checkin: settings.points_per_checkin,
      workout: settings.points_per_workout,
      referral: settings.points_per_referral,
      referral_welcome: settings.welcome_points_for_referred
    },
    claims: claimsOf(userId),
    referral_code: ensureReferralCode(userId)
  });
});

/** The desk links a referrer the friend forgot to name, until the friend's first paid activation. */
export const attachReferrer = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) throw notFound('No member with that id.', 'NOT_FOUND');
  const { referral_code } = parse(referrerBody, req.body);
  if (user.referred_by) throw conflict(`${user.name} already has a referrer.`, 'REFERRAL_LOCKED');
  if (referrerLocked(user)) throw conflict(`${user.name} has already had a membership, so a referrer can no longer be added.`, 'REFERRAL_LOCKED');
  const referrer = referrerFor(referral_code)!;
  if (referrer.id === user.id) throw badRequest(`That is ${user.name}'s own referral code.`, 'REFERRAL_SELF');

  db.users = db.users.map(u => (u.id === user.id ? { ...u, referred_by: referrer.id } : u));
  return ok(
    res,
    { referred_by: { id: referrer.id, name: referrer.name } },
    `${referrer.name} is now ${user.name}'s referrer and earns points when ${user.name} first pays for a plan.`
  );
});

/** Admins get the whole catalogue; everyone else the store, cheapest first, without stock counts. */
export const getGifts = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  if (req.user!.role === 'admin') return ok(res, db.gifts);
  const store = db.gifts.filter(g => g.active && g.points_cost !== null).sort((a, b) => a.points_cost! - b.points_cost!);
  return ok(res, store.map(toStoreGift));
});

export const createGift = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const gift: Gift = { id: newId('gift'), ...giftFieldsFrom(req.body), created_at: new Date().toISOString() };
  db.gifts = [...db.gifts, gift];
  db.saveSync();
  return ok(res, gift, `${gift.name} was added to the catalogue.`, 201);
});

/**
 * Edit a gift. Claims keep their name snapshot, so a renamed or retired gift stays collectable.
 * New stock comes with expected_stock, the counts it replaces (409 STOCK_CHANGED when a claim moved
 * them meanwhile). Added stock goes to waiting claims straight away.
 */
export const updateGift = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const existing = findGiftOr404(req.params.id);
  const { expected_stock, ...changes } = (req.body ?? {}) as Record<string, unknown>;
  const { id, created_at, ...current } = existing;
  const next: Gift = { id, ...giftFieldsFrom({ ...current, ...changes }), created_at };

  const removed = (existing.sizes ?? []).filter(s => !next.sizes?.includes(s));
  const held = db.gift_claims.find(
    c => c.gift_id === id && (c.status === 'waiting' || c.status === 'ready') && c.size && removed.includes(c.size)
  );
  if (held) throw conflict(`A ${held.status} claim holds size ${held.size}, so it cannot be removed.`, 'SIZE_IN_USE');
  // A waiting claim from before the change could then never be filled, given a size or cancelled.
  if (!!existing.sizes !== !!next.sizes && db.gift_claims.some(c => c.gift_id === id && (c.status === 'waiting' || c.status === 'needs_size'))) {
    throw conflict(`Claims are waiting for ${existing.name}. Add stock to fill them before ${next.sizes ? 'adding' : 'removing'} sizes.`, 'SIZE_IN_USE');
  }
  if (existing.active && !next.active && namedInRules(id)) {
    throw conflict(`A milestone or joining gift names ${existing.name}. Change that rule before deactivating it.`, 'GIFT_IN_RULES');
  }
  if ('stock' in changes || 'stock_by_size' in changes) {
    const seen = parse(stockSeen, { expected_stock }).expected_stock;
    const stored = { stock: existing.stock, ...(existing.stock_by_size ? { stock_by_size: existing.stock_by_size } : {}) };
    if (!isDeepStrictEqual(seen, stored)) {
      throw conflict(`Members claimed or returned ${existing.name} while you were editing, so its stock was not saved. Reopen it to see the current count.`, 'STOCK_CHANGED');
    }
  }

  db.gifts = db.gifts.map(g => (g.id === id ? next : g));
  const promoted = promoteWaiting(id);
  db.saveSync();
  const message = `${next.name} was saved.${promoted > 0 ? ` ${promoted} waiting claim${promoted === 1 ? ' is' : 's are'} now ready for pickup.` : ''}`;
  return ok(res, next, message);
});

/** Only a gift nothing refers to; others are deactivated instead. */
export const deleteGift = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const gift = findGiftOr404(req.params.id);
  if (namedInRules(gift.id)) {
    throw conflict(`A milestone or joining gift names ${gift.name}. Change that rule first.`, 'GIFT_IN_USE');
  }
  if (db.gift_claims.some(c => c.gift_id === gift.id)) {
    throw conflict(`Members have claimed ${gift.name}, so it cannot be deleted. Deactivate it instead.`, 'GIFT_IN_USE');
  }
  db.gifts = db.gifts.filter(g => g.id !== gift.id);
  db.saveSync();
  return ok(res, { deleted: true }, `${gift.name} was deleted.`);
});

/** A member spends points on a store gift. Every check and write happens in one synchronous step. */
export const claimGift = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const body = parse(claimBody, req.body);
  const user = req.user!;
  const gift = db.gifts.find(g => g.id === body.gift_id && g.active && g.points_cost !== null);
  if (!gift) throw notFound('That gift is not in the store.', 'GIFT_NOT_FOUND');
  if (gift.sizes && !body.size) throw badRequest(`Choose a size for the ${gift.name}.`, 'SIZE_REQUIRED');
  const size = body.size === undefined ? undefined : checkSize(gift, body.size);
  if (!hasStock(gift, size)) throw outOfStock(gift, size);
  const cost = gift.points_cost!;
  const balance = pointsBalance(user.id);
  if (balance < cost) throw conflict(`${gift.name} costs ${cost} points and you have ${balance}.`, 'NOT_ENOUGH_POINTS');

  const claim = createClaim(user, gift, { source: 'store', source_ref: '', points_spent: cost, size });
  recordAward({ user_id: user.id, key: `claim:${claim.id}`, points: -cost, reason: 'claim', ref: claim.id, note: gift.name });
  db.saveSync();
  return ok(res, claim, `${gift.name} is yours. Show code ${claim.pickup_code} at the front desk to collect it.`, 201);
});

/**
 * Pick a size, hand a gift over (staff) or cancel it. Members act only on their own claims: they pick
 * sizes and cancel ready store claims (refunded). Admins cancel any ready claim; only store claims are
 * refunded. A cancelled claim's stock goes to the next waiting claim.
 */
export const updateClaim = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const body = parse(claimPatch, req.body);
  const me = req.user!;
  const staff = me.role !== 'member';
  const claim = db.gift_claims.find(c => c.id === req.params.id);
  if (!claim || (!staff && claim.user_id !== me.id)) throw notFound('No gift claim with that id.', 'CLAIM_NOT_FOUND');

  if (body.status === 'cancelled') {
    if (me.role === 'trainer') throw forbidden('Only an admin can cancel a gift claim.');
    if (!staff && claim.source !== 'store') {
      throw forbidden('Gifts from milestones and plans cannot be cancelled. Ask at the front desk.', 'CLAIM_NOT_CANCELLABLE');
    }
    if (claim.status !== 'ready') throw notReady(claim);
    const refund = claim.source === 'store' ? claim.points_spent : 0;
    if (refund > 0) {
      recordAward({ user_id: claim.user_id, key: `refund:${claim.id}`, points: refund, reason: 'refund', ref: claim.id, note: claim.gift_name });
    }
    const cancelled: GiftClaim = { ...claim, status: 'cancelled', ...(body.reason ? { cancel_reason: body.reason } : {}) };
    saveClaim(cancelled);
    returnStock(claim.gift_id, claim.size);
    promoteWaiting(claim.gift_id);
    db.saveSync();
    const refunded = refund > 0 ? ` ${refund} points went back to ${staff ? `${claim.user_name}'s` : 'your'} balance.` : '';
    return ok(res, cancelled, `The ${claim.gift_name} claim was cancelled.${refunded}`);
  }

  if (body.status === 'handed_over' && !staff) throw forbidden('Only the front desk can hand a gift over.');
  let next = claim;
  if (claim.status === 'needs_size') {
    if (body.size === undefined) throw badRequest(`Choose a size for the ${claim.gift_name}.`, 'SIZE_REQUIRED');
    const gift = findGiftOr404(claim.gift_id);
    const size = checkSize(gift, body.size);
    const inStock = hasStock(gift, size);
    if (!inStock && body.status === 'handed_over') throw outOfStock(gift, size);
    if (inStock) takeStock(gift.id, size);
    next = { ...claim, size, status: inStock ? 'ready' : 'waiting' };
  } else if (claim.status !== 'ready' || body.size !== undefined) {
    // No size exchange once a size holds stock.
    throw notReady(claim);
  }
  if (body.status === 'handed_over') {
    next = { ...next, status: 'handed_over', handed_over_at: new Date().toISOString(), handed_over_by: { id: me.id, name: me.name } };
  }
  saveClaim(next);
  db.saveSync();

  const label = `${claim.gift_name}${next.size ? ` (${next.size})` : ''}`;
  const message =
    next.status === 'handed_over'
      ? `${label} handed over to ${claim.user_name}.`
      : next.status === 'ready'
        ? `${label} is ready for pickup.`
        : `${label} is out of stock; the claim will be ready when the gym restocks.`;
  return ok(res, next, message);
});

/** Admin pickups list, oldest first; search matches the member's name or the pickup code. */
export const listClaims = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { status, user_id, search } = parse(claimsQuery, req.query);
  const q = search?.toLowerCase();
  const list = db.gift_claims
    .filter(
      c =>
        (!status || c.status === status) &&
        (!user_id || c.user_id === user_id) &&
        (!q || c.user_name.toLowerCase().includes(q) || c.pickup_code.toLowerCase().includes(q))
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return ok(res, list);
});

export const getRewardSettings = asyncHandler<AuthenticatedRequest>((_req, res: Response) => ok(res, db.reward_settings));

/**
 * Replace the reward rules. A milestone that keeps its id keeps its award keys, so members who
 * reached it are not granted it again; new milestones get new ids.
 */
export const updateRewardSettings = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const body = parse(settingsBody, req.body);
  const current = new Set(db.reward_settings.milestones.map(m => m.id));
  const used = new Set<string>();
  const milestones: Milestone[] = body.milestones.map(({ id, type, threshold, gift_id }) => {
    const kept = id && current.has(id) && !used.has(id) ? id : newId('ms');
    used.add(kept);
    return { id: kept, type, threshold, gift_id };
  });
  const { launched_at } = db.reward_settings;
  const next: RewardSettings = { ...body, milestones, ...(launched_at ? { launched_at } : {}) };
  db.reward_settings = next;
  db.saveSync();
  return ok(res, next, 'Reward rules saved.');
});
