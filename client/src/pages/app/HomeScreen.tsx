import React, { useEffect, useState } from 'react';
import { ArrowRight, Calendar, CircleCheck, Flame, Gift, IdCard, LayoutGrid, MessageSquare, Plus, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api } from '../../api/client.js';
import { TrainerNoteCategory } from '../../types/index.js';
import { ErrorState } from '../../components/common/States.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { membershipNotice } from '../../components/member/membershipNotice.js';
import { useGiftCelebration } from '../../components/member/useGiftCelebration.js';
import { avatarOf } from '../../components/member/avatarImage.js';
import { milestoneLine, nextMilestone } from '../../components/app/rewards.js';
import { ServiceTiles } from '../../components/app/services.js';
import { CountUp, ShimmerList, StatusPill } from '../../components/app/ui.js';
import { formatDate, tierLabel } from '../../lib/format.js';
import { riseOrder } from '../../lib/appMotion.js';

const HOME_BOOKINGS = 3;
// As on the website dashboard.
const NOTE_LABELS: Record<TrainerNoteCategory, string> = { assessment: 'Assessment', progress: 'Progress', injury: 'Injury', general: 'General' };
const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/** Active days a week the streak card counts towards (a fixed goal). */
export const STREAK_GOAL = 5;

/**
 * The streak card's lines: this week's sessions against the goal, and how far the current streak is
 * from the longest. A line whose number the server did not send is null and left out.
 */
export function streakCopy(streak: number, active?: number, longest?: number): { sessions: string | null; beatBest: string | null; ringPercent: number } {
  const toBeat = longest === undefined || longest <= streak ? null : longest - streak + 1;
  return {
    sessions: active === undefined ? null : `${active} of ${STREAK_GOAL} sessions this week`,
    beatBest: toBeat === null ? null : `${toBeat} more day${toBeat === 1 ? '' : 's'} to beat your best.`,
    ringPercent: (Math.min(active ?? 0, STREAK_GOAL) / STREAK_GOAL) * 100
  };
}

const quickAction = 'app-press rounded-[18px] px-1 py-3.5 flex flex-col items-center gap-1.5 text-[11px]';
const points = (n: number) => n.toLocaleString('en-IN');
const rewardPill = 'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold';

