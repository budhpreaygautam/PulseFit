import type { GiftClaim, MyRewards, StoreGift } from '../../types/index.js';

// What the app's Rewards card (Home) and Rewards section (Me) pick out of the member's rewards.

export interface NextMilestone {
  gift_name: string;
  remaining: number;
  type: 'visits' | 'streak';
}

/** The milestone gift closest to being earned, visits first on a tie; null when none is ahead. */
export function nextMilestone(r: MyRewards): NextMilestone | null {
  let best: NextMilestone | null = null;
  for (const m of r.milestones) {
    const value = m.type === 'visits' ? r.visits : r.streak;
    // Only milestones still ahead: one added below the member's count counts for future crossings only.
    if (m.reached || m.threshold <= value) continue;
    const remaining = m.threshold - value;
    if (!best || remaining < best.remaining || (remaining === best.remaining && m.type === 'visits' && best.type === 'streak')) {
      best = { gift_name: m.gift_name, remaining, type: m.type };
    }
  }
  return best;
}

export function milestoneLine({ gift_name, remaining, type }: NextMilestone): string {
  const unit = type === 'visits' ? 'visit' : 'visit-streak day';
  return `${remaining} more ${unit}${remaining === 1 ? '' : 's'} to ${gift_name}`;
}

const OPEN_ORDER: GiftClaim['status'][] = ['needs_size', 'ready', 'waiting'];

/** Gifts the member still has to act on or collect: sizes to choose first, then ready, then waiting; newest first in each. */
export function openClaims(claims: GiftClaim[]): GiftClaim[] {
  return claims
    .filter(c => OPEN_ORDER.includes(c.status))
    .sort((a, b) => OPEN_ORDER.indexOf(a.status) - OPEN_ORDER.indexOf(b.status) || b.created_at.localeCompare(a.created_at));
}

/** The `n` cheapest gifts in stock, by points and then name. */
export function cheapestGifts(gifts: StoreGift[], n = 3): StoreGift[] {
  return gifts
    .filter(g => g.in_stock)
    .sort((a, b) => a.points_cost - b.points_cost || a.name.localeCompare(b.name))
    .slice(0, n);
}
