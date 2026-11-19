import React, { useState } from 'react';
import { Loader2, TicketPercent } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { BillingCycle, PaidTier, Quote } from '../../types/index.js';

interface CouponFieldProps {
  tier: PaidTier;
  billingCycle: BillingCycle;
  /** The price with the coupon once one is applied; null when it is removed. */
  onQuote: (quote: Quote | null) => void;
}

/**
 * A coupon code for one plan and cycle. The server checks it and prices the plan (POST
 * /payment/quote); the browser never works out a discount. It is here, not in components/public,
 * because only signed-in members can ask for a quote.
 */
export const CouponField: React.FC<CouponFieldProps> = ({ tier, billingCycle, onQuote }) => {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const id = `coupon-${tier}`;

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setMessage({ text: 'Enter a coupon code.', isError: true });
      return;
    }
    setIsChecking(true);
    setMessage(null);
    try {
      const quote = await api.getPaymentQuote({ tier, billing_cycle: billingCycle, coupon_code: code });
      if (quote.applied?.type === 'coupon') {
        setLabel(quote.applied.label);
        onQuote(quote);
      } else {
        // The code works, but the live sale takes more off (a tie goes to the sale), or nothing is left to take off.
        setMessage({ text: quote.applied ? 'The sale price is already lower.' : 'This coupon takes nothing off this plan.', isError: false });
      }
    } catch (err) {
      // COUPON_* and RATE_LIMITED messages say what is wrong with the code.
      setMessage({ text: errorMessage(err), isError: true });
    } finally {
      setIsChecking(false);
    }
  };

  const remove = () => {
    setLabel(null);
    setCode('');
    setMessage(null);
    onQuote(null);
  };

  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl neu-pressed-sm text-xs">
          <span className="flex items-center gap-1.5 min-w-0 font-bold text-lime-400">
            <TicketPercent className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span id={`${id}-applied`} className="truncate">
              {label}
            </span>
          </span>
          {/* Focus moves here from Apply, which is gone, and the applied coupon is read with it. */}
          <button type="button" autoFocus onClick={remove} aria-describedby={`${id}-applied`} className="neu-btn px-2.5 py-1 rounded-lg font-bold text-slate-200 shrink-0">
            Remove
          </button>
        </div>
      ) : (
        <form onSubmit={apply} className="space-y-1" noValidate>
          <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Coupon code
          </label>
          <div className="flex gap-2">
            <input
              id={id}
              type="text"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              value={code}
              onChange={e => setCode(e.target.value)}
              aria-invalid={message?.isError ? true : undefined}
              aria-describedby={message ? `${id}-message` : undefined}
              className="flex-1 min-w-0 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 uppercase"
            />
            <button type="submit" disabled={isChecking} className="neu-btn px-3.5 py-2 rounded-xl text-xs font-bold text-slate-100 flex items-center gap-1.5 shrink-0 disabled:opacity-60">
              {isChecking && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Apply
            </button>
          </div>
        </form>
      )}
      {message && (
        <p id={`${id}-message`} role={message.isError ? 'alert' : 'status'} className={`text-[11px] font-semibold ${message.isError ? 'text-rose-400' : 'text-slate-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};
