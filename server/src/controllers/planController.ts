import { Request, Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { asyncHandler, notFound, ok, parse } from '../lib/http.js';
import { MembershipPlan } from '../types/index.js';
import { releaseUnentitledBookings } from '../lib/bookingRules.js';

// The plan catalogue (db.membership_plans) is the single source of truth for plan names,
// prices and entitlements. The client renders pricing from GET /api/plans.

export const getPlans = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, [...db.membership_plans].sort((a, b) => a.price_monthly - b.price_monthly));
});

// id and tier are fixed: orders, payments and members refer to a plan by its tier.
const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500),
    price_monthly: z.number().int().min(1).max(100_000),
    price_annual: z.number().int().min(1).max(1_200_000),
    features: z.array(z.string().trim().min(1).max(200)).max(20),
    categories: z.array(z.enum(['Workout & Strength', 'Zumba & Cardio'])),
    is_popular: z.boolean(),
    badge: z.string().trim().max(30)
  })
  .partial()
  .strict();

export const updatePlan = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const changes = parse(updatePlanSchema, req.body);
  const existing = db.membership_plans.find(p => p.id === req.params.id);
  if (!existing) throw notFound('That plan does not exist.');

  const updated: MembershipPlan = { ...existing, ...changes };
  if (changes.categories) updated.categories = [...new Set(changes.categories)];
  // An empty badge removes it.
  if (changes.badge === '') delete updated.badge;

  db.membership_plans = db.membership_plans.map(p => (p.id === existing.id ? updated : p));
  // Narrower entitlements: members on this plan lose bookings in categories it no longer covers.
  const released = changes.categories ? releaseUnentitledBookings({ tier: existing.tier }) : 0;
  const message = released > 0
    ? `Plan updated. ${released} upcoming booking${released === 1 ? ' was' : 's were'} cancelled because the plan no longer covers those classes.`
    : 'Plan updated.';
  ok(res, updated, message);
});
