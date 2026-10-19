import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Download, RotateCw } from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { MyIdCard } from '../../types/index.js';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { STATUS_LABELS, formatDate, tierLabel } from '../../lib/format.js';
import { saveFile } from '../../lib/native.js';
import { CARD_HEIGHT, CARD_WIDTH, CardHolder, IdCardFaces, PhysicalCard, cardNumber, deactivatedWhen, renderIdCard, roleStyleOf, stackedPng } from './idCard.js';

interface IdCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CardHolder | null;
  /**
   * True when staff open someone else's card from the member's details. Without it the card is the
   * signed-in person's own, and the dialog looks up the physical card the gym issued them.
   */
  forOther?: boolean;
  /**
   * The physical card staff opened (forOther only): its number goes in the QR code, and a deactivated
   * one is stamped. Left out, or null when none was issued, the card shows the app pass.
   */
  card?: PhysicalCard | null;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A PulseFit ID badge: a vertical card with photo and details on the front and the check-in QR code
 * on the back. It hangs from a lanyard in the role's colours and swings gently, tilts towards the
 * pointer, follows the app's theme, flips and downloads. The physical card is issued by the gym, so
 * there is no print option.
 */
export const IdCardModal: React.FC<IdCardModalProps> = ({ isOpen, onClose, user, forOther = false, card = null }) => {
  const { showToast } = useToast();
  const { isDark } = useTheme();
  const theme = isDark ? 'dark' : 'light';
  const [faces, setFaces] = useState<IdCardFaces | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50, active: false });
  const pointer = useRef<{ x: number; y: number; target: HTMLElement } | null>(null);
  const tiltFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(tiltFrame.current), []);
  // The signed-in person's own issued card, looked up each time the dialog opens (undefined while
  // asking). If the answer does not come, the card shows the app pass, which always works.
  const [ownCard, setOwnCard] = useState<MyIdCard | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || forOther) return;
    let cancelled = false;
    api
      .getMyIdCard()
      .then(r => r.card)
      .catch(() => null)
      .then(found => {
        if (!cancelled) setOwnCard(found);
      });
    return () => {
      cancelled = true;
      // Forget it on close, so reopening never shows a card that has changed since.
      setOwnCard(undefined);
    };
  }, [isOpen, forOther, user?.id]);

  // The card drawn. Staff see the card they opened, working or not. People see their own card only
  // while it works: with a deactivated one they check in with the app pass until they get a new card.
  const shown: PhysicalCard | null = forOther ? card : ownCard?.status === 'active' ? ownCard : null;
  const ownDeactivated = !forOther && ownCard?.status === 'deactivated' ? ownCard : null;
  const isAsking = !forOther && ownCard === undefined;
  const shownNumber = shown?.card_number ?? null;
  const shownStatus = shown?.status ?? null;

  // A new person or card (or reopening) starts on the front, from a blank card.
  useEffect(() => {
    if (!isOpen) return;
    setFaces(null);
    setShowBack(false);
  }, [isOpen, user, shownNumber]);

  // Draw (and redraw on a theme switch, keeping the side on show).
  useEffect(() => {
    if (!isOpen || !user || isAsking) return;
    let cancelled = false;
    setError(null);
    (async () => {
      // The catalogue name of the plan (admins can rename plans); the built-in names if it cannot load.
      const plans = await api.getPlans().catch(() => null);
      // An issued card has its own code, so deactivating the card stops it at the scanner while the
      // app pass keeps working.
      const code = shownNumber ?? user.qr_code_token;
      if (!code) throw new Error('This card has no code to show.');
      const qrDataUrl = await QRCode.toDataURL(code, { width: 552, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
      const drawnCard = shownNumber && shownStatus ? { card_number: shownNumber, status: shownStatus } : null;
      const drawn = await renderIdCard({ user, planName: tierLabel(user.membership_tier, plans), qrDataUrl, theme, card: drawnCard });
      if (!cancelled) setFaces(drawn);
    })().catch(err => !cancelled && setError(err instanceof Error ? err.message : 'The card could not be drawn.'));
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, theme, isAsking, shownNumber, shownStatus]);

  if (!user) return null;

  const isStaff = user.role !== 'member';
  const isDeactivated = shown?.status === 'deactivated';
  const fileBase = `pulsefit-id-card-${user.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // Tests read the wording up to the ID, so the issued card's number and status go after it.
  const summary =
    (isStaff
      ? `${user.name}, ${user.role === 'admin' ? 'admin' : 'coach'}, staff ID ${cardNumber(user)}.`
      : `${user.name}, member ID ${cardNumber(user)}, ${user.membership_tier === 'none' ? 'no plan yet' : tierLabel(user.membership_tier)}, ${STATUS_LABELS[user.membership_status].toLowerCase()}${user.membership_expiry ? `, valid through ${formatDate(user.membership_expiry)}` : ''}.`) +
    (shown ? ` Card ${shown.card_number}, ${isDeactivated ? 'deactivated: it no longer works at check-in' : 'active'}.` : '');

  // The description is read out as the dialog opens, so it never guesses: while the person's own
  // card is being looked up it says only what is certain.
  let description: string;
  if (forOther) {
    description = !shown
      ? 'The digital card the member sees in the app.'
      : isDeactivated
        ? `Card ${shown.card_number} was deactivated and no longer works at check-in.`
        : `Card ${shown.card_number}, issued at the front desk. Its QR code works at check-in.`;
  } else {
    description = isAsking
      ? 'Your digital PulseFit card.'
      : shown
        ? `Your PulseFit card ${shown.card_number}. Its QR code gets you in at the front desk.`
        : ownDeactivated
          ? 'Your digital PulseFit card, with your app pass.'
          : 'Your digital PulseFit card. Your physical card is issued at the front desk.';
  }

  const download = async () => {
    if (!faces) return;
    setDownloading(true);
    try {
      await saveFile(await stackedPng(faces), `${fileBase}.png`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The card could not be downloaded.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  // Tilt towards the pointer, with a glare that follows it. Pointer moves come faster than the screen
  // redraws and each tilt re-renders the dialog, so only the latest position is applied, once a frame.
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    pointer.current = { x: e.clientX, y: e.clientY, target: e.currentTarget };
    if (tiltFrame.current) return;
    tiltFrame.current = requestAnimationFrame(() => {
      tiltFrame.current = 0;
      const p = pointer.current;
      if (!p) return;
      const r = p.target.getBoundingClientRect();
      const px = (p.x - r.left) / r.width;
      const py = (p.y - r.top) / r.height;
      setTilt({ x: (0.5 - py) * 10, y: (px - 0.5) * 16, gx: px * 100, gy: py * 100, active: true });
    });
  };
  const resetTilt = () => {
    cancelAnimationFrame(tiltFrame.current);
    tiltFrame.current = 0;
    setTilt(t => ({ ...t, x: 0, y: 0, active: false }));
  };

  const corner = 'rounded-[5.3%/3.4%]';
  const [c0, c1, c2] = roleStyleOf(user.role).gradient;
  const face = `absolute inset-0 w-full h-full ${corner} [backface-visibility:hidden] ${
    isDark ? 'shadow-[0_30px_60px_-18px_rgba(0,0,0,0.75)]' : 'shadow-[0_30px_60px_-20px_rgba(15,23,42,0.45)]'
  }`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={forOther ? `${user.name}'s ID card` : 'My ID card'}
      description={description}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Always rendered, and first so it adds no gap while empty: the person's own card is looked
            up after the dialog opens, and a notice that arrives later must still be read out. */}
        <div role="status">
          {shown && isDeactivated && (
            <p className="glass-tint flex items-start gap-2 rounded-xl p-3 text-sm font-semibold border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>This card was deactivated{deactivatedWhen(shown)}. It no longer works at check-in.</span>
            </p>
          )}
          {ownDeactivated && (
            <p className="glass-tint flex items-start gap-2 rounded-xl p-3 text-sm font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Your card {ownDeactivated.card_number} was deactivated{deactivatedWhen(ownDeactivated)}. Ask the front desk for a new one; until then, check in
                with your app pass.
              </span>
            </p>
          )}
        </div>
        <p id="id-card-summary" className="sr-only">
          {summary}
        </p>
        {error ? (
          <p role="alert" className="glass-tint rounded-xl p-3 text-sm border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200">
            {error}
          </p>
        ) : (
          <div className="relative mx-auto w-full max-w-[15rem] sm:max-w-[16rem] pb-8 [perspective:1400px]">
            {/* A soft coloured glow behind the badge, and its shadow on the "floor". */}
            <div aria-hidden="true" className="id-card-aura pointer-events-none absolute -inset-x-6 top-16 bottom-8 rounded-[2rem] blur-2xl" />
            <div aria-hidden="true" className="id-card-ground pointer-events-none absolute left-[18%] right-[18%] bottom-1 h-6 rounded-[50%] blur-xl" />

            {/* The badge swings from the top of its lanyard. */}
            <div className="id-badge-swing relative">
              <div aria-hidden="true" className="relative mx-auto h-16 w-9 z-0">
                <div
                  className="absolute inset-0 rounded-b-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
                  style={{ background: `repeating-linear-gradient(180deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 6px), linear-gradient(180deg, ${c0}, ${c1}, ${c2})` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black tracking-[0.3em] text-white/90 [writing-mode:vertical-rl]">PULSEFIT</span>
              </div>
              <div aria-hidden="true" className="relative z-20 mx-auto -mt-1 h-5 w-14 rounded-md bg-gradient-to-b from-slate-100 via-slate-300 to-slate-400 shadow-[0_2px_6px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.9)]">
                <span className="absolute left-1/2 top-1/2 h-1.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500/70" />
              </div>
              <button
                type="button"
                onClick={() => setShowBack(v => !v)}
                onPointerMove={onPointerMove}
                onPointerLeave={resetTilt}
                disabled={!faces}
                aria-label={showBack ? 'Show the front of the card' : 'Show the back of the card'}
                aria-describedby="id-card-summary"
                className={`relative z-10 -mt-6 block w-full ${corner} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-500 [transform-style:preserve-3d]`}
                style={{
                  aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
                  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                  transition: tilt.active ? 'transform 90ms linear' : 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
              >
                {faces ? (
                  <span
                    className={`absolute inset-0 [transform-style:preserve-3d] transition-transform duration-700 motion-reduce:transition-none ${showBack ? '[transform:rotateY(180deg)]' : ''}`}
                  >
                    <img src={faces.front} alt="" width={CARD_WIDTH} height={CARD_HEIGHT} className={face} draggable={false} />
                    <img src={faces.back} alt="" width={CARD_WIDTH} height={CARD_HEIGHT} className={`${face} [transform:rotateY(180deg)]`} draggable={false} />
                  </span>
                ) : (
                  <span className={`absolute inset-0 ${corner} neu-pressed-sm animate-pulse`} role="status" aria-label="Drawing the card" />
                )}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 ${corner} transition-opacity duration-300`}
                  style={{
                    opacity: tilt.active ? 1 : 0,
                    background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,${isDark ? 0.22 : 0.5}), rgba(255,255,255,0) 55%)`,
                    mixBlendMode: isDark ? 'screen' : 'soft-light',
                    transform: 'translateZ(2px)'
                  }}
                />
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          {showBack ? 'Back: the QR code the front desk scans.' : 'Front: tap the card to see the back.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            disabled={!faces || downloading}
            className="neu-btn-lime py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> {downloading ? 'Preparing…' : 'Download PNG'}
          </button>
        </div>

        <p className="text-[11px] text-slate-500 text-center">
          {forOther
            ? isDeactivated
              ? "This card's QR code is refused at check-in; the member's app pass still works."
              : 'The QR code identifies the member at check-in.'
            : 'Keep it private: the QR code identifies you at check-in.'}
        </p>
      </div>
    </Modal>
  );
};
