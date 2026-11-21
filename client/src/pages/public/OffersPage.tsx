import React from 'react';
import { BadgePercent, CalendarCheck, Flame, Gift, ShoppingBag, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api } from '../../api/client.js';
import { useApiData } from '../../components/public/useApiData.js';
import { CardSkeletons } from '../../components/public/CardSkeletons.js';
import { TabLink } from '../../components/public/TabLink.js';
import { EmptyState, ErrorState } from '../../components/common/States.js';
import { GiftImage } from '../../components/common/GiftImage.js';
import { endsIn, formatINR, tierLabel } from '../../lib/format.js';
import type { Promotions, StoreGift } from '../../types/index.js';
import { PageScene } from '../../components/app/PageScene.js';

const SECTION = 'neu-flat rounded-3xl p-5 sm:p-6 space-y-4';
const HEADING = 'text-lg font-black text-slate-100 font-heading flex items-center gap-2';
const ICON = 'w-5 h-5 text-lime-400';
const points = (n: number) => `${n.toLocaleString('en-IN')} point${n === 1 ? '' : 's'}`;

const discount = (sale: Promotions['sales'][number]) =>
  sale.percent_off != null ? `${sale.percent_off}% off` : sale.amount_off != null ? `${formatINR(sale.amount_off)} off` : null;

