import React, { useEffect, useState } from 'react';
import { ArrowRight, Calendar, CheckCircle2, ChevronRight, Clock, Dumbbell, MapPin, Music2, QrCode, Sparkles, Star, Users, Zap } from 'lucide-react';
import { ActiveFloorStatus } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiData } from '../../components/public/useApiData.js';
import { cheapestPlan, cheapestPlanFor } from '../../components/public/plans.js';
import { HOURS_DAYS, HOURS_TIME, isGymOpenNow, mondayOf } from '../../components/public/gymInfo.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { formatClock, formatDate, formatINR, formatTime, gymToday } from '../../lib/format.js';

interface LandingPageProps {
  setCurrentTab: (tab: string) => void;
  onOpenFreeTrialModal: () => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

const FLOOR_POLL_MS = 30_000;

/** Floor counts, refreshed only while this tab is visible. */
function useFloorStatus() {
  const [status, setStatus] = useState<ActiveFloorStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const next = await api.getActiveFloorStatus();
        if (cancelled) return;
        setStatus(next);
        setUpdatedAt(new Date().toISOString());
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    const start = () => {
      if (timer !== undefined) return;
      load();
      timer = window.setInterval(load, FLOOR_POLL_MS);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { status, updatedAt, failed };
}

const photoChip = 'px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-bold';

export const LandingPage: React.FC<LandingPageProps> = ({ setCurrentTab, onOpenFreeTrialModal, onOpenAuthModal }) => {
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const classes = useApiData(() => api.getClasses());
  const trainers = useApiData(() => api.getTrainers());
  const plans = useApiData(() => api.getPlans());
  const floor = useFloorStatus();
  const isOpen = isGymOpenNow();

  const fromPlan = plans.data ? cheapestPlan(plans.data) : undefined;
  const strengthPlan = plans.data ? cheapestPlanFor(plans.data, 'Workout & Strength') : undefined;
  const zumbaPlan = plans.data ? cheapestPlanFor(plans.data, 'Zumba & Cardio') : undefined;
  const now = Date.now();
  const upcoming = (classes.data ?? []).filter(c => new Date(c.starts_at).getTime() > now).slice(0, 4);
  const today = gymToday();

  const openTimeTracker = () => (user ? navigate('member-dashboard') : onOpenAuthModal('login'));
  const join = () => (user ? navigate('pricing') : onOpenAuthModal('register'));

  return (
    <div className="space-y-16 sm:space-y-24 pb-20 overflow-hidden">
      {/* Hero */}
      <section className="relative pt-6 sm:pt-10 lg:pt-16 pb-4">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] h-[200px] sm:h-[300px] bg-lime-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-7 space-y-5 sm:space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full neu-pressed-sm border border-lime-500/30 text-lime-400 text-xs font-semibold">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                SECTOR 29 · NEAR CYBER HUB, GURUGRAM
              </div>

              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-100 tracking-tight leading-[1.1] font-['Outfit']">
                YOUR GYM FOR <span className="text-lime-400">STRENGTH & ZUMBA</span>.
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                A Workout & Strength floor and a Zumba & Cardio studio under one roof, with coach-led classes you book in the app
                {fromPlan ? `, from ${formatINR(fromPlan.price_monthly)} a month` : ''}.
              </p>

              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto lg:mx-0 pt-1">
                <div className="p-3 rounded-xl neu-flat text-left flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-lime-500/20 text-lime-400 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-xs font-extrabold text-slate-100">Strength training</span>
                    <span className="block text-[10px] text-slate-400">Weights & coached lifting</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl neu-flat text-left flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
                    <Music2 className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-xs font-extrabold text-slate-100">Zumba & Cardio</span>
                    <span className="block text-[10px] text-slate-400">Dance & cardio classes</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                <button
                  type="button"
                  onClick={onOpenFreeTrialModal}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 neu-btn-lime font-extrabold text-sm rounded-xl flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Claim a free 1-day pass
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('schedule')}
                  className="w-full sm:w-auto px-5 sm:px-7 py-3.5 neu-btn text-slate-100 font-extrabold text-sm rounded-xl flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4 text-lime-400" aria-hidden="true" />
                  View the timetable
                </button>
              </div>

              <dl className="pt-6 sm:pt-8 border-t border-slate-800/80 grid grid-cols-3 gap-3 sm:gap-6 max-w-lg mx-auto lg:mx-0 text-center sm:text-left">
                <div>
                  <dt className="text-[11px] text-slate-400 font-medium">Plans from</dt>
                  <dd className="text-lg sm:text-2xl font-black text-lime-400 font-['Outfit']">
                    {fromPlan ? (
                      <>
                        {formatINR(fromPlan.price_monthly)}
                        <span className="text-xs font-normal text-slate-400">/mo</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400 font-medium">Open {HOURS_DAYS}</dt>
                  <dd className="text-lg sm:text-2xl font-black text-slate-100 font-['Outfit']">6am–10pm</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400 font-medium">Classes a week</dt>
                  <dd className="text-lg sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-['Outfit']">{classes.data ? classes.data.length : '—'}</dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-5 relative mt-4 lg:mt-0">
              <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-black">
                <img
                  src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80"
                  alt="Barbells and racks on a strength training floor"
                  className="w-full h-[300px] sm:h-[420px] object-cover object-center opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute top-4 left-4 px-3 py-2 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-lime-300" aria-hidden="true" />
                  <div>
                    <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">{isOpen ? 'Open now' : 'Closed now'}</div>
                    <div className="text-xs font-extrabold text-zinc-50">
                      {HOURS_DAYS}, {HOURS_TIME}
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-4 right-4 left-4 px-3 py-3 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <QrCode className="w-5 h-5 text-lime-300 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-50 truncate">QR entry pass</div>
                      <div className="text-[10px] text-zinc-400 truncate">Every member gets one in the app</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => navigate('pricing')} className="px-3 py-1.5 neu-btn-lime text-xs font-bold rounded-xl shrink-0">
                    See plans
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Floor right now: counts only */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-labelledby="floor-heading">
        <div className="neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-1">
              <Badge variant="lime">ON THE FLOOR NOW</Badge>
              <h2 id="floor-heading" className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit'] mt-1">
                HOW BUSY IS THE GYM?
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">Members who have clocked in on each floor. Counts only; we never show who is training.</p>
            </div>
            <div className="p-3 px-4 rounded-2xl neu-pressed-sm text-left sm:text-right shrink-0" aria-live="polite">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Training now</div>
              <div className="text-xl font-black text-lime-400 font-mono">{floor.status ? floor.status.totalActive : '—'}</div>
              {floor.updatedAt && <div className="text-[10px] text-slate-500">Updated {formatTime(floor.updatedAt)}</div>}
            </div>
          </div>

          {floor.failed && !floor.status ? (
            <p className="text-xs text-slate-400 p-4 rounded-xl neu-pressed-sm" role="status">
              The live count isn't available right now.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Workout & Strength floor', detail: 'Free weights, racks & barbells', icon: Dumbbell, count: floor.status?.workoutActive, tone: 'text-lime-400 bg-lime-500/20' },
                { label: 'Zumba & Cardio studio', detail: 'Dance & cardio classes', icon: Music2, count: floor.status?.zumbaActive, tone: 'text-pink-400 bg-pink-500/20' }
              ].map(zone => (
                <div key={zone.label} className="p-5 rounded-2xl neu-pressed-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${zone.tone}`}>
                      <zone.icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-slate-100">{zone.label}</h3>
                      <p className="text-[11px] text-slate-400">{zone.detail}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-black text-slate-100 font-mono">{zone.count ?? '—'}</div>
                    <div className="text-[10px] text-slate-400">{zone.count === 1 ? 'person' : 'people'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 rounded-2xl neu-pressed-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <p className="flex items-center gap-2.5 text-slate-300">
              <Clock className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" />
              <span>
                <strong>{isOpen ? 'Open now.' : 'Closed now.'}</strong> {HOURS_DAYS}: {HOURS_TIME} · <span className="text-amber-600 dark:text-amber-400 font-bold">Sunday closed</span>
              </span>
            </p>
            {(!user || user.role === 'member') && (
              <button type="button" onClick={openTimeTracker} className="px-4 py-2 neu-btn-lime font-extrabold rounded-xl shrink-0">
                {user ? 'Open My Time Tracker' : 'Sign in to clock in'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Two disciplines */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-10 sm:mb-12">
          <Badge variant="lime">WHAT WE OFFER</Badge>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight font-['Outfit']">TWO DEDICATED SPACES</h2>
          <p className="text-slate-400 text-sm">Build strength, improve your fitness, or do both.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {[
            {
              title: 'Workout & Strength Training',
              eyebrow: 'MUSCLE & STRENGTH',
              image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&auto=format&fit=crop&q=80',
              text: 'Free weights, barbells and racks, plus coach-led strength classes. Learn the big lifts with good form and log every session in the app.',
              points: ['Barbells, racks & dumbbells', 'Workout logger with volume and estimated 1RM', 'Coach-led strength classes'],
              plan: strengthPlan,
              tab: 'workout',
              cta: 'Explore the strength floor',
              accent: 'text-lime-300'
            },
            {
              title: 'Zumba & Cardio Sessions',
              eyebrow: 'DANCE CARDIO',
              image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&auto=format&fit=crop&q=80',
              text: 'High-energy dance cardio to Latin and Bollywood mixes in a separate studio. No dance experience needed.',
              points: ['Coach-led group classes', 'A dedicated dance studio', 'Interval-style cardio workouts'],
              plan: zumbaPlan,
              tab: 'zumba',
              cta: 'Explore the Zumba studio',
              accent: 'text-pink-300'
            }
          ].map(offer => (
            <article key={offer.tab} className="neu-flat rounded-3xl overflow-hidden border border-slate-800 flex flex-col justify-between">
              <div className="relative h-56 sm:h-64 overflow-hidden bg-black">
                <img src={offer.image} alt="" loading="lazy" className="w-full h-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className={`text-xs font-bold ${offer.accent}`}>{offer.eyebrow}</div>
                  <h3 className="text-xl sm:text-2xl font-black text-zinc-50 mt-0.5">{offer.title}</h3>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">{offer.text}</p>
                <ul className="space-y-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
                  {offer.points.map(point => (
                    <li key={point} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-400">
                    {offer.plan ? (
                      <>
                        {offer.plan.name} from <strong className="text-slate-100 text-base">{formatINR(offer.plan.price_monthly)}/mo</strong>
                      </>
                    ) : plans.isLoading ? (
                      'Loading prices…'
                    ) : null}
                  </span>
                  <button type="button" onClick={() => setCurrentTab(offer.tab)} className="px-4 py-2 neu-btn text-slate-100 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5">
                    {offer.cta} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Guide banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="neu-flat p-6 sm:p-10 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <Badge variant="cyan">FREE GUIDES</Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">WORKOUT SPLITS, INDIAN DIET CHARTS & SUPPLEMENTS</h2>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Muscle-gain, fat-loss and vegetarian high-protein meal plans built on Indian staples, plus 4- and 5-day training splits and a plain-language supplements guide.
            </p>
          </div>
          <button type="button" onClick={() => setCurrentTab('guide')} className="px-6 py-3.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2 shrink-0">
            <Zap className="w-4 h-4" aria-hidden="true" /> Read the guides <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Coming up next */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-labelledby="upcoming-heading">
        <div className="neu-flat p-5 sm:p-8 lg:p-10 rounded-3xl border border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
            <div className="space-y-1">
              <Badge variant="cyan">COMING UP</Badge>
              <h2 id="upcoming-heading" className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">
                NEXT CLASSES
              </h2>
              <p className="text-sm text-slate-400">Spots left are counted for each date.</p>
            </div>
            <button type="button" onClick={() => setCurrentTab('schedule')} className="text-xs font-bold text-lime-400 hover:underline flex items-center gap-1 shrink-0">
              Full timetable <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {classes.isLoading ? (
            <LoadingState label="Loading classes…" />
          ) : classes.error ? (
            <ErrorState message={classes.error} onRetry={classes.reload} />
          ) : upcoming.length === 0 ? (
            <EmptyState title="No upcoming classes" body="Check the timetable for next week's sessions." />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {upcoming.map(c => (
                <li key={`${c.id}:${c.occurrence_date}`} className="p-4 rounded-2xl neu-pressed-sm flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-extrabold text-lime-400">
                        {c.occurrence_date === today ? 'Today' : formatDate(c.occurrence_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatClock(c.start_time)}
                      </span>
                      <Badge variant={c.category === 'Zumba & Cardio' ? 'purple' : 'lime'} size="sm">
                        {c.category === 'Zumba & Cardio' ? 'Zumba' : 'Strength'}
                      </Badge>
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-100">{c.title}</h3>
                    <p className="text-[11px] text-slate-400">
                      {c.trainer_name ?? 'Coach to be confirmed'} · {c.duration_minutes} min · {c.room}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-bold ${c.is_full ? 'text-rose-400' : c.spots_left <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300'}`}>
                      {c.is_full ? 'Class full' : `${c.spots_left} of ${c.capacity} spots left`}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate('schedule', { week: mondayOf(c.occurrence_date), day: String(c.day_of_week) })}
                      className="text-xs font-bold text-lime-400 hover:underline flex items-center gap-0.5"
                    >
                      {c.is_full ? 'View' : 'Book'}
                      <span className="sr-only"> {c.title}</span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Coaches */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-labelledby="coaches-heading">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8 sm:mb-10">
          <div className="space-y-1">
            <Badge variant="cyan">COACHES</Badge>
            <h2 id="coaches-heading" className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">
              MEET THE TEAM
            </h2>
          </div>
          <button type="button" onClick={() => setCurrentTab('trainers')} className="text-xs font-bold text-lime-400 hover:underline flex items-center gap-1 shrink-0">
            All coaches <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {trainers.isLoading ? (
          <LoadingState label="Loading coaches…" />
        ) : trainers.error ? (
          <ErrorState message={trainers.error} onRetry={trainers.reload} />
        ) : !trainers.data || trainers.data.length === 0 ? (
          <EmptyState title="No coaches listed yet" />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {trainers.data.slice(0, 4).map(trainer => (
              <li key={trainer.id} className="neu-flat rounded-2xl overflow-hidden border border-slate-800">
                <div className="relative h-56 sm:h-60 overflow-hidden bg-black">
                  {trainer.avatar_url && <img src={trainer.avatar_url} alt={`Portrait of ${trainer.name}`} loading="lazy" className="w-full h-full object-cover object-top" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                    <span className={`${photoChip} text-zinc-100`}>
                      {trainer.experience_years} {trainer.experience_years === 1 ? 'year' : 'years'} coaching
                    </span>
                    {trainer.reviews_count > 0 && (
                      <span className={`${photoChip} text-amber-300 flex items-center gap-1`}>
                        <Star className="w-3 h-3 fill-current" aria-hidden="true" /> {trainer.rating}
                        <span className="sr-only"> out of 5 from {trainer.reviews_count} reviews</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="text-base font-black text-slate-100">{trainer.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{trainer.bio}</p>
                  <ul className="flex flex-wrap gap-1 pt-1">
                    {trainer.specialties.slice(0, 2).map(spec => (
                      <li key={spec} className="text-[10px] font-semibold neu-pressed-sm text-slate-300 px-2 py-0.5 rounded-md">
                        {spec}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Plans */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-labelledby="plans-heading">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-10 sm:mb-12">
          <Badge variant="lime">MEMBERSHIPS</Badge>
          <h2 id="plans-heading" className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight font-['Outfit']">
            CLEAR, SIMPLE PRICING
          </h2>
          <p className="text-slate-400 text-sm">No sign-up fee and no automatic renewals. Entry with your QR pass during opening hours.</p>
        </div>

        {plans.isLoading ? (
          <LoadingState label="Loading plans…" />
        ) : plans.error ? (
          <ErrorState message={plans.error} onRetry={plans.reload} />
        ) : !plans.data || plans.data.length === 0 ? (
          <EmptyState title="No plans are on sale right now" body="Please ask at the front desk." />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plans.data.map(plan => (
              <li
                key={plan.id}
                className={`neu-flat p-6 sm:p-7 rounded-3xl flex flex-col justify-between relative ${plan.is_popular ? 'border-2 border-lime-500/70 shadow-glow-lime' : 'border border-slate-800'}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 neu-btn-lime text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-100 font-['Outfit']">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-100 font-['Outfit']">{formatINR(plan.price_monthly)}</span>
                    <span className="text-slate-400 text-xs">/ month</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{plan.description}</p>
                  <ul className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                    {plan.features.slice(0, 4).map(feature => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" /> {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('pricing', { plan: plan.tier })}
                  className={`w-full mt-6 py-3 font-bold rounded-xl text-xs ${plan.is_popular ? 'neu-btn-lime' : 'neu-btn text-slate-200'}`}
                >
                  See the {plan.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bottom CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="neu-flat rounded-3xl border border-lime-500/40 p-6 sm:p-10 lg:p-12 text-center lg:text-left flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <Badge variant="lime">FREE TRIAL</Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">TRY A STRENGTH OR ZUMBA SESSION FREE</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Claim a free 1-day pass for any day in the next two weeks, Monday to Saturday. One pass per person.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
            <button type="button" onClick={onOpenFreeTrialModal} className="w-full sm:w-auto px-6 py-3.5 neu-btn-lime font-black text-sm rounded-xl flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" aria-hidden="true" /> Claim a free pass
            </button>
            <button type="button" onClick={join} className="w-full sm:w-auto px-5 py-3.5 neu-btn text-slate-100 font-bold text-sm rounded-xl flex items-center justify-center gap-2">
              <Users className="w-4 h-4" aria-hidden="true" />
              {user ? 'See memberships' : fromPlan ? `Join from ${formatINR(fromPlan.price_monthly)}/mo` : 'Create an account'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
