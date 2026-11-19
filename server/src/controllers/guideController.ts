import { Response } from 'express';
import { GUIDE } from '../content/guide.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { gymToday } from '../lib/dates.js';
import { asyncHandler, forbidden, ok } from '../lib/http.js';
import { effectiveStatus, isStaff } from '../lib/membership.js';

// The full fitness guide, for staff and for members with a plan (active or frozen). The route
// requires a session; members who have not chosen a plan yet (pending) or whose plan has ended get
// 403 PLAN_REQUIRED and none of it, and the client shows them the teaser and a way to choose a plan.
// A freeze pauses a plan without extending it: frozen, the guide stays open up to the paid end date
// (unfreezing adds the missed days back, and with them the guide), so freezing cannot keep it for ever.
export const getGuide = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = req.user!;
  const status = effectiveStatus(user);
  const hasPlan = status === 'active' || (status === 'frozen' && !!user.membership_expiry && user.membership_expiry >= gymToday());
  if (!isStaff(user) && !hasPlan) {
    throw forbidden('Choose a membership plan to open the full workout plans, diet charts and supplements guide.', 'PLAN_REQUIRED');
  }
  // Only for signed-in accounts: no shared cache (a proxy or CDN) may keep a copy to hand to guests.
  res.set('Cache-Control', 'private, no-cache');
  return ok(res, GUIDE);
});
