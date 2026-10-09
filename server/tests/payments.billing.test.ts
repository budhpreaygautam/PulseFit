import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  computeActivation,
  creditDays,
  freezeCredit,
  hmacMatches,
  MembershipState,
  nextInvoiceNumber,
  periodEnd,
  planPrice,
  remainingDays,
  unfreezeMembership
} from '../src/lib/billing.js';
import { addDays, daysBetween } from '../src/lib/dates.js';

const plans = [
  { tier: 'basic' as const, price_monthly: 1199 },
  { tier: 'pro' as const, price_monthly: 1499 },
  { tier: 'vip' as const, price_monthly: 1999 }
];

const member = (over: Partial<MembershipState>): MembershipState => ({
  membership_tier: 'basic',
  membership_status: 'active',
  membership_expiry: '2026-10-31',
  frozen_since: null,
  ...over
});

describe('billing: periods', () => {
  it('prices a plan by cycle, annual being the yearly total', () => {
    expect(planPrice({ price_monthly: 1199, price_annual: 11988 }, 'monthly')).toBe(1199);
    expect(planPrice({ price_monthly: 1199, price_annual: 11988 }, 'annual')).toBe(11988);
  });

  it('uses calendar months, not 30-day blocks (regression: annual was 360 days)', () => {
    expect(periodEnd('2026-10-07', 'monthly')).toBe('2026-11-06');
    expect(periodEnd('2026-10-07', 'annual')).toBe('2027-10-06');
    expect(periodEnd('2026-02-01', 'monthly')).toBe('2026-02-28');
    expect(periodEnd('2028-02-01', 'monthly')).toBe('2028-02-29');
    expect(periodEnd('2026-01-28', 'monthly')).toBe('2026-02-27');
  });

  it('runs a period to the end of a month too short for its start day (review: Jan 28-31 all ended Feb 27)', () => {
    expect(periodEnd('2026-01-29', 'monthly')).toBe('2026-02-28');
    expect(periodEnd('2026-01-30', 'monthly')).toBe('2026-02-28');
    expect(periodEnd('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(periodEnd('2028-01-30', 'monthly')).toBe('2028-02-29');
    expect(periodEnd('2026-03-31', 'monthly')).toBe('2026-04-30');
    expect(periodEnd('2026-03-30', 'monthly')).toBe('2026-04-29');
    expect(periodEnd('2026-08-31', 'monthly')).toBe('2026-09-30');
    expect(periodEnd('2026-12-31', 'monthly')).toBe('2027-01-30');
    expect(periodEnd('2028-02-29', 'monthly')).toBe('2028-03-28');
    expect(periodEnd('2028-02-29', 'annual')).toBe('2029-02-28');
    expect(periodEnd('2027-02-28', 'annual')).toBe('2028-02-27');
  });

  it('never gives a monthly period fewer days than its calendar month allows, and renewals do not drift', () => {
    // Back-to-back renewals from Jan 31: every later period is a whole calendar month.
    const chain: string[][] = [];
    let start = '2026-01-31';
    for (let i = 0; i < 4; i++) {
      const end = periodEnd(start, 'monthly');
      chain.push([start, end]);
      start = addDays(end, 1);
    }
    expect(chain).toEqual([
      ['2026-01-31', '2026-02-28'],
      ['2026-03-01', '2026-03-31'],
      ['2026-04-01', '2026-04-30'],
      ['2026-05-01', '2026-05-31']
    ]);
    for (let d = 1; d <= 31; d++) {
      const s = `2026-01-${String(d).padStart(2, '0')}`;
      expect(daysBetween(s, periodEnd(s, 'monthly')) + 1).toBeGreaterThanOrEqual(28);
    }
  });

  it('credits the open days strictly between the freeze date and today', () => {
    // Fri 2 Oct to Wed 7 Oct: Sat 3, Mon 5 and Tue 6 were missed; Sunday 4 was closed anyway.
    expect(freezeCredit('2026-10-02', '2026-10-07')).toBe(3);
    expect(freezeCredit('2026-10-07', '2026-10-07')).toBe(0);
    expect(freezeCredit(null, '2026-10-07')).toBe(0);
    expect(freezeCredit('2026-10-09', '2026-10-07')).toBe(0);
  });

  it('counts remaining days including today, and none once expired', () => {
    expect(remainingDays('2026-10-24', '2026-10-07')).toBe(18);
    expect(remainingDays('2026-10-07', '2026-10-07')).toBe(1);
    expect(remainingDays('2026-10-06', '2026-10-07')).toBe(0);
    expect(remainingDays(null, '2026-10-07')).toBe(0);
  });

  it('converts unused days at the new plan price, rounding down', () => {
    expect(creditDays(18, 1499, 1999)).toBe(13);
    expect(creditDays(10, 1999, 1199)).toBe(16);
    expect(creditDays(0, 1499, 1999)).toBe(0);
    expect(creditDays(5, 0, 1999)).toBe(0);
  });
});

describe('billing: unfreeze', () => {
  it('moves the expiry forward by the open days missed and clears the freeze', () => {
    const out = unfreezeMembership(member({ membership_status: 'frozen', frozen_since: '2026-10-02' }), '2026-10-07');
    // 3 open days after Sat 31 Oct: Mon 2, Tue 3, Wed 4 Nov.
    expect(out).toMatchObject({ membership_status: 'active', membership_expiry: '2026-11-04', frozen_since: null, unfrozen_days: 3 });
  });

  it('leaves a membership that is not frozen unchanged', () => {
    const state = member({});
    expect(unfreezeMembership(state, '2026-10-07')).toEqual({ ...state, unfrozen_days: 0 });
  });
});

describe('billing: computeActivation', () => {
  const today = '2026-10-07';

  it('extends the same active tier from the day after the current expiry', () => {
    const a = computeActivation(member({}), { tier: 'basic', billing_cycle: 'monthly' }, plans, today);
    expect(a).toMatchObject({
      membership_tier: 'basic',
      membership_status: 'active',
      period_start: '2026-11-01',
      period_end: '2026-11-30',
      membership_expiry: '2026-11-30',
      credit_days: 0
    });
  });

  it('extends the same tier by 12 calendar months for annual', () => {
    const a = computeActivation(member({}), { tier: 'basic', billing_cycle: 'annual' }, plans, today);
    expect(a.period_start).toBe('2026-11-01');
    expect(a.membership_expiry).toBe('2027-10-31');
  });

  it('gives a full month to a renewal or purchase that starts on the 29th-31st', () => {
    const renewal = computeActivation(member({ membership_expiry: '2027-01-30' }), { tier: 'basic', billing_cycle: 'monthly' }, plans, '2027-01-20');
    expect(renewal).toMatchObject({ period_start: '2027-01-31', period_end: '2027-02-28' });
    const fresh = computeActivation(member({ membership_status: 'expired', membership_expiry: '2026-12-01' }), { tier: 'pro', billing_cycle: 'monthly' }, plans, '2027-01-31');
    expect(fresh).toMatchObject({ period_start: '2027-01-31', period_end: '2027-02-28' });
    const leapAnnual = computeActivation(member({ membership_status: 'expired', membership_expiry: '2027-12-01' }), { tier: 'vip', billing_cycle: 'annual' }, plans, '2028-02-29');
    expect(leapAnnual.membership_expiry).toBe('2029-02-28');
  });

  it('starts today when the same tier has expired, with no credit', () => {
    const a = computeActivation(member({ membership_expiry: '2026-08-01' }), { tier: 'basic', billing_cycle: 'monthly' }, plans, today);
    expect(a).toMatchObject({ period_start: today, membership_expiry: '2026-11-06', credit_days: 0 });
  });

  it('treats a stored-expired status the same as a lapsed date', () => {
    const a = computeActivation(member({ membership_status: 'expired' }), { tier: 'basic', billing_cycle: 'monthly' }, plans, today);
    expect(a).toMatchObject({ period_start: today, credit_days: 0 });
  });

  it('starts today and credits unused days of a different active plan', () => {
    const a = computeActivation(
      member({ membership_tier: 'pro', membership_expiry: '2026-10-24' }),
      { tier: 'vip', billing_cycle: 'monthly' },
      plans,
      today
    );
    // 18 days left of pro at 1499 => floor(18 * 1499 / 1999) = 13 days of vip
    expect(a).toMatchObject({ period_start: today, credit_days: 13, membership_expiry: '2026-11-19', period_end: '2026-11-19' });
  });

  it('credits a downgrade with more days than were left', () => {
    const a = computeActivation(
      member({ membership_tier: 'vip', membership_expiry: '2026-10-16' }),
      { tier: 'basic', billing_cycle: 'monthly' },
      plans,
      today
    );
    expect(a.credit_days).toBe(16); // floor(10 * 1999 / 1199)
    expect(a.membership_expiry).toBe('2026-11-22');
  });

  it('gives no credit to a member who never had a plan', () => {
    const a = computeActivation(
      member({ membership_tier: 'none', membership_status: 'pending', membership_expiry: null }),
      { tier: 'pro', billing_cycle: 'monthly' },
      plans,
      today
    );
    expect(a).toMatchObject({ period_start: today, credit_days: 0, membership_expiry: '2026-11-06', membership_tier: 'pro' });
  });

  it('unfreezes a frozen member first, then extends the same tier', () => {
    const a = computeActivation(
      member({ membership_status: 'frozen', frozen_since: '2026-10-02' }),
      { tier: 'basic', billing_cycle: 'monthly' },
      plans,
      today
    );
    expect(a).toMatchObject({ unfrozen_days: 3, period_start: '2026-11-05', membership_expiry: '2026-12-04', frozen_since: null });
  });

  it('unfreezes a frozen member first, then credits the extended days on a plan change', () => {
    const a = computeActivation(
      member({ membership_tier: 'pro', membership_status: 'frozen', membership_expiry: '2026-10-24', frozen_since: '2026-10-02' }),
      { tier: 'vip', billing_cycle: 'monthly' },
      plans,
      today
    );
    // expiry becomes 10-28 (3 open days after Sat 24 Oct) => 22 days left => floor(22 * 1499 / 1999) = 16
    expect(a).toMatchObject({ unfrozen_days: 3, credit_days: 16, period_start: today, membership_expiry: '2026-11-22' });
  });
});

describe('billing: invoices and signatures', () => {
  it('numbers invoices PF-<year>-<6 digits>, continuing the sequence', () => {
    expect(nextInvoiceNumber([], 2026)).toBe('PF-2026-000001');
    expect(nextInvoiceNumber(['PF-2026-000041', 'PF-2026-000007'], 2026)).toBe('PF-2026-000042');
    expect(nextInvoiceNumber(['PF-2026-000041'], 2027)).toBe('PF-2027-000042');
    expect(nextInvoiceNumber(['INV-2026-0901', 'PF-2026-000003'], '2026')).toBe('PF-2026-000004');
  });

  it('accepts only the exact HMAC-SHA256 of the payload', () => {
    const sig = crypto.createHmac('sha256', 's3cret').update('order_1|pay_1').digest('hex');
    expect(hmacMatches('order_1|pay_1', sig, 's3cret')).toBe(true);
    expect(hmacMatches(Buffer.from('order_1|pay_1'), sig, 's3cret')).toBe(true);
    expect(hmacMatches('order_1|pay_2', sig, 's3cret')).toBe(false);
    expect(hmacMatches('order_1|pay_1', sig, 'other')).toBe(false);
    expect(hmacMatches('order_1|pay_1', sig.slice(0, 10), 's3cret')).toBe(false);
    expect(hmacMatches('order_1|pay_1', undefined, 's3cret')).toBe(false);
    expect(hmacMatches('order_1|pay_1', crypto.createHmac('sha256', '').update('order_1|pay_1').digest('hex'), '')).toBe(false);
  });
});
