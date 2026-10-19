import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Download, IdCard, Mail, Phone, Plus, Repeat, RotateCcw } from 'lucide-react';
import { MemberDetail } from '../../types/index.js';
import { api, downloadFile, errorMessage } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { useToast } from '../../context/ToastContext.js';
import { STATUS_LABELS, TIER_LABELS, formatDate, formatDateTime, formatDay, formatINR } from '../../lib/format.js';
import { Avatar, focusRing } from './ui.js';
import { statusVariant } from './memberStatus.js';
import { IdCardModal } from '../qr/IdCardModal.js';
import { DEACTIVATION_REASON_LABELS } from '../qr/idCard.js';
import { CardStatusBadge, IdCardAction, IdCardActionDialog, eventLabel, useFocusAfterReload } from './IdCardActions.js';

interface MemberDetailModalProps {
  memberId: string | null;
  onClose: () => void;
  /** Called after an ID card was issued, deactivated or reactivated here, so the page behind can refresh. */
  onChanged?: () => void;
}

const METHOD_LABELS: Record<string, string> = { qr: 'QR pass', manual: 'Front desk', kiosk: 'Kiosk', camera: 'Camera scan' };

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ memberId, onClose, onChanged }) => {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isIdCardOpen, setIsIdCardOpen] = useState(false);
  const [cardAction, setCardAction] = useState<IdCardAction | null>(null);
  const cardsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterReload = useFocusAfterReload(member);
  const { showToast } = useToast();
  // The dialog can close and reopen for someone else while an answer is on its way. An answer for a
  // person no longer shown is dropped: it would show, and let the desk act on, the wrong member.
  const shownId = useRef(memberId);
  shownId.current = memberId;

  const load = useCallback(async () => {
    if (!memberId) return;
    setMember(null);
    setError(null);
    try {
      const next = await api.getMemberById(memberId);
      if (shownId.current === memberId) setMember(next);
    } catch (err) {
      if (shownId.current === memberId) setError(errorMessage(err));
    }
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  // After a card action the member is reloaded in place, not through the loading state, so the
  // dialog keeps its scroll position and focus.
  const reloadCards = async () => {
    const id = memberId;
    if (!id) return;
    focusAfterReload(() => cardsHeadingRef.current);
    try {
      const next = await api.getMemberById(id);
      if (shownId.current === id) setMember(next);
    } catch (err) {
      if (shownId.current === id) showToast(errorMessage(err), 'error', 'Could not refresh the ID cards');
    }
    onChanged?.();
  };

  const exportAttendance = async () => {
    if (!member) return;
    setIsExporting(true);
    try {
      await downloadFile(api.attendanceCsvUrl({ user_id: member.id }), `attendance-${member.name.replace(/\W+/g, '-').toLowerCase()}.csv`);
    } catch (err) {
      showToast(errorMessage(err), 'error', 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Newest first. The current card is the active one, else the most recently issued.
  const cards = member?.id_cards ?? [];
  const activeCard = cards.find(c => c.status === 'active') ?? null;
  const currentCard = activeCard ?? cards[0] ?? null;
  const holder = member ? { id: member.id, name: member.name } : null;
  const smallButton = `neu-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${focusRing}`;

  return (
    <Modal isOpen={memberId !== null} onClose={onClose} title={member ? member.name : 'Member details'} maxWidth="2xl">
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !member || !holder ? (
        <LoadingState label="Loading member…" />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar src={member.avatar_url} name={member.name} size="w-14 h-14" />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <a href={`mailto:${member.email}`} className={`flex items-center gap-1.5 text-slate-200 hover:text-lime-400 break-all rounded ${focusRing}`}>
                <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {member.email}
              </a>
              {member.phone && (
                <a href={`tel:${member.phone}`} className={`flex items-center gap-1.5 text-slate-300 hover:text-lime-400 rounded ${focusRing}`}>
                  <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {member.phone}
                </a>
              )}
              <p className="text-xs text-slate-400">Joined {formatDateTime(member.created_at)} · Pass code <span className="font-mono">{member.qr_code_token}</span></p>
            </div>
            <button
              type="button"
              onClick={() => setIsIdCardOpen(true)}
              className={`neu-btn px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 ${focusRing}`}
            >
              <IdCard className="w-4 h-4" aria-hidden="true" /> ID card
            </button>
          </div>
          <IdCardModal isOpen={isIdCardOpen} onClose={() => setIsIdCardOpen(false)} user={member} card={currentCard} forOther />

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="neu-pressed-sm rounded-xl p-3">
              <dt className="text-slate-400 font-semibold">Plan</dt>
              <dd className="mt-1 font-bold text-slate-100">{TIER_LABELS[member.membership_tier]}</dd>
            </div>
            <div className="neu-pressed-sm rounded-xl p-3">
              <dt className="text-slate-400 font-semibold">Status</dt>
              <dd className="mt-1">
                <Badge size="sm" variant={statusVariant(member.membership_status)}>
                  {STATUS_LABELS[member.membership_status]}
                </Badge>
              </dd>
            </div>
            <div className="neu-pressed-sm rounded-xl p-3">
              <dt className="text-slate-400 font-semibold">Access until</dt>
              <dd className="mt-1 font-bold text-slate-100">{formatDate(member.membership_expiry)}</dd>
            </div>
            <div className="neu-pressed-sm rounded-xl p-3">
              <dt className="text-slate-400 font-semibold">Role</dt>
              <dd className="mt-1 font-bold text-slate-100 capitalize">{member.role}</dd>
            </div>
            {[
              ['Check-ins', member.attendance_count],
              ['Bookings', member.bookings_count],
              ['Upcoming classes', member.upcoming_bookings],
              ['Workouts logged', member.workouts_count]
            ].map(([label, value]) => (
              <div key={label} className="neu-pressed-sm rounded-xl p-3">
                <dt className="text-slate-400 font-semibold">{label}</dt>
                <dd className="mt-1 text-lg font-black text-slate-100 font-heading">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="id-cards-heading" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 id="id-cards-heading" ref={cardsHeadingRef} tabIndex={-1} className="text-sm font-extrabold text-slate-100 font-heading outline-none">
                  ID cards
                </h3>
                <p className="text-xs text-slate-400">Physical cards handed out at the desk, newest first.</p>
              </div>
              {!activeCard && (
                <button
                  type="button"
                  onClick={() => setCardAction({ kind: 'issue', holder, current: currentCard })}
                  className={`neu-btn-lime px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 whitespace-nowrap ${focusRing}`}
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {currentCard ? 'Issue new card' : 'Issue card'}
                </button>
              )}
            </div>
            {cards.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {cards.map(c => {
                  const replaced = c.replaces_card_id ? cards.find(other => other.id === c.replaces_card_id) : undefined;
                  return (
                    <li key={c.id} className="neu-pressed-sm rounded-xl p-3 sm:p-4 space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span id={`card-number-${c.id}`} className="font-mono text-sm font-bold text-slate-100">{c.card_number}</span>
                          <CardStatusBadge status={c.status} />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {c.status === 'active' ? (
                            <>
                              <button type="button" aria-describedby={`card-number-${c.id}`} onClick={() => setCardAction({ kind: 'deactivate', holder, card: c })} className={`${smallButton} hover:text-rose-400`}>
                                <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Deactivate
                              </button>
                              <button type="button" aria-describedby={`card-number-${c.id}`} onClick={() => setCardAction({ kind: 'issue', holder, current: c })} className={smallButton}>
                                <Repeat className="w-3.5 h-3.5" aria-hidden="true" /> Replace card
                              </button>
                            </>
                          ) : (
                            // Only one card can work at a time: with another card active, this one stays off.
                            !activeCard && (
                              <button type="button" aria-describedby={`card-number-${c.id}`} onClick={() => setCardAction({ kind: 'reactivate', holder, card: c })} className={smallButton}>
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reactivate
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      <p className="text-slate-400">
                        Issued {formatDay(c.issued_at)} by {c.issued_by_name}
                        {replaced && ` · replaces ${replaced.card_number}`}
                      </p>
                      {c.status === 'deactivated' && (
                        <p className="font-semibold text-rose-300 break-words">
                          Deactivated{c.deactivated_at && ` ${formatDay(c.deactivated_at)}`}
                          {c.deactivation_reason && ` · ${DEACTIVATION_REASON_LABELS[c.deactivation_reason]}`}
                          {c.deactivation_note && ` · “${c.deactivation_note}”`}
                        </p>
                      )}
                      <ol aria-label={`History of card ${c.card_number}`} className="border-l-2 border-slate-700/60 pl-3 space-y-1">
                        {c.events.map((event, i) => (
                          <li key={i} className="text-slate-400 break-words">
                            <span className="font-semibold text-slate-300">{eventLabel(event)}</span> · {formatDateTime(event.at)} · {event.by_name}
                            {event.note && <span className="block text-slate-400">“{event.note}”</span>}
                          </li>
                        ))}
                      </ol>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No ID card issued yet" body="Issue one when the card is handed over at the desk. Until then the app pass works at check-in." />
            )}
          </section>
          <IdCardActionDialog action={cardAction} onClose={() => setCardAction(null)} onChanged={reloadCards} />

          <section aria-labelledby="recent-attendance-heading" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="recent-attendance-heading" className="text-sm font-extrabold text-slate-100 font-heading">
                Recent check-ins
              </h3>
              {member.attendance_count > 0 && (
                <button
                  type="button"
                  onClick={exportAttendance}
                  disabled={isExporting}
                  className={`neu-btn px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 ${focusRing}`}
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" /> {isExporting ? 'Exporting…' : 'Export all (CSV)'}
                </button>
              )}
            </div>
            {member.recent_attendance.length > 0 ? (
              <ul className="divide-y divide-slate-800/60 neu-pressed-sm rounded-xl text-xs">
                {member.recent_attendance.map(log => (
                  <li key={log.id} className="flex justify-between gap-3 px-3 py-2">
                    <span className="text-slate-200">{formatDateTime(log.check_in_time)}</span>
                    <span className="text-slate-400">{METHOD_LABELS[log.check_in_method] ?? log.check_in_method}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No check-ins yet" />
            )}
          </section>

          <section aria-labelledby="payments-heading" className="space-y-2">
            <h3 id="payments-heading" className="text-sm font-extrabold text-slate-100 font-heading">
              Payments
            </h3>
            {member.payments.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {member.payments.map(p => (
                  <li key={p.id} className="neu-pressed-sm rounded-xl px-3 py-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-100">
                        {p.plan_name} · {p.billing_cycle === 'annual' ? 'Annual' : 'Monthly'}
                      </span>
                      <span className="block text-slate-400">
                        {p.invoice_number} · {formatDate(p.period_start)} – {formatDate(p.period_end)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-black text-slate-100">{formatINR(p.amount_inr)}</span>
                      <span className={`block font-semibold ${p.status === 'refunded' ? 'text-amber-400' : 'text-slate-400'}`}>
                        {p.status === 'refunded' ? 'Refunded' : `Paid ${formatDateTime(p.created_at)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No payments on record" />
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};
