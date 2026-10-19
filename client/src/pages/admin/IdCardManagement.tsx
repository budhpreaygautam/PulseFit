import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, BadgeCheck, Eye, Layers, Plus, RefreshCw, RotateCcw, UserRound, UserX } from 'lucide-react';
import { IdCardOverview, IdCardRow, IdCardStatus, UserRole } from '../../types/index.js';
import { api, errorMessage } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '../../components/common/States.js';
import { AdminNav, Avatar, PageHeader, SearchForm, focusRing } from '../../components/admin/ui.js';
import { KpiTile } from '../../components/admin/KpiTile.js';
import { MemberDetailModal } from '../../components/admin/MemberDetailModal.js';
import { CardStatusBadge, IdCardAction, IdCardActionDialog, useFocusAfterReload } from '../../components/admin/IdCardActions.js';
import { statusVariant } from '../../components/admin/memberStatus.js';
import { IdCardModal } from '../../components/qr/IdCardModal.js';
import { DEACTIVATION_REASON_LABELS, cardNumber } from '../../components/qr/idCard.js';
import { STATUS_LABELS, TIER_SHORT_LABELS, formatDay } from '../../lib/format.js';

type StatusFilter = IdCardStatus | 'none' | 'all';
type RoleFilter = UserRole | 'all';
type Counts = IdCardOverview['counts'];

const STATUS_FILTERS: { value: StatusFilter; label: string; count: (c: Counts) => number }[] = [
  { value: 'all', label: 'All', count: c => c.people },
  { value: 'active', label: 'Active', count: c => c.active },
  { value: 'deactivated', label: 'Deactivated', count: c => c.deactivated },
  { value: 'none', label: 'Not issued', count: c => c.none }
];
const ROLE_FILTERS: { value: RoleFilter; label: string; noun: string; one: string }[] = [
  { value: 'member', label: 'Members', noun: 'members', one: 'member' },
  { value: 'trainer', label: 'Coaches', noun: 'coaches', one: 'coach' },
  { value: 'admin', label: 'Admins', noun: 'admins', one: 'admin' },
  { value: 'all', label: 'Everyone', noun: 'people', one: 'person' }
];

const chipClass = (pressed: boolean) => `px-3.5 py-1.5 rounded-xl text-xs font-bold ${focusRing} ${pressed ? 'neu-pressed-sm text-lime-400' : 'neu-btn text-slate-300'}`;
const actionClass = `px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${focusRing}`;

