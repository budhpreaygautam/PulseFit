import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/common/States.js';
import { DigitalQrPassModal, NOT_ACTIVE_NOTE, usePassQr } from '../../components/qr/DigitalQrPassModal.js';
import { cardNumber } from '../../components/qr/idCard.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { ShimmerList, StatusPill } from '../../components/app/ui.js';
import { formatDateTime, tierLabel } from '../../lib/format.js';

const RECENT_CHECKINS = 5;
// As on the website dashboard.
const METHOD_LABELS: Record<string, string> = { qr: 'QR scan', manual: 'Front desk', kiosk: 'Kiosk', camera: 'Camera' };

/**
 * The app's Pass tab (handoff 1a → Pass): the member's QR pass for the front-desk or kiosk scanner,
 * and their latest check-ins. The QR is the fixed pass code the desk scans, so nothing counts down.
 */
export const PassScreen: React.FC = () => {
  const { user } = useAuth();
  const { qrDataUrl, qrError } = usePassQr(user?.qr_code_token, true);
  const [isPassOpen, setIsPassOpen] = useState(false);
  const plans = useApiResource(() => api.getPlans());
  const attendance = useApiResource(() => api.getMyAttendance());

  if (!user) return null;

  return (
    <div className="app-screen flex flex-col items-center gap-[18px]">
      <h1 className="self-start font-heading font-black text-[26px]">Entry pass</h1>

      <div className="app-rise app-glass w-full rounded-[28px] p-6 flex flex-col items-center gap-4" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="p-3.5 bg-white rounded-[18px] w-[196px] h-[196px] flex items-center justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR code for pass ${user.qr_code_token}`}
              width={168}
              height={168}
              className="w-[168px] h-[168px]"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : qrError ? (
            <div role="alert" className="text-center text-xs text-slate-700 space-y-2">
              <p>{qrError}</p>
              <code className="block font-mono font-bold break-all select-all">{user.qr_code_token}</code>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full border-4 border-lime-500/30 border-t-lime-500 animate-spin" role="status" aria-label="Generating QR code" />
          )}
        </div>
        <div className="text-center">
          <p className="font-heading font-extrabold text-lg break-words">{user.name}</p>
          <p className="text-[11px] mt-0.5 text-[color:var(--app-mu)]">
            {cardNumber(user)} · {tierLabel(user.membership_tier, plans.data)}
          </p>
        </div>
        <StatusPill status={user.membership_status} large />
        {user.membership_status !== 'active' && <p className="text-xs text-center leading-normal text-[color:var(--app-amber-tx)]">{NOT_ACTIVE_NOTE[user.membership_status]}</p>}
      </div>

      <p className="text-xs text-center leading-normal text-[color:var(--app-mu)]">Hold this to the front-desk or kiosk scanner.</p>
      <button type="button" onClick={() => setIsPassOpen(true)} className="app-press app-glass rounded-2xl px-5 min-h-[44px] text-xs font-bold text-[color:var(--app-tx2)]">
        Copy or save pass
      </button>

      <section aria-labelledby="pass-checkins-heading" className="app-rise app-glass w-full rounded-3xl p-[18px]" style={{ '--i': 1 } as React.CSSProperties}>
        <h2 id="pass-checkins-heading" className="font-heading font-extrabold text-base mb-3">
          Recent check-ins
        </h2>
        {!attendance.data && attendance.error ? (
          <ErrorState message={attendance.error} onRetry={attendance.reload} />
        ) : !attendance.data ? (
          <ShimmerList rows={2} label="Loading check-ins" />
        ) : attendance.data.length === 0 ? (
          <p className="text-center text-xs py-3.5 text-[color:var(--app-mu)]">No check-ins yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {attendance.data.slice(0, RECENT_CHECKINS).map(a => (
              <li key={a.id} className="app-inset rounded-2xl px-3.5 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] font-bold">{formatDateTime(a.check_in_time)}</span>
                <span className="text-[11px] text-[color:var(--app-mu)]">{METHOD_LABELS[a.check_in_method] ?? a.check_in_method}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DigitalQrPassModal isOpen={isPassOpen} onClose={() => setIsPassOpen(false)} user={user} />
    </div>
  );
};
