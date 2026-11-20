import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Flame, Gift, History, Loader2, Share2, ShoppingBag, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, errorMessage } from '../../api/client.js';
import { ClaimStatus, GiftClaim, GiftSize, MyRewards, PointsEntry, StoreGift } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { GiftImage } from '../../components/common/GiftImage.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { useGiftCelebration } from '../../components/member/useGiftCelebration.js';
import { useShareReferral } from '../../components/member/useShareReferral.js';
import { formatDateTime, formatDay } from '../../lib/format.js';

const HISTORY_PAGE = 20;

const STATUS: Record<ClaimStatus, { label: string; variant: 'lime' | 'amber' | 'cyan' | 'slate' | 'crimson' }> = {
  ready: { label: 'Ready to collect', variant: 'lime' },
  needs_size: { label: 'Choose a size', variant: 'amber' },
  waiting: { label: 'Waiting for stock', variant: 'cyan' },
  handed_over: { label: 'Collected', variant: 'slate' },
  cancelled: { label: 'Cancelled', variant: 'crimson' }
};

const SOURCE: Record<GiftClaim['source'], string> = { store: 'From the store', milestone: 'Milestone gift', joining: 'Joining gift' };

const points = (n: number) => `${n.toLocaleString('en-IN')} point${n === 1 ? '' : 's'}`;

/** What a ledger line was for. Gifts are recorded as 0-point lines carrying their reason. */
function entryLabel(e: PointsEntry): string {
  const note = e.note ? `: ${e.note}` : '';
  switch (e.reason) {
    case 'checkin':
      return 'Check-in at the front desk';
    case 'workout':
      return 'Workout logged on the day';
    case 'referral':
      return e.note ?? 'Referral';
    case 'claim':
      return `Claimed${note}`;
    case 'refund':
      return `Claim cancelled${note}`;
    case 'admin_adjust':
      return `Adjusted by the gym${note}`;
    default:
      // A milestone line has no gift when it was passed before rewards started (the launch gave one gift for all).
      if (e.points !== 0) return `Bonus${note}`;
      return e.key.startsWith('milestone:') ? `Milestone${note}` : `Gift unlocked${note}`;
  }
}

const ProgressCard: React.FC<{ icon: React.ReactNode; title: string; value: number; unit: string; type: 'visits' | 'streak'; rewards: MyRewards }> = ({
  icon,
  title,
  value,
  unit,
  type,
  rewards
}) => {
  // Only milestones still ahead: one added below the member's count counts for future crossings only.
  const next = rewards.milestones.filter(m => m.type === type && !m.reached && m.threshold > value).sort((a, b) => a.threshold - b.threshold)[0];
  const any = rewards.milestones.some(m => m.type === type);
  return (
    <div className="neu-pressed-sm rounded-2xl p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        {icon} {title}
      </p>
      <p className="text-3xl font-black text-slate-100 font-heading">
        {value.toLocaleString('en-IN')} <span className="text-sm font-bold text-slate-400">{unit}</span>
      </p>
      {next ? (
        <>
          <div
            className="w-full h-1.5 neu-pressed-sm rounded-full overflow-hidden"
            role="progressbar"
            aria-label={`${title} towards ${next.gift_name}`}
            aria-valuemin={0}
            aria-valuemax={next.threshold}
            aria-valuenow={value}
          >
            <div className="h-full rounded-full bg-lime-400" style={{ width: `${Math.min(100, (value / next.threshold) * 100)}%` }} />
          </div>
          <p className="text-xs text-slate-400">
            Next: <strong className="text-slate-200">{next.gift_name}</strong> at {next.threshold.toLocaleString('en-IN')} {unit}
          </p>
        </>
      ) : (
        <p className="text-xs text-slate-400">{any ? `You have reached every ${type === 'visits' ? 'visit' : 'streak'} milestone.` : 'No milestones of this kind right now.'}</p>
      )}
    </div>
  );
};

