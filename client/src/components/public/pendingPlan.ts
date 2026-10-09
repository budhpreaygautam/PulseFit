import { BillingCycle, PaidTier } from '../../types/index.js';

// A guest who picks a plan is asked to create an account first. The choice is kept for this tab
// only, so that after registering they land back on the pricing page with that plan in view.
// It belongs to the sign-in dialog opened for it: AuthModal clears it when that dialog closes
// without a sign-in, and on a demo sign-in, so it never steers a later, unrelated sign-in.

const KEY = 'pulsefit_pending_plan';

export interface PendingPlan {
  tier: PaidTier;
  cycle: BillingCycle;
}

export function rememberPendingPlan(plan: PendingPlan): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* storage blocked: the visitor just picks the plan again */
  }
}

export function clearPendingPlan(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing was kept */
  }
}

export function takePendingPlan(): PendingPlan | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const plan = JSON.parse(raw) as PendingPlan;
    return ['basic', 'pro', 'vip'].includes(plan.tier) && ['monthly', 'annual'].includes(plan.cycle) ? plan : null;
  } catch {
    return null;
  }
}
