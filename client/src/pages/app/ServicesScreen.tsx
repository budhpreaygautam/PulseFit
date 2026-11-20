import React from 'react';
import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext.js';
import { api } from '../../api/client.js';
import { MembershipPlan } from '../../types/index.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { cheapestPlan, cheapestPlanFor } from '../../components/public/plans.js';
import { TabLink } from '../../components/public/TabLink.js';
import { SERVICES } from '../../components/app/services.js';
import { formatINR } from '../../lib/format.js';
import { riseOrder } from '../../lib/appMotion.js';

// The plan a service's "From" price comes from, as on the landing page.
const PRICE_PLAN: Record<string, (plans: MembershipPlan[]) => MembershipPlan | undefined> = {
  workout: plans => cheapestPlanFor(plans, 'Workout & Strength'),
  zumba: plans => cheapestPlanFor(plans, 'Zumba & Cardio'),
  pricing: cheapestPlan
};

/**
 * The guests' first tab in the app (App.tsx), in place of the landing page: a card for each service
 * with its starting price, a free pass, and the full overview (the landing page) one tap away.
 */
export const ServicesScreen: React.FC<{ onFreePass: () => void }> = ({ onFreePass }) => {
  const { navigate } = useNavigation();
  // A price is left out if the plans fail to load; the cards work without it.
  const plans = useApiResource(() => api.getPlans());
  const rise = riseOrder();

  return (
    <div className="app-screen flex flex-col gap-4">
      <div>
        <h1 className="font-heading font-black text-[26px] leading-tight">Services</h1>
        <p className="text-[13px] mt-1 text-[color:var(--app-mu)]">Strength &amp; Zumba gym · Sector 29, Gurugram</p>
        {/* Up top, so a guest reads it before tapping a card, not under the tab bar. */}
        <p className="text-[11px] leading-[1.4] mt-1 text-[color:var(--app-mu)]">Most services open once you sign in or create a free account.</p>
      </div>

      <ul aria-label="Services" className="flex flex-col gap-3">
        {SERVICES.map(({ tab, label, icon: Icon, description }) => {
          const plan = plans.data ? PRICE_PLAN[tab]?.(plans.data) : undefined;
          return (
            <li key={tab} className="app-rise" style={rise()}>
              <TabLink tab={tab} navigate={navigate} className="app-press app-glass rounded-[22px] p-4 flex items-center gap-3.5">
                <span className="w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center bg-[rgba(132,204,22,0.15)] text-[color:var(--app-lime)]">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-heading font-extrabold text-[15px]">{label}</span>
                  <span className="block text-[11px] leading-[1.4] mt-0.5 text-[color:var(--app-mu)]">{description}</span>
                  {/* Holds the price's room while plans load, so the cards below don't move when it arrives. */}
                  {PRICE_PLAN[tab] && (plan || plans.isLoading) && (
                    <span aria-hidden={plan ? undefined : true} className="block text-[11px] font-bold mt-1 text-[color:var(--app-lime)]">
                      {plan ? `From ${formatINR(plan.price_monthly)}/mo` : '\u00a0'}
                    </span>
                  )}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-[color:var(--app-mu)]" aria-hidden="true" />
              </TabLink>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onFreePass}
        aria-haspopup="dialog"
        style={rise()}
        className="app-rise app-press app-lime-btn min-h-[48px] rounded-2xl flex items-center justify-center gap-2 text-sm font-extrabold"
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" /> Get a free pass
      </button>
      <TabLink
        tab="home"
        params={{ view: 'full' }}
        navigate={navigate}
        className="min-h-[44px] inline-flex items-center justify-center gap-1 text-[13px] font-bold text-[color:var(--app-lime)]"
      >
        See the full overview <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </TabLink>
    </div>
  );
};
