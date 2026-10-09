import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Dumbbell, Info, Loader2, Lock, Music2, Sparkles, Store, XCircle, Zap } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiData } from '../../components/public/useApiData.js';
import { annualPerMonth, annualSavingPercent, planCovers } from '../../components/public/plans.js';
import { rememberPendingPlan } from '../../components/public/pendingPlan.js';
import { CATEGORIES, weekdayOf } from '../../components/public/gymInfo.js';
import { useAuth } from '../../context/AuthContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useRazorpay } from '../../hooks/useRazorpay.js';
import { api } from '../../api/client.js';
import { addDays, formatDate, formatINR, gymToday, STATUS_LABELS } from '../../lib/format.js';
import { BillingCycle, MembershipPlan, PaidTier, User } from '../../types/index.js';

interface PricingPageProps {
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

const PLAN_ICONS: Record<PaidTier, React.ComponentType<{ className?: string }>> = { basic: Dumbbell, pro: Music2, vip: Zap };

interface PlanAction {
  label: string;
  note?: string;
  isCurrent: boolean;
}

/**
 * The plan's last day once any freeze is lifted. Before it applies a payment the server gives back
 * the days the gym was open while frozen (not the day of the freeze, today or closed days) and moves
 * the end date forward by that many open days, stepping over closed days (lib/billing.ts).
 */
function endAfterUnfreeze(user: User, closedWeekdays: number[]): string | null {
  if (!user.membership_expiry) return null;
  if (user.membership_status !== 'frozen' || !user.frozen_since) return user.membership_expiry;
  // A week with no open day would never end; the config never says that, but do not hang on it.
  if (closedWeekdays.length >= 7) return user.membership_expiry;
  const isOpen = (date: string) => !closedWeekdays.includes(weekdayOf(date));
  let openDays = 0;
  for (let d = addDays(user.frozen_since, 1); d < gymToday(); d = addDays(d, 1)) if (isOpen(d)) openDays++;
  let end = user.membership_expiry;
  for (let i = 0; i < openDays; i++) {
    end = addDays(end, 1);
    while (!isOpen(end)) end = addDays(end, 1);
  }
  return end;
}

/** What buying this plan would do for the signed-in account, following the server's activation rules. */
function planAction(plan: MembershipPlan, user: User | null, plans: MembershipPlan[], closedWeekdays: number[]): PlanAction {
  if (!user || user.membership_tier === 'none') return { label: `Choose ${plan.name}`, isCurrent: false };

  const status = user.membership_status;
  const lastDay = status === 'active' || status === 'frozen' ? endAfterUnfreeze(user, closedWeekdays) : null;
  const hasRunningPlan = !!lastDay && lastDay >= gymToday();
  const current = plans.find(p => p.tier === user.membership_tier);
  const frozenNote = status === 'frozen' ? ' Paying unfreezes your membership first and adds back the days the gym was open while it was frozen.' : '';

  if (plan.tier === user.membership_tier) {
    if (hasRunningPlan && lastDay) {
      return {
        label: 'Renew this plan',
        note: `The new period starts on ${formatDate(addDays(lastDay, 1))}, the day after your current one ends.${frozenNote}`,
        isCurrent: true
      };
    }
    return { label: 'Renew this plan', note: 'Your plan has ended, so the new period starts today.', isCurrent: true };
  }

  if (hasRunningPlan) {
    return {
      label: `Switch to ${plan.name}`,
      note: `Starts today. The unused days of your ${current?.name ?? 'current plan'} are credited pro-rata as extra days on this plan.${frozenNote}`,
      isCurrent: false
    };
  }
  return { label: `Choose ${plan.name}`, note: 'Starts today.', isCurrent: false };
}

export const PricingPage: React.FC<PricingPageProps> = ({ onOpenAuthModal, onOpenFreeTrialModal }) => {
  const { params } = useNavigation();
  const requestedTier = params.get('plan') as PaidTier | null;
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(params.get('cycle') === 'annual' ? 'annual' : 'monthly');
  // Keyed by the question's id: the plans answer appears once plans load, which shifts positions.
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [payingTier, setPayingTier] = useState<PaidTier | null>(null);
  const { user } = useAuth();
  const { config, isConfigLoaded } = useAppConfig();
  const { showToast } = useToast();
  const { checkout, isProcessing, error, clearError } = useRazorpay();
  const { data: plans, error: loadError, isLoading, reload } = useApiData(() => api.getPlans());

  // A guest who picked a plan before creating an account comes back here with it in view.
  useEffect(() => {
    if (!plans || !requestedTier) return;
    document.getElementById(`plan-${requestedTier}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [plans, requestedTier]);

  const maxSaving = useMemo(() => Math.max(0, ...(plans ?? []).map(annualSavingPercent)), [plans]);
  const currentPlan = plans?.find(p => p.tier === user?.membership_tier);

  const handleChoosePlan = async (plan: MembershipPlan) => {
    clearError();
    if (!user) {
      rememberPendingPlan({ tier: plan.tier, cycle: billingCycle });
      showToast('Create a free account first, then pay for your plan.', 'info');
      onOpenAuthModal('register');
      return;
    }
    setPayingTier(plan.tier);
    await checkout({
      tier: plan.tier,
      billingCycle,
      onSuccess: ({ payment, user: updated, message }) => {
        // The server's message says everything the payment did, including class bookings a plan change
        // cancelled. It opens with the toast's own title, so that part is not said twice.
        if (message) {
          showToast(message.replace(/^Payment received\.\s*/, '') || message, 'success', 'Payment received');
          return;
        }
        const until = payment?.period_end ?? updated.membership_expiry;
        showToast(`${plan.name} is paid${until ? `. Your membership now runs until ${formatDate(until)}` : ''}.`, 'success', 'Payment received');
      }
    });
  };

  const faqs = [
    {
      id: 'classes',
      q: 'Which classes can I book with each plan?',
      a: (plans ?? [])
        .map(p => `${p.name}: ${p.categories.length === 0 ? 'every class on the timetable' : `${p.categories.join(' and ')} classes`}.`)
        .join(' ')
    },
    {
      id: 'fees',
      q: 'Are there sign-up fees, or does my plan renew automatically?',
      a: 'There is no sign-up fee: you pay the plan price shown here, in rupees. Plans never renew on their own. When a period ends you decide whether to buy another one.'
    },
    {
      id: 'switch',
      q: 'Can I switch plans later?',
      a: 'Yes. A different plan starts the day you pay for it, and the unused days of your current plan are credited pro-rata as extra days on the new one. Renewing the same plan adds the new period after your current one ends, so you never lose days.'
    },
    {
      id: 'freeze',
      q: 'Can I pause my membership if I travel?',
      a: 'Yes. Freezing pauses your plan and cancels your upcoming class bookings. When you unfreeze, the days the gym was open while you were frozen are added to your expiry date (the day you freeze, the day you come back and Sundays are not counted). See the refund & cancellation policy for details.'
    },
    {
      id: 'entry',
      q: 'How do I get in?',
      a: 'Every account has a personal QR entry pass. Show it at the front desk and staff scan it to check you in.'
    },
    {
      id: 'trial',
      q: 'Can I try the gym first?',
      a: 'Yes. Claim a free 1-day pass for a day in the next two weeks (Monday to Saturday). There is one free pass per person.'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">
      <div className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
        <Badge variant="lime">MEMBERSHIPS</Badge>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-100 tracking-tight font-['Outfit']">CHOOSE YOUR PLAN</h1>
        <p className="text-sm md:text-base text-slate-400 font-medium">
          Three plans, priced in rupees, with no sign-up fee. Pay monthly, or once for a full year.
        </p>

        <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl neu-pressed-sm mt-3" role="group" aria-label="Billing cycle">
          <button
            type="button"
            aria-pressed={billingCycle === 'monthly'}
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all ${billingCycle === 'monthly' ? 'neu-btn-lime' : 'text-slate-200'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={billingCycle === 'annual'}
            onClick={() => setBillingCycle('annual')}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${billingCycle === 'annual' ? 'neu-btn-lime' : 'text-slate-200'}`}
          >
            Annual
            {maxSaving > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                  billingCycle === 'annual' ? 'bg-black/15 text-black' : 'bg-amber-400/20 text-amber-700 dark:text-amber-400'
                }`}
              >
                SAVE UP TO {maxSaving}%
              </span>
            )}
          </button>
        </div>
      </div>

      {user && user.membership_tier !== 'none' && (
        <div className="max-w-3xl mx-auto p-4 rounded-2xl neu-pressed-sm flex items-start gap-3 text-sm text-slate-300">
          <Info className="w-5 h-5 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            You're on <strong className="text-slate-100">{currentPlan?.name ?? 'a plan'}</strong> ({STATUS_LABELS[user.membership_status].toLowerCase()}
            {user.membership_expiry ? `, ${user.membership_status === 'expired' ? 'ended' : 'until'} ${formatDate(user.membership_expiry)}` : ''}).
            {user.membership_status === 'frozen' && user.frozen_since ? ` Frozen since ${formatDate(user.frozen_since)}.` : ''}
          </p>
        </div>
      )}

      {isConfigLoaded && !config.payments.enabled && user && (
        <div className="glass-tint max-w-3xl mx-auto p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-sm text-slate-200" role="status">
          <Store className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p>Online payment isn't available — pay at the front desk and staff will activate your plan.</p>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading plans…" />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={reload} className="max-w-xl mx-auto" />
      ) : !plans || plans.length === 0 ? (
        <EmptyState title="No plans are on sale right now" body="Please ask at the front desk about memberships." className="max-w-xl mx-auto" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
          {plans.map(plan => {
            const PlanIcon = PLAN_ICONS[plan.tier];
            const saving = annualSavingPercent(plan);
            const amount = billingCycle === 'annual' ? plan.price_annual : plan.price_monthly;
            const action = planAction(plan, user, plans, config.gym.hours.closedWeekdays);
            const highlighted = plan.is_popular || action.isCurrent;
            const isRequested = requestedTier === plan.tier;
            const excluded = plan.categories.length === 0 ? [] : CATEGORIES.filter(c => !planCovers(plan, c));
            const isPaying = isProcessing && payingTier === plan.tier;

            return (
              <section
                key={plan.id}
                id={`plan-${plan.tier}`}
                aria-labelledby={`plan-${plan.tier}-name`}
                className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative neu-flat ${
                  highlighted ? 'border-2 border-lime-500/70 shadow-glow-lime' : 'border border-slate-800/80'
                } ${isRequested ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-transparent' : ''}`}
              >
                {(action.isCurrent || plan.badge) && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 neu-btn-lime text-[10px] font-black uppercase tracking-widest px-3.5 py-1 rounded-full whitespace-nowrap">
                    {action.isCurrent ? 'Your current plan' : plan.badge}
                  </div>
                )}

                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 id={`plan-${plan.tier}-name`} className="text-xl font-black text-slate-100 font-['Outfit']">
                        {plan.name}
                      </h2>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{plan.description}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 neu-pressed-sm text-lime-400 border border-lime-500/30">
                      <PlanIcon className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="py-3 border-y border-slate-800/80">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-4xl sm:text-5xl font-black text-slate-100 font-['Outfit']">{formatINR(amount)}</span>
                      <span className="text-xs text-slate-400 font-medium">{billingCycle === 'annual' ? 'for 12 months, billed once' : 'per month'}</span>
                    </div>
                    {billingCycle === 'annual' ? (
                      <p className="mt-1 text-xs text-slate-400">
                        That's {formatINR(annualPerMonth(plan))} a month
                        {saving > 0 ? (
                          <>
                            {' '}
                            — <strong className="text-amber-600 dark:text-amber-400">{saving}% less</strong> than 12 × {formatINR(plan.price_monthly)}
                          </>
                        ) : null}
                        .
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        Or {formatINR(plan.price_annual)} for a year{saving > 0 ? ` (save ${saving}%)` : ''}.
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2.5 text-xs text-slate-200" aria-label={`What ${plan.name} includes`}>
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="leading-snug">{feature}</span>
                      </li>
                    ))}
                    {excluded.map(category => (
                      <li key={category} className="flex items-start gap-2.5 text-slate-400">
                        <XCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="leading-snug">Doesn't include {category} classes</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800/80 space-y-2">
                  {!user ? (
                    <button
                      type="button"
                      onClick={() => handleChoosePlan(plan)}
                      className={`w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 ${highlighted ? 'neu-btn-lime' : 'neu-btn text-slate-100'}`}
                    >
                      Create an account to join
                    </button>
                  ) : !isConfigLoaded ? (
                    <div className="h-11 rounded-2xl neu-pressed-sm animate-pulse" aria-hidden="true" />
                  ) : config.payments.enabled ? (
                    <button
                      type="button"
                      onClick={() => handleChoosePlan(plan)}
                      disabled={isProcessing}
                      aria-describedby={action.note ? `plan-${plan.tier}-note` : undefined}
                      className={`w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 disabled:opacity-60 ${
                        highlighted ? 'neu-btn-lime' : 'neu-btn text-slate-100'
                      }`}
                    >
                      {isPaying ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Lock className="w-3.5 h-3.5" aria-hidden="true" />}
                      {isPaying ? 'Waiting for payment…' : `${action.label} · ${formatINR(amount)}`}
                    </button>
                  ) : (
                    <p className="p-3 rounded-xl neu-pressed-sm text-xs text-slate-300 text-center">Online payment isn't available — pay for this plan at the front desk.</p>
                  )}
                  {user && config.payments.enabled && action.note && (
                    <p id={`plan-${plan.tier}-note`} className="text-[11px] text-slate-400 leading-relaxed">
                      {action.note}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {error && (
        <div role="alert" className="glass-tint max-w-3xl mx-auto flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm leading-snug font-medium text-slate-200">{error}</p>
        </div>
      )}

      <div className="p-6 sm:p-8 rounded-3xl neu-flat text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 border border-lime-500/20">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2 justify-center sm:justify-start font-['Outfit']">
            <Sparkles className="w-5 h-5 text-lime-400" aria-hidden="true" /> Want to try PulseFit first?
          </h2>
          <p className="text-xs text-slate-400 font-medium">Claim a free 1-day pass for the Strength floor or a Zumba & Cardio class.</p>
        </div>
        <button type="button" onClick={onOpenFreeTrialModal} className="px-6 py-3.5 neu-btn-lime font-black text-xs rounded-xl shrink-0">
          Claim a free pass
        </button>
      </div>

      <div className="max-w-3xl mx-auto space-y-6 pt-4">
        <div className="text-center space-y-2">
          <Badge variant="cyan">QUESTIONS</Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">GOOD TO KNOW</h2>
        </div>

        <div className="space-y-3">
          {faqs
            .filter(faq => faq.a)
            .map(faq => {
              const isOpen = openFaq === faq.id;
              return (
                <div key={faq.id} className="rounded-2xl neu-flat p-1 overflow-hidden">
                  <h3>
                    <button
                      type="button"
                      id={`faq-${faq.id}-button`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-${faq.id}-panel`}
                      onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                      className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-slate-100 hover:text-lime-400 transition-colors rounded-xl"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180 text-lime-400' : 'text-slate-400'}`} aria-hidden="true" />
                    </button>
                  </h3>
                  {isOpen && (
                    <div
                      id={`faq-${faq.id}-panel`}
                      role="region"
                      aria-labelledby={`faq-${faq.id}-button`}
                      className="px-4 sm:px-5 py-4 text-sm text-slate-300 leading-relaxed neu-pressed-sm m-2 rounded-xl"
                    >
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
