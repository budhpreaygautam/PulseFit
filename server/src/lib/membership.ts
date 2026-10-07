import db from '../db/database.js';
import { gymToday } from './dates.js';
import { ClassCategory, MembershipStatus, MembershipTier, User } from '../types/index.js';

// One place for "may this person use the gym right now?" so check-in, bookings and
// clock-in can never disagree.

/**
 * Status as of today: a stored 'active' membership whose expiry date has passed is 'expired'.
 * Frozen and pending memberships keep their stored status.
 */
export function effectiveStatus(user: Pick<User, 'membership_status' | 'membership_expiry'>, today = gymToday()): MembershipStatus {
  if (user.membership_status === 'active') {
    if (!user.membership_expiry || user.membership_expiry < today) return 'expired';
  }
  return user.membership_status;
}

export function isMembershipActive(user: Pick<User, 'membership_status' | 'membership_expiry'>, today = gymToday()): boolean {
  return effectiveStatus(user, today) === 'active';
}

/** Staff (admins and trainers) are never blocked by membership rules. */
export function isStaff(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin' || user.role === 'trainer';
}

/**
 * Class categories a tier may book, read from the plan catalogue (membership_plans.categories).
 * An empty list on the plan means every category.
 */
export function allowedCategories(tier: MembershipTier): ClassCategory[] | 'all' {
  if (tier === 'none') return [];
  const plan = db.membership_plans.find(p => p.tier === tier);
  if (!plan || !plan.categories || plan.categories.length === 0) return 'all';
  return plan.categories;
}

export function tierAllowsCategory(tier: MembershipTier, category: string): boolean {
  const allowed = allowedCategories(tier);
  return allowed === 'all' || (allowed as string[]).includes(category);
}

/**
 * Persist 'expired' on users whose paid period has ended, so stored data and admin filters
 * agree with what check-in enforces. Cheap enough to run on each authenticated request.
 */
export function expireLapsedMemberships(today = gymToday()): number {
  let changed = 0;
  const users = db.users.map(u => {
    if (u.membership_status === 'active' && (!u.membership_expiry || u.membership_expiry < today)) {
      changed++;
      return { ...u, membership_status: 'expired' as const };
    }
    return u;
  });
  if (changed > 0) db.users = users;
  return changed;
}
