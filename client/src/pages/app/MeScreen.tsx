import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeIndianRupee,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  Download,
  Dumbbell,
  FileText,
  Gift,
  House,
  KeyRound,
  LogOut,
  Mail,
  Medal,
  Music2,
  Salad,
  Share2,
  Snowflake,
  UserCircle,
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api } from '../../api/client.js';
import { Payment } from '../../types/index.js';
import { GiftImage } from '../../components/common/GiftImage.js';
import { ErrorState } from '../../components/common/States.js';
import { TabLink } from '../../components/public/TabLink.js';
import { IdCardModal } from '../../components/qr/IdCardModal.js';
import { cardNumber } from '../../components/qr/idCard.js';
import { avatarOf } from '../../components/member/avatarImage.js';
import { FreezeDialog } from '../../components/member/FreezeDialog.js';
import { InvoiceModal } from '../../components/member/InvoiceModal.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { useShareReferral } from '../../components/member/useShareReferral.js';
import { clearDraft } from '../../components/app/trainDraft.js';
import { cheapestGifts, milestoneLine, nextMilestone, openClaims } from '../../components/app/rewards.js';
import { AppSwitch, CountUp, ShimmerList } from '../../components/app/ui.js';
import { formatDate, formatDay, formatINR } from '../../lib/format.js';
import { riseOrder } from '../../lib/appMotion.js';

const ME_INVOICES = 3;
const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

type Row = { tab: string; params?: Record<string, string>; label: string; icon: React.ComponentType<{ className?: string }> };

const ACCOUNT: Row[] = [
  { tab: 'my-bookings', label: 'My bookings', icon: CalendarCheck },
  { tab: 'workout-logger', params: { view: 'full' }, label: 'Workout log & history', icon: Dumbbell },
  { tab: 'profile', params: { tab: 'details' }, label: 'Personal details & avatar', icon: UserCircle },
  { tab: 'profile', params: { tab: 'security' }, label: 'Password & two-step sign-in', icon: KeyRound }
];

// The website header's links (icons as in Navbar), so every page stays one tap away in the app.
const EXPLORE: Row[] = [
  // A bare / sends a member Home, so the landing page needs its query.
  { tab: 'home', params: { view: 'full' }, label: 'Overview', icon: House },
  { tab: 'workout', label: 'Strength floor', icon: Dumbbell },
  { tab: 'zumba', label: 'Zumba studio', icon: Music2 },
  { tab: 'guide', label: 'Plans & diets', icon: Salad },
  { tab: 'trainers', label: 'Coaches', icon: Medal },
  { tab: 'pricing', label: 'Memberships', icon: BadgeIndianRupee },
  { tab: 'exercise-library', label: 'Exercises', icon: BookOpen },
  { tab: 'contact', label: 'Contact us', icon: Mail }
];

// As in the website footer.
const LEGAL = [
  { tab: 'privacy', label: 'Privacy policy' },
  { tab: 'terms', label: 'Terms of service' },
  { tab: 'refunds', label: 'Refunds & cancellations' }
];

const sectionTitle = 'font-heading font-extrabold text-base mt-1';

/**
 * The app's Me tab (handoff 1a → Me): the ID card, freezing, plans, invoices and rewards, then the
 * account and explore links the website keeps in its header and footer, the theme and Sign out.
 */
