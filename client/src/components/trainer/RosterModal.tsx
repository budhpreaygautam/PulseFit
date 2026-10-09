import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Mail, Phone, RotateCcw, UserX } from 'lucide-react';
import { BookingStatus, ClassRoster } from '../../types/index.js';
import { ApiError, api, errorMessage } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { Avatar, FormError, focusRing } from '../admin/ui.js';
import { TIER_LABELS, formatClock, formatDate, formatDateTime } from '../../lib/format.js';

export interface RosterSession {
  classId: string;
  date: string;
  title: string;
}

interface RosterModalProps {
  session: RosterSession | null;
  onClose: () => void;
  /** Attendance changed; the dashboard's stats are out of date. */
  onChanged: () => void;
}

// Matches the server: attendance can be taken from 15 minutes before the class starts.
const OPENS_BEFORE_MS = 15 * 60_000;
// While the roster waits for a change (attendance opening, then the class starting) it re-checks
// the clock at least this often. Browsers pause timers while a computer sleeps, so after waking the
// roster catches up within a minute, or at once when the page is shown or focused again.
const RECHECK_MS = 60_000;

const STATUS_BADGE: Record<BookingStatus, { label: string; variant: 'lime' | 'crimson' | 'slate' | 'amber' }> = {
  confirmed: { label: 'Not marked', variant: 'slate' },
  attended: { label: 'Attended', variant: 'lime' },
  no_show: { label: 'No-show', variant: 'crimson' },
  cancelled: { label: 'Cancelled', variant: 'amber' }
};

function attendanceError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'CLASS_NOT_STARTED') return 'Attendance opens 15 minutes before the class starts.';
    if (err.code === 'NOT_YOUR_CLASS') return 'Only the coach who teaches this class can take its attendance.';
    if (err.code === 'ALREADY_CANCELLED') return 'This booking was cancelled, so attendance cannot be recorded.';
  }
  return errorMessage(err);
}

export const RosterModal: React.FC<RosterModalProps> = ({ session, onClose, onChanged }) => {
  const [roster, setRoster] = useState<ClassRoster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // The clock the attendance window is judged by; moved on by the timer and wake-up checks below.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!session) return;
    setLoadError(null);
    try {
      const next = await api.getClassRoster(session.classId, session.date);
      setNow(Date.now());
      setRoster(next);
    } catch (err) {
      setLoadError(attendanceError(err));
    }
  }, [session]);

  useEffect(() => {
    setRoster(null);
    setActionError(null);
    load();
  }, [load]);

  const mark = async (bookingId: string, status: 'attended' | 'no_show' | 'confirmed') => {
    setSavingId(bookingId);
    setActionError(null);
    try {
      await api.markAttendance(bookingId, status);
      onChanged();
    } catch (err) {
      setActionError(attendanceError(err));
    } finally {
      setSavingId(null);
      load();
    }
  };

  const startsAtMs = roster ? Date.parse(roster.class.starts_at) : 0;
  const opensAt = startsAtMs - OPENS_BEFORE_MS;
  const isOpen = roster ? now >= opensAt : false;
  const counts = (roster?.attendees ?? []).reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});

  // The next moment the roster changes by itself: attendance opens (the buttons unlock), then the
  // class starts (the capacity leaves the header). Null once both have passed.
  const nextChange = !roster ? null : now < opensAt ? opensAt : now < startsAtMs ? startsAtMs : null;

  // Move the clock on at that moment, without the coach reopening the roster.
  useEffect(() => {
    if (nextChange === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(nextChange - Date.now(), 0) + 250, RECHECK_MS));
    return () => window.clearTimeout(timer);
  }, [nextChange, now]);

  // A computer waking from sleep shows or focuses the page again: catch up at once.
  useEffect(() => {
    if (nextChange === null) return;
    const refresh = () => setNow(Date.now());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [nextChange]);

  return (
    <Modal
      isOpen={session !== null}
      onClose={onClose}
      title={session ? `${session.title} roster` : undefined}
      description={roster ? `${formatDate(roster.date)} · ${formatClock(roster.class.start_time)} · ${roster.class.room}` : session ? formatDate(session.date) : undefined}
      maxWidth="2xl"
    >
      {loadError && !roster ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !roster ? (
        <LoadingState label="Loading the roster…" />
      ) : (
        <div className="space-y-4">
          {/* Everyone listed booked, no-shows included, so marking attendance never changes this
              count. Capacity is shown only before the class: it may have changed since a past one. */}
          <p className="text-sm text-slate-300">
            <strong className="text-slate-100">{roster.attendees.length}</strong>
            {now < startsAtMs ? `/${roster.class.capacity}` : ''} booked · {counts.attended ?? 0} attended · {counts.no_show ?? 0} no-show ·{' '}
            {counts.confirmed ?? 0} not marked
          </p>
          {!isOpen && (
            <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-semibold text-slate-200" role="note">
              Attendance opens at {formatDateTime(new Date(opensAt).toISOString())}, 15 minutes before the class.
            </p>
          )}
          <FormError message={actionError} />
          {roster.attendees.length === 0 ? (
            <EmptyState title="No one has booked this session" />
          ) : (
            <ul className="space-y-2">
              {roster.attendees.map(a => {
                const badge = STATUS_BADGE[a.status];
                const busy = savingId === a.booking_id;
                const buttonClass = (active: boolean) =>
                  `px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${focusRing} ${active ? 'neu-pressed-sm text-lime-400' : 'neu-btn'}`;
                return (
                  <li key={a.booking_id} className="neu-pressed-sm rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar src={a.user_avatar} name={a.user_name} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-100 flex flex-wrap items-center gap-2">
                          <span className="break-words">{a.user_name}</span>
                          <Badge size="sm" variant={badge.variant}>{badge.label}</Badge>
                        </p>
                        <p className="text-xs text-slate-400">{TIER_LABELS[a.user_tier] ?? 'No plan'}</p>
                        <div className="flex flex-wrap gap-x-3 text-xs">
                          {a.user_email && (
                            <a href={`mailto:${a.user_email}`} className={`inline-flex items-center gap-1 text-slate-300 hover:text-lime-400 break-all rounded ${focusRing}`}>
                              <Mail className="w-3 h-3" aria-hidden="true" /> {a.user_email}
                            </a>
                          )}
                          {a.user_phone && (
                            <a href={`tel:${a.user_phone}`} className={`inline-flex items-center gap-1 text-slate-300 hover:text-lime-400 rounded ${focusRing}`}>
                              <Phone className="w-3 h-3" aria-hidden="true" /> {a.user_phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div role="group" aria-label={`Attendance for ${a.user_name}`} className="flex flex-wrap gap-2 shrink-0">
                      <button type="button" disabled={!isOpen || busy} aria-pressed={a.status === 'attended'} onClick={() => mark(a.booking_id, 'attended')} className={buttonClass(a.status === 'attended')}>
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} Attended
                      </button>
                      <button type="button" disabled={!isOpen || busy} aria-pressed={a.status === 'no_show'} onClick={() => mark(a.booking_id, 'no_show')} className={buttonClass(a.status === 'no_show')}>
                        <UserX className="w-3.5 h-3.5" aria-hidden="true" /> No-show
                      </button>
                      <button type="button" disabled={!isOpen || busy || a.status === 'confirmed'} onClick={() => mark(a.booking_id, 'confirmed')} className={buttonClass(false)} aria-label={`Reset attendance for ${a.user_name}`}>
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
};
