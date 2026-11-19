import React, { useCallback, useEffect, useState } from 'react';
import { BadgePercent, Gift, Info, PackageCheck, SlidersHorizontal, Tag } from 'lucide-react';
import { MembershipPlan } from '../../types/index.js';
import { api, errorMessage } from '../../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, PageHeader, sideEffectTone } from '../../components/admin/ui.js';
import { PlanEditor } from '../../components/admin/PlanEditor.js';
import { GiftCataloguePanel } from '../../components/admin/rewards/GiftCataloguePanel.js';
import { PickupsPanel } from '../../components/admin/rewards/PickupsPanel.js';
import { OffersPanel } from '../../components/admin/rewards/OffersPanel.js';
import { RulesPanel } from '../../components/admin/rewards/RulesPanel.js';
import { useToast } from '../../context/ToastContext.js';
import { useNavigation } from '../../context/NavigationContext.js';

type Section = 'plans' | 'offers' | 'gifts' | 'pickups' | 'rules';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'plans', label: 'Plans', icon: <Tag className="w-4 h-4" aria-hidden="true" /> },
  { id: 'offers', label: 'Offers & coupons', icon: <BadgePercent className="w-4 h-4" aria-hidden="true" /> },
  { id: 'gifts', label: 'Gift catalogue', icon: <Gift className="w-4 h-4" aria-hidden="true" /> },
  { id: 'pickups', label: 'Pickups', icon: <PackageCheck className="w-4 h-4" aria-hidden="true" /> },
  { id: 'rules', label: 'Rules', icon: <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> }
];

const PlansPanel: React.FC = () => {
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans(await api.getPlans());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-slate-200" role="note">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-cyan-400" aria-hidden="true" />
        Price changes apply to new purchases and renewals only. Members keep what they already paid for until their current period ends.
      </p>

      {error ? (
        <ErrorState message={`Could not load the plans. ${error}`} onRetry={load} />
      ) : !plans ? (
        <LoadingState label="Loading plans…" />
      ) : plans.length === 0 ? (
        <EmptyState title="No plans in the catalogue" />
      ) : (
        <div className="space-y-6">
          {plans.map(plan => (
            <PlanEditor
              key={plan.id}
              plan={plan}
              onSaved={(updated, notice) => {
                // Say what else the save did (narrower categories cancel bookings), not just "saved".
                if (notice) showToast(notice, sideEffectTone(notice), `${updated.name} was saved`);
                else showToast(`${updated.name} was saved.`, 'success');
                // Swap in the server's copy only; reloading every plan would wipe unsaved edits on the others.
                setPlans(list => list?.map(p => (p.id === updated.id ? updated : p)) ?? null);
              }}
              onStale={load}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const PlanManagement: React.FC = () => {
  const { params, navigate } = useNavigation();
  // The URL is the single source of truth, so back/forward and shared links open the same tab.
  const section: Section = SECTIONS.find(s => s.id === params.get('section'))?.id ?? 'plans';

  const select = (id: Section) => navigate('admin-plans', id === 'plans' ? undefined : { section: id }, { replace: true });

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const index = SECTIONS.findIndex(s => s.id === section);
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % SECTIONS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SECTIONS.length - 1;
    else return;
    e.preventDefault();
    select(SECTIONS[next].id);
    document.getElementById(`plans-tab-${SECTIONS[next].id}`)?.focus();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader eyebrow="Admin" title="Plans & rewards" description="The plans behind the pricing page and checkout, their sales and coupon codes, the gifts members earn and the rules that give them, and the gifts waiting at the front desk." />
      <AdminNav />

      <div role="tablist" aria-label="Plans and rewards sections" className="flex gap-1 p-1.5 rounded-2xl neu-pressed-sm overflow-x-auto">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            id={`plans-tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            aria-controls={`plans-panel-${s.id}`}
            tabIndex={section === s.id ? 0 : -1}
            onClick={() => select(s.id)}
            onKeyDown={onTabKeyDown}
            className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
              section === s.id ? 'neu-btn-lime' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      <div id={`plans-panel-${section}`} role="tabpanel" aria-labelledby={`plans-tab-${section}`}>
        {section === 'plans' && <PlansPanel />}
        {section === 'offers' && <OffersPanel />}
        {section === 'gifts' && <GiftCataloguePanel />}
        {section === 'pickups' && <PickupsPanel />}
        {section === 'rules' && <RulesPanel />}
      </div>
    </div>
  );
};