export const MeScreen: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { params, navigate } = useNavigation();
  const { isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const share = useShareReferral();
  const plans = useApiResource(() => api.getPlans());
  const payments = useApiResource(() => api.getMyPayments());
  const rewards = useApiResource(() => api.getMyRewards());
  const store = useApiResource(() => api.getStoreGifts());
  const [isIdCardOpen, setIsIdCardOpen] = useState(false);
  const [freeze, setFreeze] = useState<'freeze' | 'unfreeze' | null>(null);
  const [invoice, setInvoice] = useState<Payment | null>(null);

  // As on the profile page: membership status and expiry can change on the server (expiry, admin edits).
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Home's Rewards card opens Me at the Rewards section: scroll there once everything above it has loaded,
  // and move focus there once App has put it on this screen's heading.
  const settled = [plans, payments, rewards, store].every(r => r.data || r.error);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!settled || scrolled.current || params.get('section') !== 'rewards') return;
    scrolled.current = true;
    document.getElementById('me-rewards')?.scrollIntoView({ block: 'start' });
    requestAnimationFrame(() => document.getElementById('me-rewards-heading')?.focus({ preventScroll: true }));
  }, [settled, params]);

  if (!user) return null;

  const status = user.membership_status;
  const invoices = payments.data ? [...payments.data].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const myRewards = rewards.data;
  const next = myRewards && nextMilestone(myRewards);
  const rise = riseOrder();

  const signOut = () => {
    clearDraft(user.id);
    logout();
    navigate('home', undefined, { instant: true });
    showToast('You have signed out.', 'info');
  };

  const linkRows = (rows: Row[], label: string) => (
    <nav aria-label={label} className="app-rise app-glass rounded-[22px] px-4 py-1.5" style={rise()}>
      <ul>
        {rows.map(({ tab, params: query, label: name, icon: Icon }, i) => (
          <li key={name} className={i > 0 ? 'border-t border-[color:var(--app-bd)]' : ''}>
            <TabLink tab={tab} params={query} navigate={navigate} className="app-press min-h-[48px] py-2 flex items-center gap-3 text-[13px] font-bold">
              <Icon className="w-4 h-4 shrink-0 text-[color:var(--app-lime)]" aria-hidden="true" />
              <span className="flex-1">{name}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-[color:var(--app-mu)]" aria-hidden="true" />
            </TabLink>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="app-screen flex flex-col gap-4">
      <h1 className="font-heading font-black text-[26px]">Profile</h1>

      <button
        type="button"
        onClick={() => setIsIdCardOpen(true)}
        aria-label="Open my ID card"
        className="app-rise app-press rounded-3xl p-[18px] flex flex-col gap-3.5 text-left"
        style={{
          ...rise(),
          backgroundImage: 'linear-gradient(135deg, var(--gym-800), var(--app-card))',
          boxShadow: '8px 8px 18px var(--neu-shadow-dark), -8px -8px 18px var(--neu-shadow-light)',
          border: '1px solid rgba(255, 255, 255, 0.07)'
        }}
      >
        <span className="w-full flex items-center justify-between">
          <span className="font-heading font-black text-[15px] flex items-center gap-1 text-[color:var(--app-lime)]">
            <Zap className="w-4 h-4" aria-hidden="true" /> PulseFit
          </span>
          <span className="text-[9px] font-bold tracking-[0.1em] text-[color:var(--app-mu)]">MEMBER ID</span>
        </span>
        <span className="flex items-center gap-3.5 min-w-0">
          <img src={avatarOf(user)} alt="" width={64} height={64} decoding="async" className="w-16 h-16 rounded-2xl object-cover shrink-0 bg-gym-700" />
          <span className="min-w-0">
            <span className="block font-heading font-extrabold text-lg break-words">{user.name}</span>
            <span className="block text-[11px] text-[color:var(--app-mu)]">{cardNumber(user)}</span>
            <span className="block text-[11px] text-[color:var(--app-mu)]">
              {user.membership_expiry ? `${status === 'expired' ? 'Ended' : 'Valid through'} ${formatDate(user.membership_expiry, LONG_DATE)}` : 'No paid period yet'}
            </span>
          </span>
        </span>
      </button>

      <div className="app-rise app-glass rounded-[22px] p-4 flex items-center gap-3" style={rise()}>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-[#06b6d4]" aria-hidden="true" /> Freeze membership
          </p>
          <p className="text-[11px] leading-[1.4] mt-[3px] text-[color:var(--app-mu)]">
            {status === 'active'
              ? 'Pause your plan. When you unfreeze, the days the gym was open while you were frozen are added to your end date.'
              : status === 'frozen'
                ? `Frozen since ${formatDate(user.frozen_since ?? null, LONG_DATE)}. While frozen you cannot check in, book classes or clock in.`
                : 'Only an active membership can be frozen.'}
          </p>
        </div>
        <AppSwitch
          label="Freeze membership"
          onColor="#06b6d4"
          checked={status === 'frozen'}
          disabled={status !== 'active' && status !== 'frozen'}
          onChange={() => setFreeze(status === 'frozen' ? 'unfreeze' : 'freeze')}
        />
      </div>

      <h2 className={sectionTitle}>Plans</h2>
      {!plans.data && plans.error ? (
        <ErrorState message={plans.error} onRetry={plans.reload} />
      ) : !plans.data ? (
        <ShimmerList rows={3} label="Loading plans" className="app-rise" style={rise()} />
      ) : (
        <ul aria-label="Plans" className="app-rise flex flex-col gap-4" style={rise()}>
          {plans.data.map(p => {
            const isMine = p.tier === user.membership_tier;
            const isCurrent = isMine && (status === 'active' || status === 'frozen');
            const body = (
              <>
                <span className="flex-1 min-w-0">
                  <span className="block font-heading font-extrabold text-sm">{p.name}</span>
                  <span className="block text-[11px] mt-0.5 truncate text-[color:var(--app-mu)]">{p.description}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-heading font-black text-[17px] text-[color:var(--app-lime)]">{formatINR(p.price_monthly)}</span>
                  <span className="block text-[9px] font-bold text-[color:var(--app-mu)]">{isCurrent ? 'CURRENT' : isMine ? 'RENEW' : 'SWITCH'}</span>
                </span>
              </>
            );
            const row = 'app-press w-full rounded-[20px] px-4 py-3.5 flex items-center gap-3 text-left';
            return (
              <li key={p.id}>
                {isCurrent ? (
                  <div className={`app-glass ${row} border border-[rgba(132,204,22,0.5)]`}>{body}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('pricing', { plan: p.tier })}
                    aria-label={`${isMine ? 'Renew' : 'Switch to'} ${p.name}`}
                    className={`app-glass ${row}`}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className={sectionTitle}>Invoices</h2>
      {!payments.data && payments.error ? (
        <ErrorState message={payments.error} onRetry={payments.reload} />
      ) : !payments.data ? (
        <ShimmerList rows={3} label="Loading invoices" className="app-rise" style={rise()} />
      ) : invoices.length === 0 ? (
        <p className="app-rise app-glass rounded-[22px] p-4 text-center text-xs text-[color:var(--app-mu)]" style={rise()}>
          No invoices yet.
        </p>
      ) : (
        <div className="app-rise app-glass rounded-[22px] px-4 py-1.5" style={rise()}>
          <ul>
            {invoices.slice(0, ME_INVOICES).map((p, i) => (
              <li key={p.id} className={i > 0 ? 'border-t border-[color:var(--app-bd)]' : ''}>
                <button type="button" onClick={() => setInvoice(p)} aria-label={`Invoice ${p.invoice_number}`} className="app-press w-full py-3 flex items-center gap-3 text-left">
                  <FileText className="w-4 h-4 shrink-0 text-[color:var(--app-lime)]" aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold truncate">{p.invoice_number}</span>
                    <span className="block text-[10px] text-[color:var(--app-mu)]">{formatDay(p.created_at)}</span>
                  </span>
                  <span className="text-[13px] font-extrabold">{formatINR(p.amount_inr)}</span>
                  <Download className="w-3.5 h-3.5 shrink-0 text-[color:var(--app-mu)]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {invoices.length > ME_INVOICES && (
            <button
              type="button"
              onClick={() => navigate('profile', { tab: 'billing' })}
              className="w-full min-h-[44px] border-t border-[color:var(--app-bd)] text-[11px] font-bold text-[color:var(--app-lime)]"
            >
              All invoices
            </button>
          )}
        </div>
      )}

      <section id="me-rewards" aria-labelledby="me-rewards-heading" style={rise()} className="app-rise flex flex-col gap-3 scroll-mt-[calc(env(safe-area-inset-top)+8px)]">
        <h2 id="me-rewards-heading" tabIndex={-1} className={`${sectionTitle} outline-none`}>
          Rewards
        </h2>
        {!myRewards && rewards.error ? (
          <ErrorState message={rewards.error} onRetry={rewards.reload} />
        ) : !myRewards || !(store.data || store.error) ? (
          <ShimmerList rows={2} label="Loading rewards" />
        ) : (
          <div className="app-glass rounded-[22px] p-4 flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <Gift className="w-5 h-5 shrink-0 text-[color:var(--app-lime)]" aria-hidden="true" />
              <p className="flex-1 min-w-0">
                <span className="font-heading font-black text-2xl">
                  <CountUp value={myRewards.balance} format={n => n.toLocaleString('en-IN')} />
                </span>{' '}
                <span className="text-xs font-bold text-[color:var(--app-mu)]">points</span>
              </p>
            </div>
            {next && <p className="-mt-2 text-[11px] text-[color:var(--app-mu)]">{milestoneLine(next)}</p>}

            {openClaims(myRewards.claims).length > 0 && (
              <ul aria-label="My gifts" className="flex flex-col gap-2.5">
                {openClaims(myRewards.claims).map(c => (
                  <li key={c.id} className="app-inset rounded-2xl px-3.5 py-3 flex items-center gap-3">
                    <p className="flex-1 min-w-0 text-[13px] font-bold break-words">{c.gift_name}</p>
                    {c.status === 'needs_size' ? (
                      <button type="button" onClick={() => navigate('rewards')} className="app-lime-btn shrink-0 rounded-xl px-3.5 min-h-[44px] text-[11px] font-extrabold">
                        Choose a size
                      </button>
                    ) : c.status === 'ready' ? (
                      <p className="shrink-0 text-[11px] text-[color:var(--app-mu)]">
                        Pickup code <b className="font-mono text-[13px] text-[color:var(--app-lime)]">{c.pickup_code}</b>
                      </p>
                    ) : (
                      <p className="shrink-0 text-[11px] font-bold text-[color:var(--app-cyan-tx)]">Waiting for stock</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {store.data && cheapestGifts(store.data).length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] mb-2 text-[color:var(--app-mu)]">Gift store</h3>
                <ul className="grid grid-cols-3 gap-2.5">
                  {cheapestGifts(store.data).map(g => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => navigate('rewards')}
                        aria-label={`${g.name}, ${g.points_cost} points`}
                        className="app-press app-inset w-full h-full rounded-2xl p-2.5 flex flex-col items-center gap-1.5 text-center"
                      >
                        <GiftImage image={g.image} name={g.name} className="w-10 h-10 text-2xl" />
                        <span className="text-[11px] font-bold leading-tight break-words">{g.name}</span>
                        <span className="text-[10px] font-bold text-[color:var(--app-lime)]">{g.points_cost.toLocaleString('en-IN')} pts</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="app-inset rounded-2xl px-3.5 py-3 flex items-center gap-3">
              <p className="flex-1 min-w-0 text-[11px] text-[color:var(--app-mu)]">
                Your referral code <span className="block font-mono text-base font-black tracking-widest text-[color:var(--app-tx)]">{myRewards.referral_code}</span>
              </p>
              <button
                type="button"
                onClick={() => share(myRewards.referral_code)}
                className="app-lime-btn app-press shrink-0 rounded-xl px-3.5 min-h-[44px] inline-flex items-center gap-1.5 text-[11px] font-extrabold"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share
              </button>
            </div>

            <TabLink tab="rewards" navigate={navigate} className="min-h-[44px] inline-flex items-center justify-center gap-1 text-[11px] font-bold text-[color:var(--app-lime)]">
              Gift store, my gifts &amp; points history <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </TabLink>
          </div>
        )}
      </section>

      <h2 className={sectionTitle}>My account</h2>
      {linkRows(ACCOUNT, 'My account')}

      <h2 className={sectionTitle}>Explore</h2>
      {linkRows(EXPLORE, 'Explore')}

      <div className="app-rise app-glass rounded-[22px] p-4 flex items-center gap-3" style={rise()}>
        <p className="flex-1 text-[13px] font-bold">Dark mode</p>
        <AppSwitch label="Dark mode" onColor="#84cc16" checked={isDark} onChange={toggleTheme} />
      </div>

      <button
        type="button"
        onClick={signOut}
        style={rise()}
        className="app-rise app-press app-glass rounded-2xl min-h-[48px] flex items-center justify-center gap-2 text-[13px] font-bold text-[color:var(--app-red-tx)]"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" /> Sign out
      </button>

      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4">
        {LEGAL.map(l => (
          <TabLink key={l.tab} tab={l.tab} navigate={navigate} className="min-h-[44px] inline-flex items-center text-[11px] text-[color:var(--app-mu)]">
            {l.label}
          </TabLink>
        ))}
      </nav>

      <IdCardModal isOpen={isIdCardOpen} onClose={() => setIsIdCardOpen(false)} user={user} />
      <FreezeDialog action={freeze} onClose={() => setFreeze(null)} />
      <InvoiceModal payment={invoice} onClose={() => setInvoice(null)} />
    </div>
  );
};
