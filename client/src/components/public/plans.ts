import { ClassCategory, MembershipPlan } from '../../types/index.js';

/** Whole-percent saving of the annual price over twelve monthly payments (rounded down, never overstated). */
export function annualSavingPercent(plan: MembershipPlan): number {
  const twelveMonths = plan.price_monthly * 12;
  if (twelveMonths <= 0 || plan.price_annual >= twelveMonths) return 0;
  return Math.floor(((twelveMonths - plan.price_annual) / twelveMonths) * 100);
}

/** The annual price spread over 12 months, rounded to the rupee. */
export function annualPerMonth(plan: MembershipPlan): number {
  return Math.round(plan.price_annual / 12);
}

export function planCovers(plan: MembershipPlan, category: string): boolean {
  return plan.categories.length === 0 || plan.categories.includes(category as ClassCategory);
}

/**
 * The cheapest plan that lets a member book classes of this category. With `keeping`, the plan must also
 * cover everything that plan covers, so a member is never pointed at a switch that takes classes away.
 */
export function cheapestPlanFor(plans: MembershipPlan[], category: string, keeping?: MembershipPlan): MembershipPlan | undefined {
  const keeps = (p: MembershipPlan) =>
    !keeping || p.categories.length === 0 || (keeping.categories.length > 0 && keeping.categories.every(c => p.categories.includes(c)));
  return [...plans].filter(p => planCovers(p, category) && keeps(p)).sort((a, b) => a.price_monthly - b.price_monthly)[0];
}

export function cheapestPlan(plans: MembershipPlan[]): MembershipPlan | undefined {
  return [...plans].sort((a, b) => a.price_monthly - b.price_monthly)[0];
}
