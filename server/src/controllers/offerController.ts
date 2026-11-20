import { Request, Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, conflict, notFound, ok, parse } from '../lib/http.js';
import { isValidDate } from '../lib/dates.js';
import { guestSale, liveOffers, normalizeCouponCode, quoteFor } from '../lib/pricing.js';
import { newId } from '../lib/users.js';
import { purchaseSchema } from './paymentController.js';
import { Coupon, Offer } from '../types/index.js';

// Sales (offers), coupon codes and the prices they give. Prices come only from lib/pricing.ts;
// guests see a sale's headline (GET /promotions) and nothing else.

const TIERS = ['basic', 'pro', 'vip'] as const;
const CYCLES = ['monthly', 'annual'] as const;
const once = (list: string[]) => new Set(list).size === list.length;

// Either a percentage or a flat amount, never both. Empty tier or cycle lists mean all of them.
const discountShape = {
  percent_off: z.number('Enter a whole percentage.').int('Enter a whole percentage.').min(1).max(90, 'At most 90% off.').nullable().default(null),
  amount_off: z.number('Enter an amount in rupees.').int('Enter whole rupees.').min(1).max(100_000).nullable().default(null),
  tiers: z.array(z.enum(TIERS)).refine(once, 'List each plan once.').default([]),
  billing_cycles: z.array(z.enum(CYCLES)).refine(once, 'List each billing cycle once.').default([]),
  active: z.boolean().default(true)
};

function oneDiscount(d: { percent_off: number | null; amount_off: number | null }, ctx: z.RefinementCtx): void {
  if ((d.percent_off === null) === (d.amount_off === null)) {
    ctx.addIssue({ code: 'custom', path: ['percent_off'], message: 'Give a percentage or an amount off, not both.' });
  }
}

const instant = z.iso
  .datetime({ offset: true, error: 'Use a date and time like 2026-11-20T00:00:00Z.' })
  .transform(v => new Date(v).toISOString());

const offerBody = z
  .object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(80, 'Title must be at most 80 characters.'),
    banner_text: z.string().trim().max(160, 'Banner text must be at most 160 characters.').default(''),
    ...discountShape,
    starts_at: instant,
    ends_at: instant
  })
  .strict()
  .superRefine((o, ctx) => {
    oneDiscount(o, ctx);
    if (o.ends_at <= o.starts_at) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'The sale must end after it starts.' });
  });

const gymDate = z.string().refine(isValidDate, 'Use a date in YYYY-MM-DD format.');

const couponShape = {
  ...discountShape,
  valid_from: gymDate,
  valid_until: gymDate,
  max_uses: z.number('Enter a whole number.').int('Enter a whole number.').min(1).max(1_000_000).nullable().default(null),
  per_member_limit: z.number('Enter a whole number.').int('Enter a whole number.').min(1).max(1000).default(1)
};

function couponRules(c: z.infer<z.ZodObject<typeof couponShape>>, ctx: z.RefinementCtx): void {
  oneDiscount(c, ctx);
  if (c.valid_until < c.valid_from) {
    ctx.addIssue({ code: 'custom', path: ['valid_until'], message: 'The last day must be on or after the first day.' });
  }
}

// The code is fixed once made and `uses` is counted by payments, so neither is ever in an edit.
const couponFields = z.object(couponShape).strict().superRefine(couponRules);
const newCouponBody = z
  .object({
    code: z.string().max(40).trim().toUpperCase().regex(/^[A-Z0-9]{4,16}$/, 'Use 4 to 16 letters and digits.'),
    ...couponShape
  })
  .strict()
  .superRefine(couponRules);

/** The price of one plan for the signed-in account, with an optional coupon. */
export const getQuote = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { tier, billing_cycle, coupon_code } = parse(purchaseSchema, req.body);
  return ok(res, quoteFor(req.user!.id, tier, billing_cycle, coupon_code));
});

/** Every plan and cycle at today's price (sales applied, no coupon), for the Memberships page. */
export const getQuotes = asyncHandler<AuthenticatedRequest>((req, res: Response) =>
  ok(res, TIERS.flatMap(tier => CYCLES.map(cycle => quoteFor(req.user!.id, tier, cycle))))
);

/** The guest view: live sales' headlines, soonest end first, and the joining gifts by name. */
export const getPromotions = asyncHandler((_req: Request, res: Response) => {
  const sales = liveOffers()
    .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at))
    .map(guestSale);
  const nameOf = (id: string) => db.gifts.find(g => g.id === id && g.active)?.name;
  const joining_gifts = db.reward_settings.joining_gifts
    .map(j => ({ tier: j.tier, billing_cycle: j.billing_cycle, gifts: j.gift_ids.map(nameOf).filter((n): n is string => !!n) }))
    .filter(j => j.gifts.length > 0);
  return ok(res, { sales, joining_gifts });
});

/** Newest first. */
export const listOffers = asyncHandler((_req: Request, res: Response) => ok(res, [...db.offers].reverse()));

export const createOffer = asyncHandler((req: Request, res: Response) => {
  const offer: Offer = { id: newId('off'), ...parse(offerBody, req.body), created_at: new Date().toISOString() };
  db.offers = [...db.offers, offer];
  db.saveSync();
  return ok(res, offer, `${offer.title} was saved.`, 201);
});

/** The changes laid over the stored sale and checked as a whole; retire a sale with active: false. */
export const updateOffer = asyncHandler((req: Request, res: Response) => {
  const existing = db.offers.find(o => o.id === req.params.id);
  if (!existing) throw notFound('No sale with that id.', 'OFFER_NOT_FOUND');
  const { id, created_at, ...current } = existing;
  const next: Offer = { id, ...parse(offerBody, { ...current, ...req.body }), created_at };
  db.offers = db.offers.map(o => (o.id === id ? next : o));
  db.saveSync();
  return ok(res, next, `${next.title} was saved.`);
});

/** Newest first. Admins only: coupon codes never reach anyone else. */
export const listCoupons = asyncHandler((_req: Request, res: Response) => ok(res, [...db.coupons].reverse()));

export const createCoupon = asyncHandler((req: Request, res: Response) => {
  const { code, ...fields } = parse(newCouponBody, req.body);
  if (db.coupons.some(c => c.code === code)) throw conflict(`There is already a coupon ${code}.`, 'COUPON_EXISTS');
  const coupon: Coupon = { code, ...fields, uses: 0, created_at: new Date().toISOString() };
  db.coupons = [...db.coupons, coupon];
  db.saveSync();
  return ok(res, coupon, `Coupon ${code} was saved.`, 201);
});

export const updateCoupon = asyncHandler((req: Request, res: Response) => {
  const existing = db.coupons.find(c => c.code === normalizeCouponCode(req.params.code));
  if (!existing) throw notFound('No coupon with that code.', 'COUPON_NOT_FOUND');
  const { code, uses, created_at, ...current } = existing;
  const next: Coupon = { code, ...parse(couponFields, { ...current, ...req.body }), uses, created_at };
  db.coupons = db.coupons.map(c => (c.code === code ? next : c));
  db.saveSync();
  return ok(res, next, `Coupon ${code} was saved.`);
});
