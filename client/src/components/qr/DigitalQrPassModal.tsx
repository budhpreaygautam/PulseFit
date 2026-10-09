import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Copy, Download } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { User } from '../../types/index.js';
import { useToast } from '../../context/ToastContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { formatDate, TIER_LABELS } from '../../lib/format.js';
import { MembershipStatusBadge } from '../member/MembershipStatusBadge.js';
import { copyText } from '../member/clipboard.js';

interface DigitalQrPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const STAFF_PASS_NOTE = 'Staff pass: no membership is needed to check in.';
const STAFF_LABELS: Record<string, string> = { trainer: 'Coach', admin: 'Admin' };

/**
 * Staff skip the membership check at the front desk, so their own plan says nothing about the
 * pass. Mention it in neutral words, if they have one.
 */
function staffPlanNote(user: User): string | null {
  if (user.membership_tier === 'none') return null;
  const plan = TIER_LABELS[user.membership_tier] ?? user.membership_tier;
  if (user.membership_status === 'frozen') return `Your own ${plan} is frozen.`;
  if (!user.membership_expiry) return null;
  if (user.membership_status === 'expired') return `Your own ${plan} ended on ${formatDate(user.membership_expiry)}.`;
  if (user.membership_status === 'active') return `Your own ${plan} runs until ${formatDate(user.membership_expiry)}.`;
  return null;
}

const NOT_ACTIVE_NOTE: Record<string, string> = {
  frozen: 'Your membership is frozen, so the front desk will not let this pass in until you unfreeze it.',
  expired: 'Your membership has expired, so the front desk will not let this pass in until you renew.',
  pending: 'You do not have an active plan yet, so the front desk will not let this pass in until you choose one.'
};

/** Draw the pass (QR code, name, plan, code) onto a canvas for the PNG download. */
async function renderPassPng(user: User, qrDataUrl: string, gymName: string): Promise<Blob> {
  const width = 600;
  const height = 820;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the image.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#84cc16';
  ctx.fillRect(0, 0, width, 12);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px Outfit, system-ui, sans-serif';
  ctx.fillText(gymName, width / 2, 70);
  ctx.font = '600 18px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#475569';
  const isStaff = user.role !== 'member';
  ctx.fillText(isStaff ? 'Staff access pass' : 'Member access pass', width / 2, 100);

  const qr = new Image();
  await new Promise<void>((resolve, reject) => {
    qr.onload = () => resolve();
    qr.onerror = () => reject(new Error('The QR code could not be drawn.'));
    qr.src = qrDataUrl;
  });
  ctx.drawImage(qr, 100, 130, 400, 400);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px Inter, system-ui, sans-serif';
  ctx.fillText(user.name, width / 2, 590, width - 60);
  ctx.font = '20px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#334155';
  if (isStaff) {
    ctx.fillText(STAFF_LABELS[user.role] ?? 'Staff', width / 2, 628);
    ctx.fillText('No membership needed to check in', width / 2, 660);
  } else {
    ctx.fillText(TIER_LABELS[user.membership_tier] ?? user.membership_tier, width / 2, 628, width - 60);
    if (user.membership_expiry) ctx.fillText(`Valid through ${formatDate(user.membership_expiry)}`, width / 2, 660);
  }
  ctx.font = 'bold 22px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(user.qr_code_token, width / 2, 720, width - 60);
  ctx.font = '15px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Show this code at the front desk to check in.', width / 2, 770);

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be saved.'))), 'image/png'));
}

export const DigitalQrPassModal: React.FC<DigitalQrPassModalProps> = ({ isOpen, onClose, user }) => {
  const { showToast } = useToast();
  const { config } = useAppConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const token = user?.qr_code_token;

  useEffect(() => {
    if (!isOpen || !token) return;
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(null);
    QRCode.toDataURL(token, { width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then(url => !cancelled && setQrDataUrl(url))
      .catch(() => !cancelled && setQrError('The QR code could not be generated. You can still check in with the code below.'));
    return () => {
      cancelled = true;
    };
  }, [isOpen, token]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!user) return null;

  const handleCopy = async () => {
    if (await copyText(user.qr_code_token)) {
      setCopied(true);
      showToast('Pass code copied.', 'success');
    } else {
      showToast('Your browser blocked copying. Select the code and copy it by hand.', 'error');
    }
  };

  const handleDownload = async () => {
    if (!qrDataUrl) return;
    setIsDownloading(true);
    try {
      const blob = await renderPassPng(user, qrDataUrl, config.gym.name);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pulsefit-pass-${user.qr_code_token}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The pass could not be downloaded.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // Staff skip the membership check at the front desk: only members are warned, and a staff pass
  // never shows a plan status or end date that would read as the pass having stopped working.
  const isStaff = user.role !== 'member';
  const showNotActiveNote = !isStaff && user.membership_status !== 'active';
  const ownPlanNote = isStaff ? staffPlanNote(user) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Digital access pass" description="Show this QR code at the front desk to check in." maxWidth="md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`}
            alt=""
            className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-black text-slate-100 font-['Outfit'] truncate">{user.name}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {isStaff ? (
                <span className="text-xs text-slate-400">{STAFF_LABELS[user.role] ?? 'Staff'} · staff pass</span>
              ) : (
                <>
                  <span className="text-xs text-slate-400">{TIER_LABELS[user.membership_tier] ?? user.membership_tier}</span>
                  <MembershipStatusBadge status={user.membership_status} />
                </>
              )}
            </div>
          </div>
        </div>

        {showNotActiveNote && (
          <p role="status" className="flex items-start gap-2 text-xs rounded-xl p-3 border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            {NOT_ACTIVE_NOTE[user.membership_status]}
          </p>
        )}

        <div className="mx-auto w-full max-w-[260px] aspect-square bg-white rounded-2xl p-2 flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for pass ${user.qr_code_token}`} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
          ) : qrError ? (
            <p className="text-xs text-slate-700 text-center p-4" role="alert">{qrError}</p>
          ) : (
            <div className="w-8 h-8 rounded-full border-4 border-lime-500/30 border-t-lime-500 animate-spin" role="status" aria-label="Generating QR code" />
          )}
        </div>

        {isStaff ? (
          <div className="text-center text-xs text-slate-400 space-y-1">
            <p>{STAFF_PASS_NOTE}</p>
            {ownPlanNote && <p className="text-[11px] text-slate-500">{ownPlanNote}</p>}
          </div>
        ) : (
          <p className="text-center text-xs text-slate-400">
            {user.membership_expiry ? (
              <>
                Valid through <strong className="text-slate-200">{formatDate(user.membership_expiry)}</strong>
              </>
            ) : (
              'No paid period yet'
            )}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 neu-pressed-sm p-3 rounded-2xl">
          <code className="font-mono text-xs sm:text-sm font-bold text-slate-200 break-all select-all">{user.qr_code_token}</code>
          <button type="button" onClick={handleCopy} className="neu-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 font-bold text-xs">
            {copied ? <Check className="w-3.5 h-3.5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!qrDataUrl || isDownloading}
          className="w-full neu-btn-lime py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> {isDownloading ? 'Preparing…' : 'Download pass (PNG)'}
        </button>
        <p className="text-[11px] text-slate-500 text-center">Front desk staff scan the code or type it in. Keep it private: it identifies you at check-in.</p>
      </div>
    </Modal>
  );
};
