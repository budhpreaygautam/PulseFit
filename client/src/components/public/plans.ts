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

/** The cheapest plan that lets a member book classes of this category. */
export function cheapestPlanFor(plans: MembershipPlan[], category: string): MembershipPlan | undefined {
  return [...plans].filter(p => planCovers(p, category)).sort((a, b) => a.price_monthly - b.price_monthly)[0];
}

export function cheapestPlan(plans: MembershipPlan[]): MembershipPlan | undefined {
  return [...plans].sort((a, b) => a.price_monthly - b.price_monthly)[0];
}
