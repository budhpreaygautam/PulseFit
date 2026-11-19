import { Request, Response } from 'express';
import { GUIDE } from '../content/guide.js';
import { asyncHandler, ok } from '../lib/http.js';

// The full fitness guide for any signed-in account (the route requires a session); guests see the
// teaser the client renders and a call to sign in.
export const getGuide = asyncHandler((_req: Request, res: Response) => {
  // Only for signed-in accounts: no shared cache (a proxy or CDN) may keep a copy to hand to guests.
  res.set('Cache-Control', 'private, no-cache');
  return ok(res, GUIDE);
});
