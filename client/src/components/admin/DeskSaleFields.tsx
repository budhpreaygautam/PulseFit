import React, { useEffect } from 'react';
import { BillingCycle, DeskSale, DeskSaleForm, MembershipPlan, PaidTier } from '../../types/index.js';
import { tierLabel } from '../../lib/format.js';
import { FieldError, hintClass, inputClass, labelClass } from './ui.js';

const TIERS: PaidTier[] = ['basic', 'pro', 'vip'];
const METHODS: { value: DeskSale['method']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' }
];

/** The plan's list price for a cycle, as the amount field's text; '' while the plans load. */
export function listPrice(plans: MembershipPlan[] | null, tier: PaidTier, cycle: BillingCycle): string {
  const plan = plans?.find(p => p.tier === tier);
  return plan ? String(cycle === 'annual' ? plan.price_annual : plan.price_monthly) : '';
}

export function deskSaleErrors(sale: DeskSaleForm): Record<string, string> {
  const amount = sale.amount_inr.trim();
  return /^\d+$/.test(amount) && Number(amount) >= 1 && Number(amount) <= 1_200_000 ? {} : { amount_inr: 'Enter the amount collected in whole rupees.' };
}

export const toDeskSale = (sale: DeskSaleForm): DeskSale => ({ ...sale, amount_inr: Number(sale.amount_inr.trim()) });

interface DeskSaleFieldsProps {
  value: DeskSaleForm;
  onChange: (value: DeskSaleForm) => void;
  errors: Record<string, string>;
  plans: MembershipPlan[] | null;
  idPrefix: string;
  /** False where the form's own Plan select already picks the plan sold (Add member). */
  showPlan?: boolean;
}

/** A plan paid for at the desk: plan, cycle, the amount collected (the list price until changed) and how it was paid. */
export const DeskSaleFields: React.FC<DeskSaleFieldsProps> = ({ value, onChange, errors, plans, idPrefix, showPlan = true }) => {
  // The list price, once the plans arrive. An amount already there (typed, or kept from before) stays.
  useEffect(() => {
    if (!value.amount_inr && plans) onChange({ ...value, amount_inr: listPrice(plans, value.tier, value.billing_cycle) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const choose = (tier: PaidTier, billing_cycle: BillingCycle) => onChange({ ...value, tier, billing_cycle, amount_inr: listPrice(plans, tier, billing_cycle) });
  const id = (field: string) => `${idPrefix}-${field}`;
  const error = (field: string) => ({ 'aria-invalid': !!errors[field], 'aria-describedby': errors[field] ? `${id(field)}-error` : undefined });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {showPlan && (
        <div>
          <label htmlFor={id('tier')} className={labelClass}>
            Plan sold
          </label>
          <select id={id('tier')} value={value.tier} onChange={e => choose(e.target.value as PaidTier, value.billing_cycle)} className={inputClass} {...error('tier')}>
            {TIERS.map(t => (
              <option key={t} value={t}>
                {tierLabel(t, plans)}
              </option>
            ))}
          </select>
          <FieldError id={`${id('tier')}-error`} message={errors.tier} />
        </div>
      )}
      <div>
        <label htmlFor={id('cycle')} className={labelClass}>
          Billing
        </label>
        <select id={id('cycle')} value={value.billing_cycle} onChange={e => choose(value.tier, e.target.value as BillingCycle)} className={inputClass} {...error('billing_cycle')}>
          <option value="monthly">Monthly (1 month)</option>
          <option value="annual">Annual (12 months)</option>
        </select>
        <FieldError id={`${id('billing_cycle')}-error`} message={errors.billing_cycle} />
      </div>
      <div>
        <label htmlFor={id('amount')} className={labelClass}>
          Amount collected (₹)
        </label>
        <input
          id={id('amount')}
          type="number"
          inputMode="numeric"
          min={1}
          value={value.amount_inr}
          onChange={e => onChange({ ...value, amount_inr: e.target.value })}
          className={inputClass}
          aria-invalid={!!errors.amount_inr}
          aria-describedby={`${id('amount')}-hint${errors.amount_inr ? ` ${id('amount_inr')}-error` : ''}`}
        />
        <p id={`${id('amount')}-hint`} className={hintClass}>
          The list price. Change it to what was collected; sales and coupons do not apply at the desk.
        </p>
        <FieldError id={`${id('amount_inr')}-error`} message={errors.amount_inr} />
      </div>
      <div>
        <label htmlFor={id('method')} className={labelClass}>
          Paid by
        </label>
        <select id={id('method')} value={value.method} onChange={e => onChange({ ...value, method: e.target.value as DeskSale['method'] })} className={inputClass} {...error('method')}>
          {METHODS.map(m => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <FieldError id={`${id('method')}-error`} message={errors.method} />
      </div>
    </div>
  );
};
