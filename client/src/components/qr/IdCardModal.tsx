import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer, RotateCw } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { User } from '../../types/index.js';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.js';
import { STATUS_LABELS, formatDate, tierLabel } from '../../lib/format.js';
import { CARD_HEIGHT, CARD_WIDTH, IdCardFaces, cardNumber, printIdCard, renderIdCard, stackedPng } from './idCard.js';

interface IdCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  /** True when staff open someone else's card (front desk printing); changes only the wording. */
  forOther?: boolean;
}

/** A PulseFit ID card: front with photo and details, back with the check-in QR code. Flips, downloads and prints. */
export const IdCardModal: React.FC<IdCardModalProps> = ({ isOpen, onClose, user, forOther = false }) => {
  const { showToast } = useToast();
  const [faces, setFaces] = useState<IdCardFaces | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setFaces(null);
    setError(null);
    setShowBack(false);
    (async () => {
      // The catalogue name of the plan (admins can rename plans); the built-in names if it cannot load.
      const plans = await api.getPlans().catch(() => null);
      const qrDataUrl = await QRCode.toDataURL(user.qr_code_token, { width: 552, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
      const drawn = await renderIdCard({ user, planName: tierLabel(user.membership_tier, plans), qrDataUrl });
      if (!cancelled) setFaces(drawn);
    })().catch(err => !cancelled && setError(err instanceof Error ? err.message : 'The card could not be drawn.'));
    return () => {
      cancelled = true;
    };
  }, [isOpen, user]);

  if (!user) return null;

  const isStaff = user.role !== 'member';
  const fileBase = `pulsefit-id-card-${user.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const summary = isStaff
    ? `${user.name}, ${user.role === 'admin' ? 'admin' : 'coach'}, staff ID ${cardNumber(user)}.`
    : `${user.name}, member ID ${cardNumber(user)}, ${user.membership_tier === 'none' ? 'no plan yet' : tierLabel(user.membership_tier)}, ${STATUS_LABELS[user.membership_status].toLowerCase()}${user.membership_expiry ? `, valid through ${formatDate(user.membership_expiry)}` : ''}.`;

  const download = async () => {
    if (!faces) return;
    setBusy('download');
    try {
      const blob = await stackedPng(faces);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileBase}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The card could not be downloaded.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    if (!faces) return;
    setBusy('print');
    try {
      await printIdCard(faces, `${user.name} · PulseFit ID card`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The card could not be printed.', 'error');
    } finally {
      setBusy(null);
      // Printing focuses the hidden print frame; bring focus back so Escape and Tab work in the dialog
      // (after this render, once the button is enabled again).
      setTimeout(() => printButtonRef.current?.focus(), 0);
    }
  };

  const face = 'absolute inset-0 w-full h-full rounded-[4%/6.3%] [backface-visibility:hidden] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)]';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={forOther ? `${user.name}'s ID card` : 'My ID card'}
      description={forOther ? 'Print it on card stock for the member, or download it.' : 'Your PulseFit card: show it at the front desk, download it or print it.'}
      maxWidth="xl"
    >
      <div className="space-y-5">
        <p id="id-card-summary" className="sr-only">
          {summary}
        </p>
        {error ? (
          <p role="alert" className="glass-tint rounded-xl p-3 text-sm border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200">
            {error}
          </p>
        ) : (
          <div className="mx-auto w-full max-w-[30rem] [perspective:1400px]">
            <button
              type="button"
              onClick={() => setShowBack(v => !v)}
              disabled={!faces}
              aria-label={showBack ? 'Show the front of the card' : 'Show the back of the card'}
              aria-describedby="id-card-summary"
              className="relative block w-full rounded-[4%/6.3%] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-500"
              style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
            >
              {faces ? (
                <span
                  className={`absolute inset-0 [transform-style:preserve-3d] transition-transform duration-700 motion-reduce:transition-none ${showBack ? '[transform:rotateY(180deg)]' : ''}`}
                >
                  <img src={faces.front} alt="" className={face} draggable={false} />
                  <img src={faces.back} alt="" className={`${face} [transform:rotateY(180deg)]`} draggable={false} />
                </span>
              ) : (
                <span className="absolute inset-0 rounded-[4%/6.3%] neu-pressed-sm animate-pulse" role="status" aria-label="Drawing the card" />
              )}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          {showBack ? 'Back: the QR code the front desk scans.' : 'Front: tap the card to see the back.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setShowBack(v => !v)}
            disabled={!faces}
            className="neu-btn py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RotateCw className="w-4 h-4" aria-hidden="true" /> Flip card
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!faces || busy !== null}
            className="neu-btn-lime py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> {busy === 'download' ? 'Preparing…' : 'Download PNG'}
          </button>
          <button
            ref={printButtonRef}
            type="button"
            onClick={print}
            disabled={!faces || busy !== null}
            className="neu-btn py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" aria-hidden="true" /> {busy === 'print' ? 'Opening…' : 'Print'}
          </button>
        </div>

        <p className="text-[11px] text-slate-500 text-center">
          Prints at real card size (85.6 × 54 mm), both sides. {forOther ? 'The QR code identifies the member at check-in.' : 'Keep it private: the QR code identifies you at check-in.'}
        </p>
      </div>
    </Modal>
  );
};
