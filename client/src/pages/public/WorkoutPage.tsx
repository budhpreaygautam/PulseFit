import React from 'react';
import {
  Dumbbell,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Sparkles,
  Zap,
  Target,
  ShieldCheck,
  Award
} from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';

interface WorkoutPageProps {
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

export const WorkoutPage: React.FC<WorkoutPageProps> = ({
  setCurrentTab,
  onOpenAuthModal,
  onOpenFreeTrialModal
}) => {
  const workoutPhotos = [
    {
      url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&auto=format&fit=crop&q=80',
      title: 'Olympic Lifting & Squat Racks',
      desc: 'Eleiko calibrated plates, competition barbells, and heavy-duty steel squat cages.'
    },
    {
      url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=1200&auto=format&fit=crop&q=80',
      title: 'Free Weights & Dumbbell Zone',
      desc: 'Rubber-coated dumbbells ranging from 2.5 kg up to 50 kg with flat and incline benches.'
    },
    {
      url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1200&auto=format&fit=crop&q=80',
      title: 'Deadlift & Platform Arena',
      desc: 'Dedicated sound-dampened deadlifting platforms with bumper plates and chalk stations.'
    },
    {
      url: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=1200&auto=format&fit=crop&q=80',
      title: 'Functional Athletic Conditioning',
      desc: 'Kettlebells, battle ropes, pull-up rigs, and sled push turf for functional power.'
    },
    {
      url: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?w=1200&auto=format&fit=crop&q=80',
      title: 'Biomechanical Cable Stations',
      desc: 'Multi-functional cable crossovers, lat pulldowns, and seated rows with smooth pulley action.'
    },
    {
      url: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=1200&auto=format&fit=crop&q=80',
      title: 'Main Strength Floor Arena',
      desc: 'Spacious 6,000 sq.ft climate-controlled strength floor in Sector 29 Cyber Hub.'
    }
  ];

  const strengthHighlights = [
    {
      icon: <Dumbbell className="w-5 h-5 text-lime-400" />,
      title: 'Olympic Barbells & Free Weights',
      desc: 'Premium Olympic 20kg/15kg bars, bumper plates, cast iron plates, and dumbbells up to 50kg.'
    },
    {
      icon: <Target className="w-5 h-5 text-lime-400" />,
      title: 'Progressive Overload Tracking',
      desc: 'In-app workout logger to track weight lifted, rep counts, RPE, and cumulative tonnage volume.'
    },
    {
      icon: <Award className="w-5 h-5 text-lime-400" />,
      title: 'Certified Strength Coaching',
      desc: 'Expert biomechanics guidance from Coach Vikram and team to master deadlifts, squats & bench press.'
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-lime-400" />,
      title: 'Heavy-Duty Shock Absorption Floor',
      desc: '25mm high-density rubberized flooring engineered for heavy drops, acoustic control, and joint safety.'
    }
  ];

  const sampleRoutines = [
    {
      day: 'Day 1',
      title: 'Chest & Triceps Power',
      exercises: ['Barbell Bench Press (4x8)', 'Incline DB Press (3x10)', 'Dips / Cable Flyes (3x12)', 'Tricep Rope Pushdowns (3x15)']
    },
    {
      day: 'Day 2',
      title: 'Back & Biceps Hypertrophy',
      exercises: ['Conventional Deadlifts (4x6)', 'Lat Pulldowns (4x10)', 'Barbell Bent-Over Rows (3x10)', 'Incline DB Curls (3x12)']
    },
    {
      day: 'Day 3',
      title: 'Legs & Core Foundation',
      exercises: ['Barbell Back Squats (4x8)', 'Romanian Deadlifts (3x10)', 'Leg Press & Calf Raises (4x12)', 'Hanging Leg Raises (3x15)']
    },
    {
      day: 'Day 4',
      title: 'Shoulders & Arms Density',
      exercises: ['Overhead Military Press (4x8)', 'DB Lateral Raises (4x15)', 'Rear Delt Reverse Flyes (3x12)', 'Hammer Curls & Skullcrushers (3x12)']
    }
  ];

  return (
    <div className="space-y-16 pb-20">
      {/* 1. Hero Section */}
      <section className="relative min-h-[500px] sm:min-h-[580px] flex items-center justify-center overflow-hidden border-b border-slate-800/80">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&auto=format&fit=crop&q=80"
            alt="Strength Floor"
            className="w-full h-full object-cover brightness-[0.25] contrast-125 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-gym-950/60 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-lime-500/15 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6 pt-12 pb-16">
          <Badge variant="lime" size="md">
            PULSEFIT STRENGTH & WEIGHTLIFTING ARENA
          </Badge>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight font-['Outfit'] uppercase leading-none">
            FORGE RAW STRENGTH. <span className="text-gradient-lime">BUILD LEAN MUSCLE.</span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-medium">
            Step onto Gurugram's heavy iron floor. Competition racks, Eleiko barbells, and calibrated dumbbells engineered for maximum hypertrophy and performance.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full sm:w-auto px-8 py-4 neu-btn-lime text-black font-extrabold text-sm rounded-2xl shadow-glow-lime transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              Get Strength Pass @ ₹1,199/mo <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenFreeTrialModal}
              className="w-full sm:w-auto px-8 py-4 neu-btn text-slate-100 font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-lime-400" />
              Claim 1-Day Free Trial
            </button>
          </div>

          {/* Neumorphic Inset Quick Stat Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 max-w-3xl mx-auto border-t border-slate-800/80">
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-lime-400 font-['Outfit']">6,000+</div>
              <div className="text-[11px] text-slate-400 font-medium">Sq.Ft Iron Floor</div>
            </div>
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-white font-['Outfit']">50 KG</div>
              <div className="text-[11px] text-slate-400 font-medium">Max Dumbbell Weight</div>
            </div>
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-lime-400 font-['Outfit']">8+</div>
              <div className="text-[11px] text-slate-400 font-medium">Power & Squat Racks</div>
            </div>
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-white font-['Outfit']">Mon–Sat</div>
              <div className="text-[11px] text-slate-400 font-medium">6:00 AM – 10:00 PM</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Real Workout & Strength Action Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="lime">ATHLETIC FACILITY GALLERY</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white font-['Outfit']">
            REAL IRON. REAL ATHLETES.
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            A look inside our Sector 29 Cyber Hub strength floor built for serious lifters, bodybuilding, powerlifting, and athletic conditioning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workoutPhotos.map((photo, i) => (
            <div
              key={i}
              className="neu-flat group overflow-hidden rounded-3xl border border-slate-800/80 hover:border-lime-500/50 transition-all flex flex-col justify-between"
            >
              <div className="relative h-60 overflow-hidden bg-slate-900">
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-transparent to-transparent opacity-90" />
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-lime-400 font-mono text-[10px] font-bold border border-lime-500/30">
                    ZONE {i + 1}
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-2">
                <h3 className="text-base font-extrabold text-white group-hover:text-lime-400 transition-colors font-['Outfit']">
                  {photo.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  {photo.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Strength Pillars & Amenities Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl neu-flat space-y-10 border border-slate-800/80">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
            <div>
              <Badge variant="cyan">ENGINEERED FOR PROGRESS</Badge>
              <h2 className="text-2xl sm:text-4xl font-black text-white font-['Outfit'] mt-2">
                WHY LIFTERS CHOOSE PULSEFIT
              </h2>
            </div>
            <button
              onClick={() => setCurrentTab('guide')}
              className="text-xs font-bold text-lime-400 hover:text-lime-300 flex items-center gap-1 shrink-0"
            >
              View Workout Plans & Diet Charts <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {strengthHighlights.map((item, i) => (
              <div key={i} className="p-5 rounded-2xl neu-pressed-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center">
                  {item.icon}
                </div>
                <h3 className="font-extrabold text-sm text-white font-['Outfit']">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Sample Strength Routine Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="amber">RECOMMENDED SPLIT</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white font-['Outfit']">
            4-DAY UPPER / LOWER STRENGTH SPLIT
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            A sample training split programmed by Coach Vikram for optimal progressive overload and muscle hypertrophy.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {sampleRoutines.map((routine, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl neu-flat space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-lime-400 bg-lime-500/10 px-2.5 py-0.5 rounded-lg border border-lime-500/20">
                    {routine.day}
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold font-mono">60 Mins</span>
                </div>
                <h3 className="font-black text-sm text-white font-['Outfit']">{routine.title}</h3>
                <ul className="space-y-2 text-xs text-slate-300">
                  {routine.exercises.map((ex, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 shrink-0 mt-0.5" />
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-slate-800/80">
                <button
                  onClick={() => setCurrentTab('workout-logger')}
                  className="w-full py-2.5 neu-btn text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Dumbbell className="w-3.5 h-3.5 text-lime-400" /> Log In App
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Call To Action Footer Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl neu-flat border-2 border-lime-500/50 shadow-glow-lime text-center space-y-6">
          <Badge variant="lime">JOIN THE IRON BROTHERHOOD</Badge>
          <h2 className="text-3xl sm:text-5xl font-black text-white font-['Outfit']">
            READY TO CRUSH YOUR PRs AT CYBER HUB?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto font-medium">
            Get unlimited access to the gym floor, Olympic lifting racks, and free weights starting at just ₹1,199/month.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full sm:w-auto px-8 py-4 neu-btn-lime text-black font-extrabold text-sm rounded-2xl shadow-glow-lime transition-all active:scale-95"
            >
              Get Strength Pass @ ₹1,199/mo
            </button>
            <button
              onClick={() => setCurrentTab('schedule')}
              className="w-full sm:w-auto px-8 py-4 neu-btn text-white font-bold text-sm rounded-2xl"
            >
              Check Class Timetable
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