/** A member's balance, what earns points and their milestones, all from their own GET /rewards/me. */
const MemberPoints: React.FC = () => {
  const { navigate } = useNavigation();
  const rewards = useApiData(() => api.getMyRewards());
  if (rewards.error) return <ErrorState message={rewards.error} onRetry={rewards.reload} />;
  if (!rewards.data) return <CardSkeletons label="Loading your points…" count={1} className="" cardClassName="h-40 rounded-2xl" />;
  const { balance, earning, milestones } = rewards.data;
  return (
    <>
      <div className="neu-pressed-sm rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Your points <span className="block text-3xl font-black text-lime-400 font-heading normal-case tracking-normal">{balance.toLocaleString('en-IN')}</span>
        </p>
        <TabLink tab="rewards" navigate={navigate} className="neu-btn px-4 py-2.5 rounded-xl text-xs font-extrabold text-slate-200">
          Open Rewards
        </TabLink>
      </div>
      <p className="text-sm text-slate-300">
        Earn {points(earning.checkin)} for each check-in at the front desk and {points(earning.workout)} for a workout logged on the day you train. When a friend
        signs up with your code and buys a plan, you get {points(earning.referral)}
        {earning.referral_welcome > 0 && ` and they get ${points(earning.referral_welcome)}`}.
      </p>
      {milestones.length > 0 && (
        <ul className="space-y-2">
          {milestones.map(m => (
            <li key={m.id} className="flex items-center gap-3 text-sm text-slate-300">
              {m.type === 'visits' ? <CalendarCheck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" /> : <Flame className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />}
              <span>
                {m.threshold.toLocaleString('en-IN')} {m.type === 'visits' ? 'visits' : 'days in a row'}: <strong className="text-slate-100">{m.gift_name}</strong>
                {m.reached && <span className="text-lime-400 font-bold"> · reached</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

/** The gift store (GET /rewards/gifts needs a sign-in). Members claim on Rewards; this page only shows it. */
const GiftStore: React.FC<{ member: boolean; admin: boolean }> = ({ member, admin }) => {
  const { navigate } = useNavigation();
  // Admins get the whole catalogue from the same address: show it as members see the store, as the
  // server's getGifts, toStoreGift and hasStock do (server/src/controllers/rewardsController.ts, lib/gifts.ts).
  const store = useApiData<StoreGift[]>(() =>
    admin
      ? api.getGiftCatalogue().then(all =>
          all
            .filter(g => g.active && g.points_cost !== null)
            .map(g => ({
              ...g,
              points_cost: g.points_cost!,
              in_stock: g.sizes ? g.sizes.some(s => (g.stock_by_size?.[s] ?? 0) > 0) : g.stock === null || g.stock > 0
            }))
            .sort((a, b) => a.points_cost - b.points_cost)
        )
      : api.getStoreGifts()
  );
  return (
    <section aria-labelledby="offers-store" className={SECTION}>
      <h2 id="offers-store" className={HEADING}>
        <ShoppingBag className={ICON} aria-hidden="true" /> Gift store
      </h2>
      <p className="text-sm text-slate-400">
        {member ? (
          <>
            Claim a gift on{' '}
            <TabLink tab="rewards" navigate={navigate} className="text-lime-400 underline">
              Rewards
            </TabLink>{' '}
            and collect it at the front desk with its pickup code.
          </>
        ) : (
          'Members spend their points on these gifts and collect them at the front desk.'
        )}
      </p>
      {store.error ? (
        <ErrorState message={store.error} onRetry={store.reload} />
      ) : !store.data ? (
        <CardSkeletons label="Loading the store…" count={4} className="grid grid-cols-1 sm:grid-cols-2 gap-3" cardClassName="h-20 rounded-2xl" />
      ) : store.data.length === 0 ? (
        <EmptyState title="The store is empty right now" body="The gym has not put any gifts in the store yet." />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {store.data.map(g => (
            <li key={g.id} className="neu-pressed-sm rounded-2xl p-4 flex items-start gap-3 min-w-0">
              <GiftImage image={g.image} name={g.name} className={`w-10 h-10 text-2xl ${!g.in_stock ? 'opacity-50' : ''}`} />
              <div className="min-w-0">
                <p className="font-extrabold text-slate-100 font-heading break-words">{g.name}</p>
                <p className="text-xs font-black text-lime-400">
                  {points(g.points_cost)}
                  {!g.in_stock && <span className="text-slate-400 font-bold"> · Out of stock</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * The app's Offers & gifts page, for everyone (the website has none): the sales running now and the
 * joining gift each plan comes with (GET /promotions), how points and milestone gifts work, and for a
 * signed-in account the gift store; members also see their points.
 */
export const OffersPage: React.FC<{ onOpenAuthModal: (mode: 'login' | 'register') => void }> = ({ onOpenAuthModal }) => {
  const { user, isInitializing } = useAuth();
  const { navigate } = useNavigation();
  const promotions = useApiData(() => api.getPromotions());

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14 space-y-5">
      <header className="space-y-3">
        <div className="w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <Gift className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-100 font-heading">Offers & gifts</h1>
        <p className="text-sm text-slate-400">Sales on the plans, the gifts that come with them, and gifts to earn with your visits.</p>
      </header>

      {promotions.error ? (
        <ErrorState message={promotions.error} onRetry={promotions.reload} />
      ) : !promotions.data ? (
        <CardSkeletons label="Loading the offers…" count={2} className="space-y-5" cardClassName="h-40 rounded-3xl" />
      ) : (
        <>
          <section aria-labelledby="offers-sales" className={SECTION}>
            <h2 id="offers-sales" className={HEADING}>
              <BadgePercent className={ICON} aria-hidden="true" /> Sales on now
            </h2>
            {promotions.data.sales.length === 0 ? (
              <EmptyState title="No sales right now" body="Every plan is at its usual price." />
            ) : (
              <ul className="space-y-3">
                {promotions.data.sales.map(sale => (
                  <li key={`${sale.title}-${sale.ends_at}`} className="neu-pressed-sm rounded-2xl p-4 space-y-1">
                    <p className="font-extrabold text-slate-100 font-heading">{sale.title}</p>
                    {sale.banner_text && <p className="text-sm text-slate-300">{sale.banner_text}</p>}
                    <p className="text-xs font-bold text-amber-400">{[discount(sale), endsIn(sale.ends_at)].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            )}
            <TabLink tab="pricing" navigate={navigate} className="neu-btn-lime w-full py-3 rounded-xl text-sm font-black flex items-center justify-center">
              See memberships
            </TabLink>
          </section>

          <section aria-labelledby="offers-joining" className={SECTION}>
            <h2 id="offers-joining" className={HEADING}>
              <Gift className={ICON} aria-hidden="true" /> Joining gifts
            </h2>
            {/* Not over an empty card: its empty state has a scene of its own. */}
            {promotions.data.joining_gifts.length > 0 && <PageScene tab="offers" placement="in-card" />}
            {promotions.data.joining_gifts.length === 0 ? (
              <EmptyState title="No joining gifts right now" body="Plans come without a welcome gift at the moment." />
            ) : (
              <ul className="space-y-3">
                {promotions.data.joining_gifts.map(j => (
                  <li key={`${j.tier}-${j.billing_cycle}`} className="neu-pressed-sm rounded-2xl p-4 space-y-1">
                    <p className="font-extrabold text-slate-100 font-heading">
                      {tierLabel(j.tier)} · {j.billing_cycle === 'annual' ? 'Annual' : 'Monthly'}
                    </p>
                    <p className="text-sm text-slate-300">{j.gifts.join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="offers-points" className={SECTION}>
        <h2 id="offers-points" className={HEADING}>
          <Sparkles className={ICON} aria-hidden="true" /> Points and milestone gifts
        </h2>
        {user?.role === 'member' ? (
          <MemberPoints />
        ) : (
          <p className="text-sm text-slate-300">
            Members earn points for check-ins at the front desk, workouts logged on the day they train and friends they refer who buy a plan, and spend them on
            gifts in the store. Reaching a number of visits, or days in a row at the gym, unlocks a gift too.
          </p>
        )}
      </section>

      {isInitializing ? null : user ? (
        <GiftStore member={user.role === 'member'} admin={user.role === 'admin'} />
      ) : (
        <section aria-label="Sign up" className="neu-flat rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm font-bold text-slate-200">Sign up to collect points and gifts</p>
          <button type="button" onClick={() => onOpenAuthModal('register')} className="neu-btn-lime px-5 py-2.5 rounded-xl text-sm font-black">
            Sign up
          </button>
        </section>
      )}
    </article>
  );
};
