import db from '../db/database.js';
import { unfreezeMembership as applyUnfreeze } from '../lib/billing.js';
import { displayDate, gymToday } from '../lib/dates.js';
import { asyncHandler, conflict, ok } from '../lib/http.js';
import { effectiveStatus } from '../lib/membership.js';
import { toSafeUser } from '../lib/users.js';
import { closeOpenSession, releaseMemberBookings } from '../lib/bookingRules.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { User } from '../types/index.js';

// A member can pause an active membership (travel, injury) and resume it later; the open gym
// days they could not use (lib/billing freezeCredit) are added back to the expiry when they unfreeze.

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
  saveUser({ ...user, membership_status: 'frozen', frozen_since: today });
  // A frozen member cannot come in, so the class spots they hold go back to others.
  const released = releaseMemberBookings(user.id);
  const sessionEnded = closeOpenSession(user.id);
  const message = ['Membership frozen.'];
  if (released > 0) message.push(`${released} upcoming class booking${released === 1 ? ' was' : 's were'} cancelled.`);
  if (sessionEnded) message.push('Your gym-floor session was ended.');
  // Re-read: ending the floor session may have counted a streak day.
  ok(res, toSafeUser(db.users.find(u => u.id === user.id)!), message.join(' '));
});

export const unfreezeMembership = asyncHandler<AuthenticatedRequest>(async (req, res) => {
  const user = db.users.find(u => u.id === req.user!.id)!;
  if (user.membership_status !== 'frozen') throw conflict('Your membership is not frozen.', 'NOT_FROZEN');

  const today = gymToday();
  const { unfrozen_days, ...resumed } = applyUnfreeze(user, today);
  ok(res, saveUser(resumed), unfreezeMessage(unfrozen_days, resumed.membership_expiry, today));
});

/** What the member reads after unfreezing: the gym days given back and the end date that follows. */
function unfreezeMessage(days: number, expiry: string | null, today: string): string {
  if (expiry && expiry < today) {
    return `Your membership is unfrozen, but it ended on ${displayDate(expiry)}. Renew your plan to keep coming in.`;
  }
  if (days > 0) {
    const added = `${days} gym day${days === 1 ? '' : 's'} added to your membership`;
    return expiry ? `Welcome back! ${added}, so it now runs until ${displayDate(expiry)}.` : `Welcome back! ${added}.`;
  }
  // The day of the freeze and the day of return were both usable, and closed days never were.
  return expiry
    ? `Welcome back! Your membership is active again. You did not miss any open gym days, so your end date stays ${displayDate(expiry)}.`
    : 'Welcome back! Your membership is active again. Your end date is unchanged.';
}
