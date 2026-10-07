import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Phone, RefreshCw } from 'lucide-react';
import { TrialPass } from '../../types/index.js';
import { api, errorMessage } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, PageHeader, focusRing } from '../../components/admin/ui.js';
import { formatDate, formatDateTime, gymToday } from '../../lib/format.js';

type StatusFilter = 'all' | TrialPass['status'];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'issued', label: 'Not used yet' },
  { value: 'redeemed', label: 'Visited' }
];

function statusOf(trial: TrialPass, today: string): { label: string; variant: 'lime' | 'cyan' | 'slate' | 'amber' } {
  if (trial.status === 'redeemed') return { label: 'Visited', variant: 'lime' };
  if (trial.valid_on === today) return { label: 'Valid today', variant: 'cyan' };
  if (trial.valid_on < today) return { label: 'Did not come', variant: 'amber' };
  return { label: 'Upcoming', variant: 'slate' };
}

const Contact: React.FC<{ trial: TrialPass }> = ({ trial }) => (
  <div className="space-y-1 text-xs min-w-0">
    <a href={`mailto:${trial.email}`} className={`flex items-center gap-1.5 text-slate-200 hover:text-lime-400 break-all rounded ${focusRing}`}>
      <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {trial.email}
    </a>
    <a href={`tel:${trial.phone}`} className={`flex items-center gap-1.5 text-slate-300 hover:text-lime-400 rounded ${focusRing}`}>
      <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {trial.phone}
    </a>
  </div>
);

export const TrialLeads: React.FC = () => {
  const [trials, setTrials] = useState<TrialPass[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setTrials(await api.getTrials());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = gymToday();
  const visible = (trials ?? []).filter(t => filter === 'all' || t.status === filter);
  const count = (f: StatusFilter) => (trials ?? []).filter(t => f === 'all' || t.status === f).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Free-trial leads"
        description="Everyone who claimed a free trial day, newest first. Each pass works once, on its date."
        actions={
          <button type="button" onClick={load} disabled={isLoading} className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60 ${focusRing}`}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        }
      />
      <AdminNav />

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${focusRing} ${filter === f.value ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`}
          >
            {f.label}
            {trials && <span className="ml-1.5 text-slate-400">{count(f.value)}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={`Could not load trial leads. ${error}`} onRetry={load} />
      ) : !trials ? (
        <LoadingState label="Loading trial leads…" />
      ) : visible.length === 0 ? (
        <EmptyState title={trials.length === 0 ? 'No one has claimed a free trial yet' : 'No trial passes match this filter'} />
      ) : (
        <>
          <ul className="md:hidden space-y-3">
            {visible.map(t => {
              const status = statusOf(t, today);
              return (
                <li key={t.id} className="neu-flat p-4 rounded-2xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-100 font-['Outfit'] break-words">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.interest}</p>
                    </div>
                    <Badge size="sm" variant={status.variant}>{status.label}</Badge>
                  </div>
                  <Contact trial={t} />
                  <p className="text-xs text-slate-400">
                    Trial day {formatDate(t.valid_on)} · claimed {formatDateTime(t.created_at)}
                    {t.redeemed_at && ` · visited ${formatDateTime(t.redeemed_at)}`}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">{t.code}</p>
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block neu-flat rounded-3xl border border-slate-800/80 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Free-trial passes, newest first</caption>
              <thead className="border-b border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th scope="col" className="p-4 pl-6">Name</th>
                  <th scope="col" className="p-4">Contact</th>
                  <th scope="col" className="p-4">Interest</th>
                  <th scope="col" className="p-4">Trial day</th>
                  <th scope="col" className="p-4">Status</th>
                  <th scope="col" className="p-4 pr-6">Claimed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {visible.map(t => {
                  const status = statusOf(t, today);
                  return (
                    <tr key={t.id}>
                      <td className="p-4 pl-6">
                        <p className="font-extrabold text-sm text-slate-100 font-['Outfit']">{t.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{t.code}</p>
                      </td>
                      <td className="p-4"><Contact trial={t} /></td>
                      <td className="p-4 whitespace-nowrap">{t.interest}</td>
                      <td className="p-4 whitespace-nowrap">{formatDate(t.valid_on)}</td>
                      <td className="p-4">
                        <Badge size="sm" variant={status.variant}>{status.label}</Badge>
                        {t.redeemed_at && <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(t.redeemed_at)}</p>}
                      </td>
                      <td className="p-4 pr-6 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
