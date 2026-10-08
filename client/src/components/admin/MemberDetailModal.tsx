import React, { useCallback, useEffect, useState } from 'react';
import { Download, Mail, Phone } from 'lucide-react';
import { MemberDetail } from '../../types/index.js';
import { api, downloadFile, errorMessage } from '../../api/client.js';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { useToast } from '../../context/ToastContext.js';
import { STATUS_LABELS, TIER_LABELS, formatDate, formatDateTime, formatINR } from '../../lib/format.js';
import { Avatar, focusRing } from './ui.js';
import { statusVariant } from './memberStatus.js';

interface MemberDetailModalProps {
  memberId: string | null;
  onClose: () => void;
}

const METHOD_LABELS: Record<string, string> = { qr: 'QR pass', manual: 'Front desk', kiosk: 'Kiosk', camera: 'Camera scan' };

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ memberId, onClose }) => {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    if (!memberId) return;
    setMember(null);
    setError(null);
    try {
      setMember(await api.getMemberById(memberId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <Modal isOpen={memberId !== null} onClose={onClose} title={member ? member.name : 'Member details'} maxWidth="2xl">
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !member ? (
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
          </div>

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
                <dd className="mt-1 text-lg font-black text-slate-100 font-['Outfit']">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="recent-attendance-heading" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="recent-attendance-heading" className="text-sm font-extrabold text-slate-100 font-['Outfit']">
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
            <h3 id="payments-heading" className="text-sm font-extrabold text-slate-100 font-['Outfit']">
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
