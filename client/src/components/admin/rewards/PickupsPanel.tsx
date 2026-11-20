import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageCheck, RefreshCw } from 'lucide-react';
import { ClaimStatus, GiftClaim, GiftSize } from '../../../types/index.js';
import { api, errorMessage } from '../../../api/client.js';
import { useToast } from '../../../context/ToastContext.js';
import { ConfirmDialog } from '../../common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../../common/States.js';
import { useApiResource } from '../../member/useApiResource.js';
import { SearchForm, SectionCard, focusRing, hintClass, inputClass, labelClass } from '../ui.js';
import { formatDateTime } from '../../../lib/format.js';

type PickupStatus = Exclude<ClaimStatus, 'cancelled'>;

const FILTERS: { value: PickupStatus; label: string }[] = [
  { value: 'ready', label: 'Ready' },
  { value: 'needs_size', label: 'Needs a size' },
  { value: 'waiting', label: 'Waiting for stock' },
  { value: 'handed_over', label: 'Handed over' }
];
const ALL_SIZES: GiftSize[] = ['S', 'M', 'L', 'XL', 'XXL'];
const SOURCE: Record<GiftClaim['source'], string> = { store: 'Store', milestone: 'Milestone', joining: 'Joining gift' };

/** Gifts owed to members, oldest first: the desk hands them over (picking a size where needed) or an admin cancels one. */
export const PickupsPanel: React.FC = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<PickupStatus>('ready');
  const [search, setSearch] = useState('');
  const [claims, setClaims] = useState<GiftClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sizeOf, setSizeOf] = useState<Record<string, GiftSize>>({});
  const [toCancel, setToCancel] = useState<GiftClaim | null>(null);
  const [reason, setReason] = useState('');
  // For the sizes of a claim that still needs one.
  const catalogue = useApiResource(() => api.getGiftCatalogue());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setClaims(await api.getClaims({ status, search }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    setClaims(null);
    load();
  }, [load]);

  const handOver = async (c: GiftClaim) => {
    const size = c.status === 'needs_size' ? sizeOf[c.id] : undefined;
    setBusy(c.id);
    try {
      const done = await api.updateClaim(c.id, { status: 'handed_over', ...(size ? { size } : {}) });
      showToast(`${c.gift_name}${done.size ? ` (${done.size})` : ''} handed over to ${c.user_name}.`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error', 'The gift was not handed over');
    } finally {
      setBusy(null);
    }
    load();
  };

  const cancel = async () => {
    if (!toCancel) return;
    try {
      await api.updateClaim(toCancel.id, { status: 'cancelled', ...(reason.trim() ? { reason: reason.trim() } : {}) });
      const refund = toCancel.source === 'store' ? ` ${toCancel.points_spent.toLocaleString('en-IN')} points went back to ${toCancel.user_name}.` : '';
      showToast(`The ${toCancel.gift_name} claim was cancelled.${refund}`, 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error', 'The claim was not cancelled');
    }
    load();
  };

  return (
    <SectionCard
      id="pickups-heading"
      title="Pickups"
      icon={<PackageCheck className="w-4 h-4 text-lime-400" aria-hidden="true" />}
      description="Gifts members are owed. Check the pickup code the member shows, then hand the gift over."
      actions={
        <button type="button" onClick={load} disabled={isLoading} className={`px-3 py-2 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60 ${focusRing}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
        </button>
      }
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${focusRing} ${status === f.value ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <SearchForm id="pickup-search" label="Search pickups" placeholder="Name or pickup code" onSearch={setSearch} className="flex gap-2 lg:ml-auto lg:w-80" />
      </div>

      {error ? (
        <ErrorState message={`Could not load the pickups. ${error}`} onRetry={load} />
      ) : !claims ? (
        <LoadingState label="Loading pickups…" />
      ) : claims.length === 0 ? (
        <EmptyState title={search ? 'No pickups match that search' : `No gifts are ${FILTERS.find(f => f.value === status)!.label.toLowerCase()} right now`} />
      ) : (
        <ul className="space-y-3">
          {claims.map(c => {
            const sizes = catalogue.data?.find(g => g.id === c.gift_id)?.sizes ?? ALL_SIZES;
            return (
              <li key={c.id} className="neu-pressed-sm rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-extrabold text-slate-100 font-heading break-words">
                    {c.gift_name}
                    {c.size && <span className="text-slate-400"> · {c.size}</span>}
                    <span className="font-semibold text-slate-400"> for </span>
                    {c.user_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    <span className="font-mono font-black tracking-widest text-lime-400">{c.pickup_code}</span> · {SOURCE[c.source]} · {formatDateTime(c.created_at)}
                  </p>
                  {c.status === 'handed_over' && c.handed_over_at && (
                    <p className="text-xs text-slate-400">
                      Handed over {formatDateTime(c.handed_over_at)}
                      {c.handed_over_by && ` by ${c.handed_over_by.name}`}
                    </p>
                  )}
                  {c.status === 'waiting' && <p className="text-xs text-slate-400">Ready once stock is added in the gift catalogue.</p>}
                </div>
                {(c.status === 'ready' || c.status === 'needs_size') && (
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {c.status === 'needs_size' && (
                      <select
                        aria-label={`Size for ${c.user_name}'s ${c.gift_name}`}
                        value={sizeOf[c.id] ?? ''}
                        onChange={e => setSizeOf(s => ({ ...s, [c.id]: e.target.value as GiftSize }))}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-100"
                      >
                        <option value="">Size</option>
                        {sizes.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => handOver(c)}
                      disabled={busy === c.id || (c.status === 'needs_size' && !sizeOf[c.id])}
                      aria-label={`Hand over ${c.gift_name} to ${c.user_name}`}
                      className={`px-3 py-2 neu-btn-lime rounded-lg text-xs font-black flex items-center gap-1.5 disabled:opacity-60 ${focusRing}`}
                    >
                      {busy === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Hand over
                    </button>
                    {c.status === 'ready' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReason('');
                          setToCancel(c);
                        }}
                        aria-label={`Cancel ${c.user_name}'s ${c.gift_name}`}
                        className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold hover:text-rose-400 ${focusRing}`}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        isOpen={toCancel !== null}
        title="Cancel this gift claim?"
        message={
          toCancel && (
            <div className="space-y-3">
              <p>
                {toCancel.user_name}'s <strong>{toCancel.gift_name}</strong> goes back into stock
                {toCancel.source === 'store' ? ` and their ${toCancel.points_spent.toLocaleString('en-IN')} points are refunded` : ''}.
              </p>
              <div>
                <label htmlFor="cancel-reason" className={labelClass}>
                  Reason
                </label>
                <input id="cancel-reason" type="text" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} />
                <p className={hintClass}>Optional. Kept with the claim for the record.</p>
              </div>
            </div>
          )
        }
        confirmLabel="Cancel claim"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={cancel}
        onClose={() => setToCancel(null)}
      />
    </SectionCard>
  );
};
