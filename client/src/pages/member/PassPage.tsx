import React, { useEffect, useState } from 'react';
import { AlertTriangle, IdCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { NOT_ACTIVE_NOTE, usePassQr } from '../../components/qr/DigitalQrPassModal.js';
import { IdCardModal } from '../../components/qr/IdCardModal.js';
import { cardNumber } from '../../components/qr/idCard.js';
import { MembershipStatusBadge } from '../../components/member/MembershipStatusBadge.js';
import { tierLabel } from '../../lib/format.js';
import { PageScene } from '../../components/app/PageScene.js';

/**
 * The app's Pass tab (the website has no such page): the member's check-in QR pass, the same code the
 * header's QR pass dialog shows, full page, with their ID card one tap away.
 */
export const PassPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { qrDataUrl, qrError } = usePassQr(user?.qr_code_token, true);
  const [isIdCardOpen, setIsIdCardOpen] = useState(false);

  // The status the desk will see is the server's now (an expiry, a renewal at the desk): on opening the
  // page, and when the app comes back to the foreground on it.
  useEffect(() => {
    void refreshUser();
    const onShow = () => {
      if (document.visibilityState === 'visible') void refreshUser();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [refreshUser]);

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-8 space-y-5">
      <h1 className="text-2xl sm:text-3xl font-black text-slate-100 font-heading">My pass</h1>

      <section aria-label="Check-in pass" className="neu-flat rounded-3xl p-6 flex flex-col items-center gap-4 text-center">
        <div className="space-y-1.5">
          <p className="text-lg font-black text-slate-100 font-heading break-words">{user.name}</p>
          <p className="text-xs text-slate-400">
            {cardNumber(user)} · {tierLabel(user.membership_tier)}
          </p>
          <MembershipStatusBadge status={user.membership_status} />
        </div>

        {user.membership_status !== 'active' && (
          <p role="status" className="flex items-start gap-2 text-left text-xs rounded-xl p-3 border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            {NOT_ACTIVE_NOTE[user.membership_status]}
          </p>
        )}

        <div className="w-full max-w-[240px] aspect-square bg-white rounded-2xl p-2 flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for pass ${user.qr_code_token}`} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
          ) : qrError ? (
            <p className="text-xs text-slate-700 text-center p-4" role="alert">{qrError}</p>
          ) : (
            <div className="w-8 h-8 rounded-full border-4 border-lime-500/30 border-t-lime-500 animate-spin" role="status" aria-label="Generating QR code" />
          )}
        </div>

        <code className="font-mono text-sm font-bold text-slate-200 break-all select-all">{user.qr_code_token}</code>
        <p className="text-xs text-slate-400">Show this at the front desk to check in.</p>
      </section>

      {/* Below the pass, so the QR code keeps its place on the first screen. */}
      <PageScene tab="pass" placement="between-sections" />

      <button type="button" onClick={() => setIsIdCardOpen(true)} className="w-full neu-btn py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
        <IdCard className="w-4 h-4" aria-hidden="true" /> ID card
      </button>

      <IdCardModal isOpen={isIdCardOpen} onClose={() => setIsIdCardOpen(false)} user={user} />
    </div>
  );
};
