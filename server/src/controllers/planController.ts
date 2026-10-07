import { Request, Response } from 'express';
import db from '../db/database.js';
import { asyncHandler, ok } from '../lib/http.js';

// The plan catalogue (db.membership_plans) is the single source of truth for plan names,
// prices and entitlements. The client renders pricing from GET /api/plans.

export const getPlans = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, db.membership_plans);
});
