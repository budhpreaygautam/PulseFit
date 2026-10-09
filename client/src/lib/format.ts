// Display helpers. The gym runs on India Standard Time, so dates and times are always shown
// in Asia/Kolkata, whatever timezone the visitor's device is in.

export const GYM_TIMEZONE = 'Asia/Kolkata';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** ₹1,499 (Indian digit grouping: ₹1,00,000) */
export function formatINR(amount: number): string {
  return inr.format(amount);
}

/** Today's date at the gym as YYYY-MM-DD (not the device's local date). */
export function gymToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GYM_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'Mon, 12 Oct 2026' for a YYYY-MM-DD calendar date. */
export function formatDate(date: string | null | undefined, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!date) return '—';
  // Calendar dates carry no time; format them at UTC midnight so no timezone can shift the day.
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/** '6:30 pm' for an ISO instant, at the gym. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: GYM_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** '6:30 pm' for a gym-local 'HH:MM'. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** '12 Oct 2026, 6:30 pm' for an ISO instant, at the gym. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: GYM_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Plan names as the catalogue (server/src/db/seed.ts) has them, for screens that do not load the
 * plans. Where the plans are loaded, prefer tierLabel(tier, plans): an admin can rename a plan.
 */
export const TIER_LABELS: Record<string, string> = {
  none: 'No plan',
  basic: 'Workout & Strength Pass',
  pro: 'Zumba & Cardio Pass',
  vip: 'Dual All-Access Pass (Strength + Zumba)'
};

/**
 * Short plan names for tight spots (badges, table cells, check-in log rows), where the full name
 * would squeeze out the member's name on a phone or push a table wider than its card.
 */
export const TIER_SHORT_LABELS: Record<string, string> = { none: 'No plan', basic: 'Strength', pro: 'Zumba & Cardio', vip: 'All-Access' };

/** The plan's name for a tier: from the loaded catalogue when there is one, else TIER_LABELS. */
export function tierLabel(tier: string | null | undefined, plans?: ReadonlyArray<{ tier: string; name: string }> | null): string {
  if (!tier) return TIER_LABELS.none;
  return plans?.find(p => p.tier === tier)?.name ?? TIER_LABELS[tier] ?? tier;
}

export const STATUS_LABELS: Record<string, string> = { active: 'Active', expired: 'Expired', pending: 'No active plan', frozen: 'Frozen' };