export const IdCardManagement: React.FC = () => {
  const [filters, setFilters] = useState({ status: 'all' as StatusFilter, role: 'member' as RoleFilter, search: '' });
  const [overview, setOverview] = useState<IdCardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [action, setAction] = useState<IdCardAction | null>(null);
  const [viewing, setViewing] = useState<IdCardRow | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const statusGroupRef = useRef<HTMLDivElement>(null);
  const focusAfterReload = useFocusAfterReload(overview);

  // Only the latest request counts: an answer for filters the admin has already changed is dropped.
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await api.getIdCards({ status: filters.status, role: filters.role, search: filters.search || undefined });
      if (request === latestRequest.current) setOverview(next);
    } catch (err) {
      if (request === latestRequest.current) setError(errorMessage(err));
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Where focus goes when the button that started something has gone (a new card has no "Issue
  // card", and a status filter can drop the row): the same person's first action, else the result
  // count, else the chosen status filter when no row is left at all.
  const fallbackFor = (holderId: string | null) => () => {
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-card-holder]')).find(
      el => el.dataset.cardHolder === holderId && el.getClientRects().length > 0
    );
    return row?.querySelector<HTMLElement>('button') ?? countRef.current ?? statusGroupRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
  };

  const afterAction = (done: IdCardAction) => {
    focusAfterReload(fallbackFor(done.holder.id));
    load();
  };

  // A change made in the details can drop the row whose Details button opened them, and the dialog
  // would then hand focus back to a button that is gone.
  const closeDetails = () => {
    const find = fallbackFor(detailsId);
    setDetailsId(null);
    setTimeout(() => {
      const focused = document.activeElement;
      if (!focused || focused === document.body || !focused.isConnected) find()?.focus();
    }, 0);
  };

  const roleFilter = ROLE_FILTERS.find(r => r.value === filters.role)!;
  const counts = overview?.counts;
  const rows = overview?.rows ?? [];

  const personCell = (row: IdCardRow, nameId: string) => (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar src={row.user.avatar_url} name={row.user.name} />
      <div className="min-w-0">
        <div className="font-extrabold text-sm text-slate-100 flex flex-wrap items-center gap-1.5 font-heading">
          <span id={nameId} className="min-w-0 break-words">
            {row.user.name}
          </span>
          {row.user.role !== 'member' && (
            <Badge size="sm" variant={row.user.role === 'admin' ? 'purple' : 'cyan'}>
              {row.user.role === 'admin' ? 'Admin' : 'Coach'}
            </Badge>
          )}
        </div>
        <div className="text-xs text-slate-400 truncate">{row.user.email}</div>
      </div>
    </div>
  );

  const membership = (row: IdCardRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold text-slate-300 whitespace-nowrap">{TIER_SHORT_LABELS[row.user.membership_tier]}</span>
      <Badge size="sm" variant={statusVariant(row.user.membership_status)}>
        {STATUS_LABELS[row.user.membership_status]}
      </Badge>
    </div>
  );

  const cardCell = (row: IdCardRow) => (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {row.card && <span className="font-mono text-xs font-bold text-slate-100 whitespace-nowrap">{row.card.card_number}</span>}
        <CardStatusBadge status={row.card_status} />
      </div>
      {row.cards_issued > 1 && <p className="text-[11px] text-slate-400">{row.cards_issued} cards issued in all</p>}
    </div>
  );

  const issued = (row: IdCardRow) =>
    row.card ? (
      <>
        <p className="whitespace-nowrap">{formatDay(row.card.issued_at)}</p>
        <p className="text-[11px] text-slate-400 break-words">by {row.card.issued_by_name}</p>
      </>
    ) : (
      '—'
    );

  const deactivated = (row: IdCardRow) =>
    row.card?.status === 'deactivated' ? (
      <>
        <p>
          <span className="whitespace-nowrap">{row.card.deactivated_at ? formatDay(row.card.deactivated_at) : 'Deactivated'}</span>
          {row.card.deactivation_reason && <span className="font-semibold text-rose-300"> · {DEACTIVATION_REASON_LABELS[row.card.deactivation_reason]}</span>}
        </p>
        {row.card.deactivation_note && <p className="text-[11px] text-slate-400 break-words">“{row.card.deactivation_note}”</p>}
      </>
    ) : (
      '—'
    );

  // Each button names the action; its description is the person's name, for screen readers moving
  // from button to button.
  const actions = (row: IdCardRow, nameId: string) => {
    const { user, card } = row;
    const holder = { id: user.id, name: user.name };
    return (
      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        {!card && (
          <button type="button" onClick={() => setAction({ kind: 'issue', holder, current: null })} aria-describedby={nameId} className={`neu-btn-lime ${actionClass}`}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Issue card
          </button>
        )}
        {card?.status === 'active' && (
          <>
            <button type="button" onClick={() => setViewing(row)} aria-describedby={nameId} className={`neu-btn ${actionClass}`}>
              <Eye className="w-3.5 h-3.5" aria-hidden="true" /> View card
            </button>
            <button type="button" onClick={() => setAction({ kind: 'deactivate', holder, card })} aria-describedby={nameId} className={`neu-btn hover:text-rose-400 ${actionClass}`}>
              <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Deactivate
            </button>
          </>
        )}
        {card?.status === 'deactivated' && (
          <>
            <button type="button" onClick={() => setAction({ kind: 'reactivate', holder, card })} aria-describedby={nameId} className={`neu-btn ${actionClass}`}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reactivate
            </button>
            <button type="button" onClick={() => setAction({ kind: 'issue', holder, current: card })} aria-describedby={nameId} className={`neu-btn-lime ${actionClass}`}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Issue new card
            </button>
          </>
        )}
        <button type="button" onClick={() => setDetailsId(user.id)} aria-describedby={nameId} className={`neu-btn ${actionClass}`}>
          <UserRound className="w-3.5 h-3.5" aria-hidden="true" /> Details
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="ID cards"
        description="The physical cards handed out at the desk. A deactivated card is refused at check-in straight away; the member's app pass keeps working."
        actions={
          <button type="button" onClick={load} disabled={isLoading} className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60 ${focusRing}`}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        }
      />
      <AdminNav />

      {/* Until the first answer, tiles of the same size hold the space so the filters do not jump down.
          A load that fails before any answer drops them: there is nothing to count. */}
      {counts ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <KpiTile title="Active cards" value={counts.active} detail={`of ${counts.people} ${counts.people === 1 ? roleFilter.one : roleFilter.noun}`} icon={<BadgeCheck className="w-5 h-5" />} />
          <KpiTile title="Deactivated" value={counts.deactivated} detail="Refused at check-in" icon={<Ban className="w-5 h-5" />} accent="rose" />
          <KpiTile title="No card yet" value={counts.none} detail="Never issued a card" icon={<UserX className="w-5 h-5" />} accent="slate" />
          <KpiTile title="Cards issued" value={counts.cards_issued} detail="Every card handed out, replacements included" icon={<Layers className="w-5 h-5" />} accent="cyan" />
        </div>
      ) : (
        !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-[9.5rem]" />
            ))}
          </div>
        )
      )}

      <div className="neu-flat p-4 sm:p-5 rounded-3xl border border-slate-800/80 space-y-4">
        <div ref={statusGroupRef} role="group" aria-label="Card status" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} type="button" aria-pressed={filters.status === f.value} onClick={() => setFilters(prev => ({ ...prev, status: f.value }))} className={chipClass(filters.status === f.value)}>
              {f.label}
              {counts && <span className="ml-1.5 text-slate-400">{f.count(counts)}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div role="group" aria-label="Show accounts" className="flex flex-wrap gap-2">
            {ROLE_FILTERS.map(r => (
              <button key={r.value} type="button" aria-pressed={filters.role === r.value} onClick={() => setFilters(prev => ({ ...prev, role: r.value }))} className={chipClass(filters.role === r.value)}>
                {r.label}
              </button>
            ))}
          </div>
          <SearchForm
            id="id-card-search"
            label="Search by name, email, phone, pass code or card number"
            placeholder="Name, email, phone or card number"
            onSearch={search => setFilters(prev => ({ ...prev, search }))}
            className="flex-1 flex gap-2 min-w-0"
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={`Could not load the ID cards. ${error}`} onRetry={load} />
      ) : !overview ? (
        <LoadingState label="Loading ID cards…" />
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${roleFilter.noun} match these filters`} body="Change the search or filters to see more people." />
      ) : (
        <div className={`space-y-3 ${isLoading ? 'opacity-60' : ''}`} aria-busy={isLoading}>
          <p ref={countRef} tabIndex={-1} className="text-xs text-slate-400 outline-none" role="status">
            {rows.length} {rows.length === 1 ? 'person' : 'people'}
          </p>

          <ul className="md:hidden space-y-3">
            {rows.map(row => {
              const nameId = `card-holder-m-${row.user.id}`;
              return (
                <li key={row.user.id} data-card-holder={row.user.id} className="neu-flat p-4 rounded-2xl space-y-3 min-w-0">
                  {personCell(row, nameId)}
                  {cardCell(row)}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-300">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Member ID</dt>
                      <dd className="font-mono">{cardNumber(row.user)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Membership</dt>
                      <dd>{membership(row)}</dd>
                    </div>
                    {row.card && (
                      <div className="min-w-0">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Issued</dt>
                        <dd>{issued(row)}</dd>
                      </div>
                    )}
                    {row.card?.status === 'deactivated' && (
                      <div className="min-w-0">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deactivated</dt>
                        <dd>{deactivated(row)}</dd>
                      </div>
                    )}
                  </dl>
                  {actions(row, nameId)}
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block neu-flat rounded-3xl border border-slate-800/80 overflow-x-auto">
            <table className="neu-table w-full text-left text-xs">
              <caption className="sr-only">ID cards, by name</caption>
              <thead className="border-b border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th scope="col" className="p-4 pl-6">Name</th>
                  <th scope="col" className="p-4">Member ID</th>
                  <th scope="col" className="p-4">Membership</th>
                  <th scope="col" className="p-4">ID card</th>
                  <th scope="col" className="p-4">Issued</th>
                  <th scope="col" className="p-4">Deactivated</th>
                  <th scope="col" className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {rows.map(row => {
                  const nameId = `card-holder-d-${row.user.id}`;
                  return (
                    <tr key={row.user.id} data-card-holder={row.user.id}>
                      <td className="p-4 pl-6 max-w-[260px]">{personCell(row, nameId)}</td>
                      <td className="p-4 whitespace-nowrap font-mono">{cardNumber(row.user)}</td>
                      <td className="p-4">{membership(row)}</td>
                      <td className="p-4">{cardCell(row)}</td>
                      <td className="p-4">{issued(row)}</td>
                      <td className="p-4 max-w-[220px]">{deactivated(row)}</td>
                      <td className="p-4 pr-6">{actions(row, nameId)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <IdCardActionDialog action={action} onClose={() => setAction(null)} onChanged={afterAction} />
      <IdCardModal isOpen={viewing !== null} onClose={() => setViewing(null)} user={viewing?.user ?? null} card={viewing?.card ?? null} forOther />
      <MemberDetailModal memberId={detailsId} onClose={closeDetails} onChanged={load} />
    </div>
  );
};
