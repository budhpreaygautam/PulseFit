import db from '../db/database.js';
import { unfreezeMembership as applyUnfreeze } from '../lib/billing.js';
import { gymToday } from '../lib/dates.js';
import { asyncHandler, conflict, ok } from '../lib/http.js';
import { effectiveStatus } from '../lib/membership.js';
import { toSafeUser } from '../lib/users.js';
import { closeOpenSession, releaseMemberBookings } from '../lib/bookingRules.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { User } from '../types/index.js';

// A member can pause an active membership (travel, injury) and resume it later; the paid
// days they could not use are added back to the expiry when they unfreeze.

function saveUser(updated: User) {
  db.users = db.users.map(u => (u.id === updated.id ? updated : u));
  return toSafeUser(updated);
}

export const freezeMembership = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const user = db.users.find(u => u.id === req.user!.id)!;
  const today = gymToday();
  const status = effectiveStatus(user, today);
  if (status !== 'active') {
    throw conflict(
      status === 'frozen' ? 'Your membership is already frozen.' : 'Only an active membership can be frozen.',
      'NOT_ACTIVE'
    );
  }
  const frozen = saveUser({ ...user, membership_status: 'frozen', frozen_since: today });
  // A frozen member cannot come in, so the class spots they hold go back to others.
  const released = releaseMemberBookings(user.id);
  closeOpenSession(user.id);
  const message = released > 0
    ? `Membership frozen. ${released} upcoming class booking${released === 1 ? ' was' : 's were'} cancelled.`
    : 'Membership frozen.';
  ok(res, frozen, message);
});

export const unfreezeMembership = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const user = db.users.find(u => u.id === req.user!.id)!;
  if (user.membership_status !== 'frozen') throw conflict('Your membership is not frozen.', 'NOT_FROZEN');

  const { unfrozen_days, ...resumed } = applyUnfreeze(user, gymToday());
  const message = unfrozen_days > 0
    ? `Welcome back! ${unfrozen_days} day${unfrozen_days === 1 ? '' : 's'} added to your membership.`
    : 'Welcome back! Your membership is active again.';
  ok(res, saveUser(resumed), message);
});
