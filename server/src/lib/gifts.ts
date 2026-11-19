import crypto from 'crypto';
import db from '../db/database.js';
import { recordAward } from './points.js';
import { newId } from './users.js';
import { ClaimSource, ClaimStatus, Gift, GiftClaim, GiftLevel, GiftSize, User } from '../types/index.js';

// Gift claims and stock. Stock is taken when a claim becomes 'ready' and given back when a ready
// claim goes away; apparel keeps a count per size. Automatic grants (milestones, joining gifts)
// never fail for stock: they wait for a size or for stock instead.

export const GIFT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const satisfies readonly GiftSize[];

// Pickup (and referral) codes are read out or typed, so no 0/O or 1/I. 32 symbols: every byte maps evenly.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Whether one can be handed out now: unlimited, or at least one left (of that size, for apparel). */
export function hasStock(gift: Gift, size?: GiftSize): boolean {
  if (gift.sizes) return size !== undefined && (gift.stock_by_size?.[size] ?? 0) > 0;
  return gift.stock === null || gift.stock > 0;
}

function changeStock(giftId: string, size: GiftSize | undefined, delta: number): void {
  db.gifts = db.gifts.map(g => {
    if (g.id !== giftId) return g;
    if (g.sizes) return size ? { ...g, stock_by_size: { ...g.stock_by_size, [size]: (g.stock_by_size?.[size] ?? 0) + delta } } : g;
    return g.stock === null ? g : { ...g, stock: g.stock + delta };
  });
}

export function takeStock(giftId: string, size?: GiftSize): void {
  changeStock(giftId, size, -1);
}

export function returnStock(giftId: string, size?: GiftSize): void {
  changeStock(giftId, size, 1);
}

/** Six characters, unique among claims. */
export function newPickupCode(): string {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.gift_claims.some(c => c.pickup_code === code)) return code;
  }
}

/**
 * Add a claim: 'needs_size' for apparel without a size, else 'ready' (taking stock) when there is
 * stock, else 'waiting'. Never saves; points for a store claim are the caller's.
 */
export function createClaim(
  user: User,
  gift: Gift,
  fields: { source: ClaimSource; source_ref: string; points_spent: number; size?: GiftSize }
): GiftClaim {
  const status: ClaimStatus = gift.sizes && !fields.size ? 'needs_size' : hasStock(gift, fields.size) ? 'ready' : 'waiting';
  const claim: GiftClaim = {
    id: newId('clm'),
    user_id: user.id,
    user_name: user.name,
    gift_id: gift.id,
    gift_name: gift.name,
    ...(fields.size ? { size: fields.size } : {}),
    source: fields.source,
    source_ref: fields.source_ref,
    points_spent: fields.points_spent,
    pickup_code: newPickupCode(),
    status,
    created_at: new Date().toISOString()
  };
  if (status === 'ready') takeStock(gift.id, fields.size);
  db.gift_claims = [...db.gift_claims, claim];
  return claim;
}

const oldestFirst = (a: GiftClaim, b: GiftClaim) => a.created_at.localeCompare(b.created_at);

/**
 * Stock came back or was added: the gift's waiting claims, oldest first, become 'ready' (taking stock)
 * while their size has stock. A claim whose size is still out is passed over, not a stop. Never saves.
 */
export function promoteWaiting(giftId: string): number {
  let promoted = 0;
  for (const claim of db.gift_claims.filter(c => c.gift_id === giftId && c.status === 'waiting').sort(oldestFirst)) {
    const gift = db.gifts.find(g => g.id === giftId);
    if (!gift || !hasStock(gift, claim.size)) continue;
    takeStock(giftId, claim.size);
    db.gift_claims = db.gift_claims.map(c => (c.id === claim.id ? { ...c, status: 'ready' as const } : c));
    promoted++;
  }
  return promoted;
}

/** A claim as an answer shows it: one that needs a size lists the sizes its gift comes in (a reward-only gift is in no store list). */
export type ClaimView = GiftClaim & { sizes?: GiftSize[] };

const withSizes = (c: GiftClaim): ClaimView => (c.status === 'needs_size' ? { ...c, sizes: db.gifts.find(g => g.id === c.gift_id)?.sizes ?? [] } : c);

/** All of a member's claims, newest first. */
export function claimsOf(userId: string): ClaimView[] {
  // Claims are appended, so reversing gives newest first; the sort only matters for equal times.
  return db.gift_claims
    .filter(c => c.user_id === userId)
    .reverse()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(withSizes);
}

/** What the member can collect or must pick a size for at the desk, oldest first. */
export function openClaimsOf(userId: string): ClaimView[] {
  return db.gift_claims
    .filter(c => c.user_id === userId && (c.status === 'ready' || c.status === 'needs_size'))
    .sort(oldestFirst)
    .map(withSizes);
}

/** The store's view of a gift: in or out of stock, never the counts. */
export interface StoreGift {
  id: string;
  name: string;
  description: string;
  image: string;
  level: GiftLevel;
  points_cost: number;
  kind: Gift['kind'];
  sizes?: GiftSize[];
  in_stock: boolean;
  sizes_in_stock?: GiftSize[];
}

/** Only for gifts in the store (points_cost set). */
export function toStoreGift(gift: Gift): StoreGift {
  const { id, name, description, image, level, kind } = gift;
  const sizesInStock = gift.sizes?.filter(s => hasStock(gift, s));
  return {
    id,
    name,
    description,
    image,
    level,
    points_cost: gift.points_cost!,
    kind,
    ...(gift.sizes ? { sizes: gift.sizes, sizes_in_stock: sizesInStock } : {}),
    in_stock: sizesInStock ? sizesInStock.length > 0 : hasStock(gift)
  };
}

/**
 * Grant gifts once per award key: a 0-point 'bonus' ledger entry records the key, then each active
 * gift becomes a claim. Missing or retired gifts are skipped, and the key is still used up.
 */
export function grantGifts(
  user: User,
  award: { key: string; gift_ids: string[]; source: 'milestone' | 'joining'; source_ref: string; note: string }
): GiftClaim[] {
  if (!recordAward({ user_id: user.id, key: award.key, points: 0, reason: 'bonus', ref: award.source_ref, note: award.note })) return [];
  return award.gift_ids.flatMap(id => {
    // Read per gift: an earlier claim in this grant may have taken stock.
    const gift = db.gifts.find(g => g.id === id && g.active);
    return gift ? [createClaim(user, gift, { source: award.source, source_ref: award.source_ref, points_spent: 0 })] : [];
  });
}