/** The app's Home tab (handoff 1a → Home): who you are, your streak, quick actions, rewards, services, classes and coach notes. */
export const HomeScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { navigate } = useNavigation();
  const [showAllNotes, setShowAllNotes] = useState(false);
  // The streak numbers come from GET /auth/me, so fetch them fresh each time Home opens.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);
  const plans = useApiResource(() => api.getPlans());
  const bookings = useApiResource(() => api.getMyBookings('upcoming'));
  const notes = useApiResource(() => api.getMyNotes());
  const rewards = useApiResource(() => api.getMyRewards());

  useGiftCelebration(user?.id ?? '', rewards.data?.claims ?? null);

  if (!user) return null;

  const notice = membershipNotice(user);
  const streak = user.streak_days ?? 0;
  const active = user.active_days_this_week;
  const { sessions, beatBest, ringPercent } = streakCopy(streak, active, user.longest_streak_days);
  const visibleNotes = notes.data ? (showAllNotes ? notes.data : notes.data.slice(0, 1)) : [];
  const next = rewards.data && nextMilestone(rewards.data);
  const rise = riseOrder();

  return (
    <div className="app-screen flex flex-col gap-[18px]">
      <div className="app-rise flex items-center gap-3.5" style={rise()}>
        <img
          src={avatarOf(user)}
          alt=""
          width={56}
          height={56}
          decoding="async"
          className="w-14 h-14 rounded-2xl object-cover shrink-0 bg-gym-800 border-2 border-[rgba(132,204,22,0.5)]"
        />
        <div className="flex-1 min-w-0">
          <h1 className="font-heading font-black text-2xl leading-tight break-words">Hi, {user.name.split(' ')[0]}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-[3px]">
            <span className="text-xs font-bold text-[color:var(--app-tx3)]">{tierLabel(user.membership_tier, plans.data)}</span>
            <StatusPill status={user.membership_status} />
          </div>
          <p className="text-[11px] mt-0.5 text-[color:var(--app-mu)]">
            {user.membership_expiry ? (
              <>
                {user.membership_status === 'expired' ? 'Ended' : 'Valid through'}{' '}
                <b className="text-[color:var(--app-tx2)]">{formatDate(user.membership_expiry, LONG_DATE)}</b>
              </>
            ) : (
              'No paid period yet'
            )}
          </p>
        </div>
      </div>

      {notice && (
        <div role="status" className="app-rise app-inset rounded-2xl px-3.5 py-3 flex items-center gap-3" style={rise()}>
          <p className={`flex-1 text-xs leading-normal ${notice.tone === 'warn' ? 'text-[color:var(--app-amber-tx)]' : 'text-[color:var(--app-cyan-tx)]'}`}>{notice.text}</p>
          <button type="button" onClick={() => navigate(notice.tab, notice.params)} className="app-lime-btn app-press shrink-0 rounded-xl px-3.5 min-h-[44px] text-[11px] font-extrabold">
            {notice.action}
          </button>
        </div>
      )}

      <section aria-labelledby="home-streak-heading" className="app-rise app-glass rounded-3xl p-[18px] flex items-center gap-4" style={rise()}>
        <div
          role="progressbar"
          aria-label="Sessions this week"
          aria-valuemin={0}
          aria-valuemax={STREAK_GOAL}
          aria-valuenow={Math.min(active ?? 0, STREAK_GOAL)}
          className="app-ring w-[84px] h-[84px] shrink-0 rounded-full flex items-center justify-center"
          style={{ '--app-ring': `${ringPercent}%`, background: 'conic-gradient(#84cc16 0 var(--app-ring), var(--neu-inset-bg) var(--app-ring) 100%)' } as React.CSSProperties}
        >
          <div className="w-[66px] h-[66px] rounded-full bg-gym-950 flex flex-col items-center justify-center">
            <span className="font-heading font-black text-2xl leading-none">
              <CountUp value={streak} />
            </span>
            <span className="text-[9px] font-bold text-[color:var(--app-mu)] flex items-center gap-0.5">
              <Flame className="w-2.5 h-2.5 text-amber-accent" aria-hidden="true" /> DAYS
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {/* The ring's number is hidden inside the progressbar for screen readers, so the heading says it. */}
          <h2 id="home-streak-heading" className="font-heading font-extrabold text-[15px]">
            Day streak<span className="sr-only">: {streak} days</span>
          </h2>
          <p className="text-[11px] leading-[1.4] mt-[3px] text-[color:var(--app-mu)]">Sundays don't break it.{beatBest && ` ${beatBest}`}</p>
          {sessions && <p className="text-[11px] font-bold mt-1.5 text-[color:var(--app-lime)]">{sessions}</p>}
        </div>
      </section>

      <div className="app-rise grid grid-cols-3 gap-3" style={rise()}>
        <button type="button" onClick={() => navigate('pass')} className={`app-glass font-bold text-[color:var(--app-tx2)] ${quickAction}`}>
          <QrCode className="w-[18px] h-[18px]" aria-hidden="true" />
          Pass
        </button>
        <button type="button" onClick={() => navigate('profile')} className={`app-glass font-bold text-[color:var(--app-tx2)] ${quickAction}`}>
          <IdCard className="w-[18px] h-[18px]" aria-hidden="true" />
          ID card
        </button>
        <button type="button" onClick={() => navigate('workout-logger')} className={`app-lime-btn font-extrabold ${quickAction}`}>
          <Plus className="w-[18px] h-[18px]" aria-hidden="true" />
          Log workout
        </button>
      </div>

      {rewards.data ? (
        // Named by its text, so screen readers also hear the next milestone and a gift waiting at the desk.
        <button
          type="button"
          onClick={() => navigate('profile', { section: 'rewards' })}
          className="app-rise app-press app-glass rounded-3xl p-[18px] flex items-center gap-3.5 text-left"
          style={rise()}
        >
          <span className="w-[50px] h-[50px] shrink-0 rounded-[14px] flex items-center justify-center bg-[rgba(132,204,22,0.15)] text-[color:var(--app-lime)]">
            <Gift className="w-5 h-5" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-heading font-extrabold text-[15px]">Rewards</span>
            {next && <span className="block text-[11px] leading-[1.4] mt-[3px] text-[color:var(--app-mu)]">{milestoneLine(next)}</span>}
            {rewards.data.claims.some(c => c.status === 'ready') && <span className={`${rewardPill} mt-1.5 mr-1.5 bg-[rgba(132,204,22,0.15)] text-[color:var(--app-lime)]`}>Gift ready to collect</span>}
            {rewards.data.claims.some(c => c.status === 'needs_size') && (
              <span className={`${rewardPill} mt-1.5 bg-[rgba(245,158,11,0.15)] text-[color:var(--app-amber-tx)]`}>Choose a size</span>
            )}
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-heading font-black text-2xl leading-none">
              <CountUp value={rewards.data.balance} format={points} />
            </span>
            <span className="block text-[10px] font-bold mt-1 text-[color:var(--app-mu)]">points</span>
          </span>
        </button>
      ) : (
        !rewards.error && <ShimmerList rows={1} label="Loading rewards" className="app-rise" style={rise()} />
      )}

      <section aria-labelledby="home-services-heading" className="app-rise flex flex-col gap-3" style={rise()}>
        <h2 id="home-services-heading" className="font-heading font-extrabold text-base flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[color:var(--app-lime)]" aria-hidden="true" /> Services
        </h2>
        <ServiceTiles />
      </section>

      <section aria-labelledby="home-upcoming-heading" className="app-rise app-glass rounded-3xl p-[18px]" style={rise()}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 id="home-upcoming-heading" className="font-heading font-extrabold text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[color:var(--app-lime)]" aria-hidden="true" /> Upcoming classes
          </h2>
          <button
            type="button"
            onClick={() => navigate('schedule')}
            className="min-h-[44px] -my-3 -mr-1 px-1 inline-flex items-center gap-1 text-[11px] font-bold text-[color:var(--app-lime)]"
          >
            Timetable <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
        {!bookings.data && bookings.error ? (
          <ErrorState message={bookings.error} onRetry={bookings.reload} />
        ) : !bookings.data ? (
          <ShimmerList rows={2} label="Loading upcoming classes" />
        ) : bookings.data.length === 0 ? (
          <p className="text-center text-xs py-3.5 text-[color:var(--app-mu)]">No upcoming classes. Book a spot from the timetable.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {bookings.data.slice(0, HOME_BOOKINGS).map(b => (
                <li key={b.id} className="app-inset rounded-2xl px-3.5 py-3 flex items-center gap-3">
                  <div className="text-center min-w-[48px]">
                    <p className="font-heading font-extrabold text-sm">{b.start_time}</p>
                    <p className="text-[9px] font-bold uppercase text-[color:var(--app-mu)]">{formatDate(b.booking_date, { weekday: 'short', day: 'numeric' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate">{b.class_title}</p>
                    <p className="text-[11px] truncate text-[color:var(--app-mu)]">{b.trainer_name}</p>
                  </div>
                  <CircleCheck className="w-4 h-4 shrink-0 text-lime-accent" aria-hidden="true" />
                </li>
              ))}
            </ul>
            {bookings.data.length > HOME_BOOKINGS && (
              <button type="button" onClick={() => navigate('my-bookings')} className="mt-2.5 w-full min-h-[44px] text-[11px] font-bold text-[color:var(--app-lime)]">
                See all {bookings.data.length}
              </button>
            )}
          </>
        )}
      </section>

      {notes.data && notes.data.length > 0 && (
        <section aria-labelledby="home-note-heading" className="app-rise app-glass rounded-3xl p-[18px]" style={rise()}>
          <h2 id="home-note-heading" className="font-heading font-extrabold text-base flex items-center gap-2 mb-2.5">
            <MessageSquare className="w-4 h-4 text-[color:var(--app-lime)]" aria-hidden="true" /> Note from your coach
          </h2>
          <ul id="home-notes-list" className="flex flex-col gap-2.5">
            {visibleNotes.map(n => (
              <li key={n.id} className="app-inset rounded-2xl px-3.5 py-3">
                <p className="text-[11px] font-bold text-[color:var(--app-tx2)]">
                  {n.trainer_name} · <span className="text-[color:var(--app-mu)]">{NOTE_LABELS[n.category] ?? n.category}</span>
                </p>
                <p className="text-xs mt-1 leading-[1.45] whitespace-pre-line break-words text-[color:var(--app-tx3)]">{n.note}</p>
              </li>
            ))}
          </ul>
          {notes.data.length > 1 && (
            <button
              type="button"
              aria-expanded={showAllNotes}
              aria-controls="home-notes-list"
              onClick={() => setShowAllNotes(v => !v)}
              className="mt-2.5 w-full min-h-[44px] text-[11px] font-bold text-[color:var(--app-lime)]"
            >
              {showAllNotes ? 'Show fewer notes' : `Show all ${notes.data.length} notes`}
            </button>
          )}
        </section>
      )}
    </div>
  );
};
