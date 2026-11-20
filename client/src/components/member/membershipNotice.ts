import { User } from '../../types/index.js';
import { formatDate, gymToday } from '../../lib/format.js';

const EXPIRY_WARNING_DAYS = 7;

export interface MembershipNotice {
  tone: 'warn' | 'info';
  text: string;
  action: string;
  tab: string;
  params?: Record<string, string>;
}

function daysUntil(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${gymToday()}T00:00:00Z`)) / 86_400_000);
}

/** What the member should know (and do) about their membership, or null when all is well. */
export function membershipNotice(user: User): MembershipNotice | null {
  switch (user.membership_status) {
    case 'pending':
      return { tone: 'info', text: 'You do not have an active plan yet. Choose one to book classes and use the gym floor.', action: 'Choose a plan', tab: 'pricing' };
    case 'expired':
      return {
        tone: 'warn',
        text: user.membership_expiry ? `Your membership expired on ${formatDate(user.membership_expiry)}. Renew to book classes and check in.` : 'Your membership has expired. Renew to book classes and check in.',
        action: 'Renew membership',
        tab: 'pricing'
      };
    case 'frozen':
      return {
        tone: 'info',
        text: `Your membership is frozen${user.frozen_since ? ` since ${formatDate(user.frozen_since)}` : ''}. When you unfreeze, the days the gym was open while you were frozen are added to your end date.`,
        action: 'Manage membership',
        tab: 'profile',
        params: { tab: 'membership' }
      };
    case 'active': {
      if (!user.membership_expiry) return null;
      const days = daysUntil(user.membership_expiry);
      if (days > EXPIRY_WARNING_DAYS) return null;
      return {
        tone: 'warn',
        text: days <= 0 ? 'Your membership ends today.' : `Your membership ends in ${days} day${days === 1 ? '' : 's'}, on ${formatDate(user.membership_expiry)}.`,
        action: 'Renew membership',
        tab: 'pricing'
      };
    }
    default:
      return null;
  }
}
