import React from 'react';
import { ArrowRight, CheckCircle2, Dumbbell, Layers, Sparkles, Target, Users } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { StatTile } from '../../components/public/StatTile.js';
import { WeeklyClasses } from '../../components/public/WeeklyClasses.js';
import { useApiData } from '../../components/public/useApiData.js';
import { cheapestPlanFor } from '../../components/public/plans.js';
import { HOURS_DAYS, HOURS_TIME } from '../../components/public/gymInfo.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api } from '../../api/client.js';
import { formatINR } from '../../lib/format.js';

interface WorkoutPageProps {
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

const CATEGORY = 'Workout & Strength';

const ZONES = [
  {
    url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&auto=format&fit=crop&q=80',
    title: 'Racks & barbells',
    desc: 'Power racks, Olympic barbells and bumper plates for squats, presses and pulls.'
  },
  {
    url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=1200&auto=format&fit=crop&q=80',
    title: 'Free weights',
    desc: 'A full dumbbell rack with flat and incline benches.'
  },
  {
    url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1200&auto=format&fit=crop&q=80',
    title: 'Deadlift platforms',
    desc: 'Dedicated lifting platforms with bumper plates and chalk.'
  },
  {
    url: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=1200&auto=format&fit=crop&q=80',
    title: 'Functional training',
    desc: 'Kettlebells, battle ropes and a pull-up rig for conditioning work.'
  },
  {
    url: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=1200&auto=format&fit=crop&q=80',
    title: 'Cable stations',
    desc: 'Cable crossovers, lat pulldowns and seated rows.'
  },
  {
    url: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=1200&auto=format&fit=crop&q=80',
    title: 'Coached classes',
    desc: 'Every Workout & Strength class on the timetable is led by one of our coaches.'
  }
];

const HIGHLIGHTS = [
  { icon: Dumbbell, title: 'Barbells & free weights', desc: 'Everything you need for the big compound lifts and their accessories.' },
  { icon: Target, title: 'Track your progress', desc: 'Log sets, reps, weight and RPE in the app and see your volume and estimated 1-rep maxes over time.' },
  { icon: Users, title: 'Coach-led classes', desc: 'Learn the squat, bench press and deadlift with a coach in small, bookable classes.' },
  { icon: Layers, title: 'Room to train', desc: 'A separate strength floor, so lifting never competes with the dance studio.' }
];

const SAMPLE_SPLIT = [
  { day: 'Day 1', title: 'Chest & triceps', exercises: ['Barbell bench press 4×8', 'Incline dumbbell press 3×10', 'Cable flyes 3×12', 'Rope pushdowns 3×15'] },
  { day: 'Day 2', title: 'Back & biceps', exercises: ['Deadlift 4×6', 'Lat pulldown 4×10', 'Barbell row 3×10', 'Incline dumbbell curl 3×12'] },
  { day: 'Day 3', title: 'Legs & core', exercises: ['Back squat 4×8', 'Romanian deadlift 3×10', 'Leg press 4×12', 'Hanging leg raise 3×15'] },
  { day: 'Day 4', title: 'Shoulders & arms', exercises: ['Overhead press 4×8', 'Lateral raise 4×15', 'Reverse flye 3×12', 'Hammer curl & skull crusher 3×12'] }
];

export const WorkoutPage: React.FC<WorkoutPageProps> = ({ setCurrentTab, onOpenFreeTrialModal }) => {
  const { navigate } = useNavigation();
  const classes = useApiData(() => api.getClasses({ category: CATEGORY }));
  const plans = useApiData(() => api.getPlans());

  const plan = plans.data ? cheapestPlanFor(plans.data, CATEGORY) : undefined;
  const coaches = classes.data ? new Set(classes.data.map(c => c.trainer_id)).size : null;
  const priceLabel = plan ? `${formatINR(plan.price_monthly)}/mo` : null;

  return (
    <div className="space-y-16 pb-20">
      <section className="relative min-h-[460px] sm:min-h-[540px] flex items-center justify-center overflow-hidden bg-black">
        <img
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&auto=format&fit=crop&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30" />
        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-gym-950 to-transparent" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6 py-16">
          <span className="inline-block px-3 py-1 rounded-full bg-black/60 border border-lime-400/40 text-lime-300 text-xs font-bold tracking-wide">
            WORKOUT & STRENGTH FLOOR
          </span>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-zinc-50 tracking-tight font-['Outfit'] uppercase leading-none">
            BUILD REAL STRENGTH. <span className="text-lime-300">LIFT WITH A PLAN.</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed font-medium">
            Racks, barbells and free weights in Sector 29, Gurugram, with coach-led strength classes you can book in the app.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('pricing', plan ? { plan: plan.tier } : undefined)}
              className="w-full sm:w-auto px-8 py-4 neu-btn-lime font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2"
            >
              {plan ? `${plan.name} from ${formatINR(plan.price_monthly)}/month` : 'See membership plans'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenFreeTrialModal}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-zinc-50 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-lime-300" aria-hidden="true" />
              Claim a free 1-day pass
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Strength floor at a glance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile value={classes.data ? String(classes.data.length) : null} isLoading={classes.isLoading} label="Strength classes a week" />
          <StatTile value={coaches !== null ? String(coaches) : null} isLoading={classes.isLoading} label={coaches === 1 ? 'Strength coach' : 'Strength coaches'} />
          <StatTile value={HOURS_DAYS} label={HOURS_TIME} />
          <StatTile value={priceLabel} isLoading={plans.isLoading} label="Strength plan from" />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <Badge variant="lime">CLASSES</Badge>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-100 font-['Outfit'] mt-2">STRENGTH CLASSES EVERY WEEK</h2>
            <p className="text-sm text-slate-400 mt-1">Spots shown are for each class's next session.</p>
          </div>
          <button type="button" onClick={() => navigate('schedule')} className="text-xs font-bold text-lime-400 hover:underline flex items-center gap-1 shrink-0">
            Full timetable <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <WeeklyClasses
          classes={classes.data}
          isLoading={classes.isLoading}
          error={classes.error}
          onRetry={classes.reload}
          onOpen={(week, day) => navigate('schedule', { week, day: String(day) })}
          emptyTitle="No strength classes are on the timetable right now"
        />
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="lime">THE FLOOR</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-100 font-['Outfit']">WHAT YOU'LL TRAIN WITH</h2>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ZONES.map(zone => (
            <li key={zone.title} className="neu-flat overflow-hidden rounded-3xl border border-slate-800/80">
              <div className="h-52 overflow-hidden bg-slate-900">
                <img src={zone.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="p-5 space-y-2">
                <h3 className="text-base font-extrabold text-slate-100 font-['Outfit']">{zone.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{zone.desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500 text-center">Photos are illustrative.</p>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-12 rounded-3xl neu-flat space-y-8 border border-slate-800/80">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <Badge variant="cyan">WHY LIFT HERE</Badge>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-100 font-['Outfit'] mt-2">BUILT FOR PROGRESS</h2>
            </div>
            <button type="button" onClick={() => setCurrentTab('guide')} className="text-xs font-bold text-lime-400 hover:underline flex items-center gap-1 shrink-0">
              Training plans & diet charts <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HIGHLIGHTS.map(item => (
              <li key={item.title} className="p-5 rounded-2xl neu-pressed-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center text-lime-400">
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-extrabold text-sm text-slate-100 font-['Outfit']">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="cyan">SAMPLE SPLIT</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-100 font-['Outfit']">A 4-DAY BODY-PART SPLIT</h2>
          <p className="text-sm text-slate-400">A simple starting point. Ask a coach to adjust it to your level.</p>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SAMPLE_SPLIT.map(routine => (
            <li key={routine.day} className="p-6 rounded-3xl neu-flat space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="inline-block font-mono text-xs font-black text-lime-400 bg-lime-500/10 px-2.5 py-0.5 rounded-lg border border-lime-500/20">{routine.day}</span>
                <h3 className="font-black text-sm text-slate-100 font-['Outfit']">{routine.title}</h3>
                <ul className="space-y-2 text-xs text-slate-300">
                  {routine.exercises.map(ex => (
                    <li key={ex} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTab('workout-logger')}
                className="w-full py-2.5 neu-btn text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
              >
                <Dumbbell className="w-3.5 h-3.5 text-lime-400" aria-hidden="true" /> Log this workout
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl neu-flat border-2 border-lime-500/50 text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-100 font-['Outfit']">READY TO START LIFTING?</h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            {plan
              ? `The ${plan.name} gives you the strength floor and every Workout & Strength class for ${formatINR(plan.price_monthly)} a month.`
              : 'Pick a membership that includes the strength floor and its classes.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('pricing', plan ? { plan: plan.tier } : undefined)}
              className="w-full sm:w-auto px-8 py-4 neu-btn-lime font-extrabold text-sm rounded-2xl"
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
