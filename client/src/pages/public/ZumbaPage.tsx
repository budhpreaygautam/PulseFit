import React from 'react';
import { ArrowRight, Heart, Smile, Sparkles, Zap } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { StatTile } from '../../components/public/StatTile.js';
import { WeeklyClasses } from '../../components/public/WeeklyClasses.js';
import { useApiData } from '../../components/public/useApiData.js';
import { cheapestPlanFor } from '../../components/public/plans.js';
import { HOURS_DAYS, HOURS_TIME } from '../../components/public/gymInfo.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api } from '../../api/client.js';
import { formatINR } from '../../lib/format.js';

interface ZumbaPageProps {
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

const CATEGORY = 'Zumba & Cardio';

const MOMENTS = [
  {
    url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&auto=format&fit=crop&q=80',
    title: 'Dance cardio',
    desc: 'Group choreography to fast, upbeat tracks. Follow along at your own pace.'
  },
  {
    url: 'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=1200&auto=format&fit=crop&q=80',
    title: 'Bollywood & Latin mixes',
    desc: 'Bollywood, salsa, reggaeton and merengue steps blended into one workout.'
  },
  {
    url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&auto=format&fit=crop&q=80',
    title: 'A dedicated studio',
    desc: 'A separate dance studio with its own sound system, away from the weights floor.'
  },
  {
    url: 'https://images.unsplash.com/photo-1508215885820-4585e56135c8?w=1200&auto=format&fit=crop&q=80',
    title: 'Coach-led sessions',
    desc: 'Every Zumba & Cardio class on the timetable is led by one of our coaches.'
  },
  {
    url: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=1200&auto=format&fit=crop&q=80',
    title: 'Interval intensity',
    desc: 'Tracks alternate between high-energy bursts and easier recovery songs.'
  },
  {
    url: 'https://images.unsplash.com/photo-1549576490-b0b4831ef60a?w=1200&auto=format&fit=crop&q=80',
    title: 'Beginners welcome',
    desc: 'No dance experience needed. Most people pick up the steps within a few classes.'
  }
];

const BENEFITS = [
  { icon: Heart, title: 'Heart & lungs', desc: 'Sustained dance intervals build cardiovascular fitness without the monotony of a treadmill.' },
  { icon: Smile, title: 'Mood & stress', desc: 'Music, movement and a group setting make exercise something many people look forward to.' },
  { icon: Zap, title: 'Coordination & core', desc: 'Footwork, turns and arm patterns work your balance, coordination and core stability.' }
];

export const ZumbaPage: React.FC<ZumbaPageProps> = ({ onOpenFreeTrialModal }) => {
  const { navigate } = useNavigation();
  const classes = useApiData(() => api.getClasses({ category: CATEGORY }));
  const plans = useApiData(() => api.getPlans());

  const plan = plans.data ? cheapestPlanFor(plans.data, CATEGORY) : undefined;
  const coaches = classes.data ? new Set(classes.data.map(c => c.trainer_id)).size : null;
  const burns = (classes.data ?? []).map(c => c.calories_burn_est).filter(n => n > 0);
  const burnLabel = burns.length ? (Math.min(...burns) === Math.max(...burns) ? `~${burns[0]}` : `${Math.min(...burns)}–${Math.max(...burns)}`) : null;

  return (
    <div className="space-y-16 pb-20">
      <section className="relative min-h-[460px] sm:min-h-[540px] flex items-center justify-center overflow-hidden bg-black">
        <img
          src="https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1600&auto=format&fit=crop&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" />
        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-gym-950 to-transparent" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6 py-16">
          <span className="inline-block px-3 py-1 rounded-full bg-black/60 border border-pink-400/40 text-pink-300 text-xs font-bold tracking-wide">
            ZUMBA & CARDIO STUDIO
          </span>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-zinc-50 tracking-tight font-['Outfit'] uppercase leading-none">
            DANCE. SWEAT. <span className="text-pink-300">FEEL THE BEAT.</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed font-medium">
            High-energy dance cardio in our own studio in Sector 29, Gurugram. Book a class in the app and just show up.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('pricing', plan ? { plan: plan.tier } : undefined)}
              className="w-full sm:w-auto px-8 py-4 neu-btn-pink text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2"
            >
              {plan ? `${plan.name} from ${formatINR(plan.price_monthly)}/month` : 'See membership plans'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenFreeTrialModal}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-zinc-50 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-pink-300" aria-hidden="true" />
              Claim a free 1-day pass
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Zumba studio at a glance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile value={classes.data ? String(classes.data.length) : null} isLoading={classes.isLoading} label="Zumba & Cardio classes a week" />
          <StatTile value={coaches !== null ? String(coaches) : null} isLoading={classes.isLoading} label={coaches === 1 ? 'Dance coach' : 'Dance coaches'} />
          <StatTile value={burnLabel ? `${burnLabel} kcal` : null} isLoading={classes.isLoading} label="Estimated burn per class" />
          <StatTile value={HOURS_DAYS} label={HOURS_TIME} />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <Badge variant="purple">CLASSES</Badge>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-100 font-['Outfit'] mt-2">ZUMBA & CARDIO EVERY WEEK</h2>
            <p className="text-sm text-slate-400 mt-1">Spots shown are for each class's next session.</p>
          </div>
          <button type="button" onClick={() => navigate('schedule', { category: CATEGORY })} className="text-xs font-bold text-lime-400 hover:underline flex items-center gap-1 shrink-0">
            Full timetable <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <WeeklyClasses
          classes={classes.data}
          isLoading={classes.isLoading}
          error={classes.error}
          onRetry={classes.reload}
          onOpen={(week, day) => navigate('schedule', { week, day: String(day) })}
          emptyTitle="No Zumba & Cardio classes are on the timetable right now"
        />
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="purple">THE STUDIO</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-100 font-['Outfit']">WHAT A CLASS IS LIKE</h2>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOMENTS.map(moment => (
            <li key={moment.title} className="neu-flat overflow-hidden rounded-3xl border border-slate-800/80">
              <div className="h-52 overflow-hidden bg-slate-900">
                <img src={moment.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="p-5 space-y-2">
                <h3 className="text-base font-extrabold text-slate-100 font-['Outfit']">{moment.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{moment.desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500 text-center">Photos are illustrative.</p>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-12 rounded-3xl neu-flat space-y-8 border border-slate-800/80">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge variant="lime">WHY DANCE CARDIO</Badge>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-100 font-['Outfit']">MORE THAN A CALORIE BURN</h2>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {BENEFITS.map(item => (
              <li key={item.title} className="p-5 rounded-2xl neu-pressed-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center">
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-black text-slate-100 font-['Outfit']">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl neu-flat border-2 border-pink-500/50 text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-100 font-['Outfit']">READY TO DANCE?</h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            {plan
              ? `The ${plan.name} includes every Zumba & Cardio class for ${formatINR(plan.price_monthly)} a month.`
              : 'Pick a membership that includes Zumba & Cardio classes.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('pricing', plan ? { plan: plan.tier } : undefined)}
              className="w-full sm:w-auto px-8 py-4 neu-btn-pink text-white font-extrabold text-sm rounded-2xl"
            >
              See membership plans
            </button>
            <button type="button" onClick={() => navigate('schedule', { category: CATEGORY })} className="w-full sm:w-auto px-8 py-4 neu-btn text-slate-100 font-bold text-sm rounded-2xl">
              Check the timetable
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