const PointsHistory: React.FC = () => {
  const [items, setItems] = useState<PointsEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (offset: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await api.getPointsLedger({ limit: HISTORY_PAGE, offset });
      setItems(list => (offset === 0 ? page.items : [...(list ?? []), ...page.items]));
      setTotal(page.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  if (!items) return error ? <ErrorState message={error} onRetry={() => load(0)} /> : <LoadingState label="Loading your points history…" className="py-8" />;
  if (items.length === 0) return <EmptyState title="No points yet" body="Check in at the front desk or log a workout on the day you train to start earning." />;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-800/60">
        {items.map(e => (
          <li key={e.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-slate-200 break-words">{entryLabel(e)}</p>
              <p className="text-[11px] text-slate-500">{formatDateTime(e.created_at)}</p>
            </div>
            {e.points !== 0 && (
              <span className={`shrink-0 font-black ${e.points > 0 ? 'text-lime-700 dark:text-lime-400' : 'text-slate-300'}`}>
                {e.points > 0 ? '+' : '−'}
                {Math.abs(e.points).toLocaleString('en-IN')}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <ErrorState message={error} onRetry={() => load(items.length)} />}
      {items.length < total && !error && (
        <button type="button" onClick={() => load(items.length)} disabled={isLoading} className="neu-btn w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Show more
        </button>
      )}
    </div>
  );
};

export const RewardsPage: React.FC = () => {
  const { user, triggerCelebration } = useAuth();
  const { showToast } = useToast();
  const rewards = useApiResource(() => api.getMyRewards());
  const store = useApiResource(() => api.getStoreGifts());
  // Remounts the history after a claim or cancellation, so it starts again from the newest line.
  const [historyKey, setHistoryKey] = useState(0);
  const [sizeChoice, setSizeChoice] = useState<Record<string, GiftSize>>({});
  const [toClaim, setToClaim] = useState<{ gift: StoreGift; size?: GiftSize } | null>(null);
  const [toCancel, setToCancel] = useState<GiftClaim | null>(null);
  const [savingSize, setSavingSize] = useState<string | null>(null);
  const share = useShareReferral();

  useGiftCelebration(user?.id ?? '', rewards.data?.claims ?? null);

  if (!user) return null;

  const refresh = () => {
    rewards.reload();
    store.reload();
    setHistoryKey(k => k + 1);
  };

  const balance = rewards.data?.balance ?? 0;
  const imageOf = (giftId: string) => store.data?.find(g => g.id === giftId)?.image ?? '🎁';
  // Affordable gifts first, each group cheapest first (the order the server sends).
  const storeGifts = [...(store.data ?? [])].sort((a, b) => Number(b.points_cost <= balance) - Number(a.points_cost <= balance));

  const claim = async () => {
    if (!toClaim) return;
    try {
      const made = await api.claimGift({ gift_id: toClaim.gift.id, ...(toClaim.size ? { size: toClaim.size } : {}) });
      triggerCelebration();
      showToast(`Show code ${made.pickup_code} at the front desk to collect it.`, 'success', `${toClaim.gift.name} is yours`, 'giftClaimed');
    } catch (err) {
      showToast(errorMessage(err), 'error', 'The gift was not claimed');
    }
    refresh();
  };

  const cancel = async () => {
    if (!toCancel) return;
    try {
      await api.updateClaim(toCancel.id, { status: 'cancelled' });
      showToast(`${points(toCancel.points_spent)} went back to your balance.`, 'success', `${toCancel.gift_name} claim cancelled`, 'cancelled');
    } catch (err) {
      showToast(errorMessage(err), 'error', 'The claim was not cancelled');
    }
    refresh();
  };

  const saveSize = async (c: GiftClaim, size: GiftSize | undefined) => {
    if (!size) return showToast('Choose a size first.', 'warning', undefined, 'info');
    setSavingSize(c.id);
    try {
      const saved = await api.updateClaim(c.id, { size });
      showToast(
        saved.status === 'ready' ? `Your ${c.gift_name} (${size}) is ready to collect.` : `${size} is out of stock. Your ${c.gift_name} will be ready when the gym restocks.`,
        saved.status === 'ready' ? 'success' : 'info',
        undefined,
        saved.status === 'ready' ? 'saved' : 'info'
      );
    } catch (err) {
      showToast(errorMessage(err), 'error', 'The size was not saved');
    } finally {
      setSavingSize(null);
    }
    refresh();
  };

  const data = rewards.data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      <section className="neu-flat rounded-3xl p-5 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-700 dark:text-lime-400">My PulseFit</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100 font-heading">Rewards</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            {data
              ? `Earn ${points(data.earning.checkin)} for each check-in at the front desk and ${points(data.earning.workout)} for a workout logged on the day you train. Spend them on gifts you collect at the desk.`
              : 'Earn points at the gym and spend them on gifts you collect at the front desk.'}
          </p>
        </div>
        <div className="neu-pressed-sm rounded-2xl px-6 py-4 text-center shrink-0" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Your points</p>
          <p className="text-4xl font-black text-lime-700 dark:text-lime-400 font-heading">{data ? data.balance.toLocaleString('en-IN') : '—'}</p>
        </div>
      </section>

      {!data && rewards.error ? (
        <ErrorState message={rewards.error} onRetry={rewards.reload} />
      ) : !data ? (
        <LoadingState label="Loading your rewards…" />
      ) : (
        <>
          <section aria-labelledby="progress-heading" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
            <h2 id="progress-heading" className="text-lg font-black text-slate-100 font-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Milestones
            </h2>
            <p className="text-xs text-slate-400">Milestone gifts count the days the gym confirmed, so this streak can differ from the one on your dashboard.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProgressCard icon={<CalendarCheck className="w-4 h-4" aria-hidden="true" />} title="Visits" value={data.visits} unit="visits" type="visits" rewards={data} />
              <ProgressCard
                icon={<Flame className="w-4 h-4" aria-hidden="true" />}
                title="Confirmed-visit streak (check-ins and attended classes)"
                value={data.streak}
                unit="days"
                type="streak"
                rewards={data}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section aria-labelledby="gifts-heading" className="lg:col-span-7 neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
              <h2 id="gifts-heading" className="text-lg font-black text-slate-100 font-heading flex items-center gap-2">
                <Gift className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> My gifts
              </h2>
              {data.claims.length === 0 ? (
                <EmptyState title="No gifts yet" body="Claim one from the store, or reach a milestone to unlock one." />
              ) : (
                <ul className="space-y-3">
                  {data.claims.map(c => {
                    return (
                      <li key={c.id} className="neu-pressed-sm rounded-2xl p-4 space-y-2">
                        <div className="flex items-start gap-3">
                          <GiftImage image={imageOf(c.gift_id)} name={c.gift_name} className="w-10 h-10 text-2xl" />
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-slate-100 font-heading break-words">
                              {c.gift_name}
                              {c.size && <span className="text-slate-400 font-bold"> · {c.size}</span>}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {SOURCE[c.source]}
                              {c.points_spent > 0 && ` · ${points(c.points_spent)}`} · {formatDay(c.created_at)}
                            </p>
                          </div>
                          <Badge size="sm" variant={STATUS[c.status].variant}>
                            {STATUS[c.status].label}
                          </Badge>
                        </div>
                        {c.status === 'ready' && (
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className="text-sm text-slate-300">
                              Pickup code <span className="font-mono font-black tracking-widest text-lime-700 dark:text-lime-400">{c.pickup_code}</span>
                            </p>
                            {c.source === 'store' && (
                              <button type="button" onClick={() => setToCancel(c)} className="neu-btn px-3 py-1.5 rounded-lg text-xs font-bold hover:text-rose-400">
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                        {c.status === 'waiting' && <p className="text-xs text-slate-400">It will be ready as soon as the gym restocks.</p>}
                        {c.status === 'handed_over' && c.handed_over_at && <p className="text-xs text-slate-400">Collected {formatDateTime(c.handed_over_at)}</p>}
                        {c.status === 'needs_size' && (
                          <form
                            className="flex items-center gap-2 flex-wrap"
                            onSubmit={e => {
                              e.preventDefault();
                              saveSize(c, (new FormData(e.currentTarget).get('size') as GiftSize) || undefined);
                            }}
                          >
                            <select name="size" aria-label={`Size of your ${c.gift_name}`} defaultValue="" className="px-3 py-2 rounded-xl text-xs font-bold text-slate-100">
                              <option value="">Size</option>
                              {(c.sizes ?? []).map(s => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <button type="submit" disabled={savingSize === c.id} className="neu-btn-lime px-4 py-2 rounded-xl text-xs font-extrabold disabled:opacity-60">
                              Save size
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="refer-heading" className="lg:col-span-5 neu-flat rounded-3xl p-5 sm:p-6 space-y-4 self-start">
              <h2 id="refer-heading" className="text-lg font-black text-slate-100 font-heading flex items-center gap-2">
                <Users className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Refer a friend
              </h2>
              <p className="text-sm text-slate-400">
                When a friend signs up with your code and buys a plan, you get {points(data.earning.referral)}
                {data.earning.referral_welcome > 0 && ` and they get ${points(data.earning.referral_welcome)}`}.
              </p>
              <div className="neu-pressed-sm rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-slate-400">
                  Your code <span className="block font-mono text-2xl font-black tracking-widest text-slate-100">{data.referral_code}</span>
                </p>
                <button type="button" onClick={() => share(data.referral_code)} className="neu-btn-lime px-4 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-2">
                  <Share2 className="w-4 h-4" aria-hidden="true" /> Share
                </button>
              </div>
            </section>
          </div>

          <section aria-labelledby="store-heading" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
            <h2 id="store-heading" className="text-lg font-black text-slate-100 font-heading flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Gift store
            </h2>
            {!store.data && store.error ? (
              <ErrorState message={store.error} onRetry={store.reload} />
            ) : !store.data ? (
              <LoadingState label="Loading the store…" className="py-8" />
            ) : storeGifts.length === 0 ? (
              <EmptyState title="The store is empty right now" body="The gym has not put any gifts in the store yet." />
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {storeGifts.map(g => {
                  const short = g.points_cost - balance;
                  const size = sizeChoice[g.id];
                  return (
                    <li key={g.id} className="neu-pressed-sm rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Only the picture dims when out of stock: dimmed text would fall below 4.5:1. */}
                        <GiftImage image={g.image} name={g.name} className={`w-12 h-12 text-3xl ${g.in_stock ? '' : 'opacity-50'}`} />
                        <div className="min-w-0 space-y-1">
                          <p className="font-extrabold text-slate-100 font-heading break-words">{g.name}</p>
                          {g.description && <p className="text-xs text-slate-400">{g.description}</p>}
                          <p className="text-sm font-black text-lime-700 dark:text-lime-400">{points(g.points_cost)}</p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center gap-2 flex-wrap">
                        {g.sizes && g.in_stock && (
                          <select
                            aria-label={`Size of ${g.name}`}
                            value={size ?? ''}
                            onChange={e => setSizeChoice(s => ({ ...s, [g.id]: e.target.value as GiftSize }))}
                            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-100"
                          >
                            <option value="">Size</option>
                            {g.sizes.map(s => (
                              <option key={s} value={s} disabled={!g.sizes_in_stock?.includes(s)}>
                                {s}
                                {g.sizes_in_stock?.includes(s) ? '' : ' (out of stock)'}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setToClaim({ gift: g, size })}
                          disabled={!g.in_stock || short > 0 || (!!g.sizes && !size)}
                          aria-label={`Claim ${g.name} for ${points(g.points_cost)}`}
                          className="neu-btn-lime px-4 py-2 rounded-xl text-xs font-extrabold disabled:opacity-50"
                        >
                          Claim
                        </button>
                        <span className="text-[11px] text-slate-400">
                          {!g.in_stock ? 'Out of stock' : short > 0 ? `${points(short)} to go` : g.sizes && !size ? 'Choose a size' : ''}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="history-heading" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
        <h2 id="history-heading" className="text-lg font-black text-slate-100 font-heading flex items-center gap-2">
          <History className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Points history
        </h2>
        <PointsHistory key={historyKey} />
      </section>

      <ConfirmDialog
        isOpen={toClaim !== null}
        title="Claim this gift?"
        message={
          toClaim && (
            <p>
              <strong>{toClaim.gift.name}</strong>
              {toClaim.size && ` (${toClaim.size})`} costs {points(toClaim.gift.points_cost)}, leaving you {points(balance - toClaim.gift.points_cost)}. You get a pickup code
              to show at the front desk.
            </p>
          )
        }
        confirmLabel="Claim"
        onConfirm={claim}
        onClose={() => setToClaim(null)}
      />
      <ConfirmDialog
        isOpen={toCancel !== null}
        title="Cancel this claim?"
        message={toCancel && <p>The {toCancel.gift_name} goes back to the store and {points(toCancel.points_spent)} go back to your balance.</p>}
        confirmLabel="Cancel claim"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={cancel}
        onClose={() => setToCancel(null)}
      />
    </div>
  );
};
