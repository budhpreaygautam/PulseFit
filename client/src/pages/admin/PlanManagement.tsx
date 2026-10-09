import React, { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { MembershipPlan } from '../../types/index.js';
import { api, errorMessage } from '../../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, PageHeader, sideEffectTone } from '../../components/admin/ui.js';
import { PlanEditor } from '../../components/admin/PlanEditor.js';
import { useToast } from '../../context/ToastContext.js';

export const PlanManagement: React.FC = () => {
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader eyebrow="Admin" title="Plans & pricing" description="The plan catalogue behind the pricing page, checkout and class entitlements." />
      <AdminNav />

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
