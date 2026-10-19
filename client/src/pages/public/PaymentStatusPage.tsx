import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api, errorMessage, isApiError } from '../../api/client.js';
import { GYM_EMAIL, GYM_PHONE_DISPLAY } from '../../components/public/gymInfo.js';
import { homeTabFor } from '../../routes.js';

// Where a YouPI (UPI) payment comes back to (/payment-status?order=ypo_…), and where the app waits
// while the member pays in the phone's browser. It asks the server every few seconds; the server
// asks YouPI, which confirms once the bank's credit alert for the gym's account has arrived.

const ORDER_ID = /^ypo_[A-Za-z0-9]{6,40}$/;
const POLL_MS = 4_000;
// YouPI keeps a session open for 5 minutes to pay and 30 seconds to verify; then some slack.
const GIVE_UP_MS = 7 * 60_000;
const FINAL_CODES = ['ORDER_REJECTED', 'ORDER_NOT_FOUND', 'ORDER_NOT_YOURS'];

type View =
  | { kind: 'waiting' }
  | { kind: 'paid'; message: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'refused'; message: string }
  | { kind: 'slow' };

const FAILURE_TEXT: Record<string, string> = {
  EXPIRED: 'The 5-minute payment window closed before a payment arrived.',
  CANCELLED: 'The payment was cancelled.',
  FAILED: 'The payment did not go through.'
};

interface PaymentStatusPageProps {
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

export const PaymentStatusPage: React.FC<PaymentStatusPageProps> = ({ onOpenAuthModal }) => {
  const { params, navigate } = useNavigation();
  const { user, isInitializing, updateUser, triggerCelebration } = useAuth();
  const orderId = params.get('order') || '';
  const validOrder = ORDER_ID.test(orderId);
  const [view, setView] = useState<View>({ kind: 'waiting' });
  // "Check again" after a long wait starts a new round of checks.
  const [round, setRound] = useState(0);
  const auth = useRef({ updateUser, triggerCelebration });
  auth.current = { updateUser, triggerCelebration };
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !validOrder) return;
    let finished = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setView({ kind: 'waiting' });

    async function check() {
      if (finished || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const result = await api.confirmYoupiPayment(orderId);
        if (finished) return;
        if (result.status === 'paid') {
          finished = true;
          auth.current.updateUser(result.user);
          auth.current.triggerCelebration();
          setView({ kind: 'paid', message: result.message ?? 'Payment received. Your membership is active.' });
          return;
        }
        if (result.status === 'failed') {
          finished = true;
          setView({ kind: 'failed', reason: result.reason });
          return;
        }
      } catch (err) {
        if (finished) return;
        if (isApiError(err) && FINAL_CODES.includes(err.code ?? '')) {
          finished = true;
          setView({ kind: 'refused', message: errorMessage(err) });
          return;
        }
        // A lost connection or the gateway being briefly unreachable: keep checking.
      } finally {
        inFlight = false;
      }
      if (Date.now() - startedAt > GIVE_UP_MS) {
        finished = true;
        setView({ kind: 'slow' });
        return;
      }
      timer = setTimeout(check, POLL_MS);
    }

    // Coming back from the browser or another tab: check straight away.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    void check();
    return () => {
      finished = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, orderId, validOrder, round]);

  const contact = (
    <p className="text-xs text-slate-400">
      Questions? Call the front desk on {GYM_PHONE_DISPLAY} or write to {GYM_EMAIL}, quoting order{' '}
      <span className="font-mono text-slate-300">{orderId || '—'}</span> and the UPI reference (UTR) from your UPI app.
    </p>
  );
  const button = (label: string, onClick: () => void, primary = false) => (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? 'w-full py-3 neu-btn-lime text-black font-black text-sm rounded-2xl'
          : 'w-full py-3 neu-btn rounded-2xl text-sm font-bold text-slate-200'
      }
    >
      {label}
    </button>
  );

  let icon: React.ReactNode;
  let title: string;
  let body: React.ReactNode;

  if (!validOrder) {
    icon = <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden="true" />;
    title = 'This payment link is incomplete';
    body = (
      <>
        <p className="text-sm text-slate-300">Open it again from the payment page, or check your plan on your dashboard.</p>
        {button('See plans', () => navigate('pricing'), true)}
      </>
    );
  } else if (!user && isInitializing) {
    icon = <Loader2 className="w-5 h-5 text-lime-400 animate-spin" aria-hidden="true" />;
    title = 'Checking your payment';
    body = <p className="text-sm text-slate-300">One moment…</p>;
  } else if (!user) {
    icon = <Clock className="w-5 h-5 text-lime-400" aria-hidden="true" />;
    title = 'Sign in to see this payment';
    body = (
      <>
        <p className="text-sm text-slate-300">
          If you started this payment in the PulseFit app, go back to the app: it confirms the payment there. Otherwise, sign in to
          the account you are paying for.
        </p>
        {button('Sign in', () => onOpenAuthModal('login'), true)}
      </>
    );
  } else if (view.kind === 'paid') {
    icon = <CheckCircle2 className="w-5 h-5 text-lime-400" aria-hidden="true" />;
    title = 'Payment received';
    body = (
      <>
        <p role="status" className="text-sm text-slate-200">
          {view.message.replace(/^Payment received\.\s*/, '')}
        </p>
        {button('Go to my dashboard', () => navigate(homeTabFor(user.role), undefined, { replace: true }), true)}
      </>
    );
  } else if (view.kind === 'failed') {
    icon = <XCircle className="w-5 h-5 text-rose-400" aria-hidden="true" />;
    title = 'No payment was received';
    body = (
      <>
        <p role="alert" className="text-sm text-slate-200">
          {FAILURE_TEXT[view.reason] ?? 'The payment did not go through.'} Your plan has not changed.
        </p>
        <p className="text-xs text-slate-400">
          If money did leave your account, it is still applied automatically once your bank confirms it; otherwise the front desk
          activates your plan or refunds you.
        </p>
        {button('Try again', () => navigate('pricing'), true)}
        {contact}
      </>
    );
  } else if (view.kind === 'refused') {
    icon = <XCircle className="w-5 h-5 text-rose-400" aria-hidden="true" />;
    title = 'This payment could not be applied';
    body = (
      <>
        <p role="alert" className="text-sm text-slate-200">
          {view.message} Nothing was activated on your membership. If money was taken, the front desk activates the plan you paid for
          or refunds you in full.
        </p>
        {contact}
      </>
    );
  } else if (view.kind === 'slow') {
    icon = <Clock className="w-5 h-5 text-amber-400" aria-hidden="true" />;
    title = 'Still waiting for your bank';
    body = (
      <>
        <p className="text-sm text-slate-200">
          We have not had confirmation yet. If you paid, your plan turns on by itself as soon as the bank&apos;s alert arrives, even if
          you close this page.
        </p>
        {button('Check again', () => setRound(r => r + 1), true)}
        {contact}
      </>
    );
  } else {
    icon = <Loader2 className="w-5 h-5 text-lime-400 animate-spin" aria-hidden="true" />;
    title = 'Waiting for your UPI payment';
    body = (
      <>
        <p role="status" className="text-sm text-slate-200">
          Finish paying on the payment page. Your plan turns on here automatically once your bank confirms the money, usually within a
          minute of paying.
        </p>
        <p className="text-xs text-slate-400">Keep the exact amount shown there, and pay within 5 minutes.</p>
        {button('Back to plans', () => navigate('pricing'))}
      </>
    );
  }

  return (
    <section className="max-w-md mx-auto my-20 px-6">
      <div className="neu-flat-lg rounded-3xl p-8 border border-slate-800/80">
        <div className="mb-5 w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center">{icon}</div>
        <h1 className="text-2xl font-black text-slate-100 font-heading">{title}</h1>
        <div className="mt-4 space-y-4">{body}</div>
      </div>
    </section>
  );
};
