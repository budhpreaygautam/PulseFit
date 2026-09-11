import React, { useState, useEffect } from 'react';
import {
  Dumbbell,
  Flame,
  Zap,
  Calendar,
  Users,
  Trophy,
  ArrowRight,
  Clock,
  Sparkles,
  CheckCircle2,
  Star,
  ChevronRight,
  Activity,
  HeartPulse,
  Award,
  MapPin
} from 'lucide-react';
import { GymClass, Trainer } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { useAuth } from '../../context/AuthContext.js';

interface LandingPageProps {
  setCurrentTab: (tab: string) => void;
  onOpenFreeTrialModal: () => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  setCurrentTab,
  onOpenFreeTrialModal,
  onOpenAuthModal
}) => {
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(1); // Monday default
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    api.getClasses().then(setClasses).catch(console.error);
    api.getTrainers().then(setTrainers).catch(console.error);
  }, []);

  const days = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 }
  ];

  const filteredPreviewClasses = classes
    .filter(c => c.day_of_week === selectedDay)
    .slice(0, 4);

  return (
    <div className="space-y-16 sm:space-y-24 pb-28 lg:pb-20 overflow-hidden">
      {/* 1. Hero Section */}
      <section className="relative pt-6 sm:pt-10 lg:pt-16 pb-8 sm:pb-14">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] h-[200px] sm:h-[300px] bg-lime-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-5 sm:space-y-6 text-center lg:text-left">
              {/* Location Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gym-900 border border-lime-500/30 text-lime-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse-dot shrink-0" />
                <MapPin className="w-3.5 h-3.5" />
                SECTOR 29 • CYBER HUB, GURUGRAM
              </div>

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1] font-['Outfit']">
                ELEVATE YOUR <br />
                <span className="text-gradient-lime">ATHLETIC PEAK</span>.
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Gurugram's premier high-performance athletic facility. Olympic lifting platforms, HIIT & combat arenas, sports recovery suites, and certified master coaches.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
                <button
                  onClick={onOpenFreeTrialModal}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black font-extrabold text-xs sm:text-sm rounded-xl shadow-glow-lime transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  Claim Free 1-Day Pass
                </button>

                <button
                  onClick={() => setCurrentTab('schedule')}
                  className="w-full sm:w-auto px-5 sm:px-7 py-3.5 bg-gym-900 hover:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4 text-lime-400" />
                  Explore Timetable
                </button>
              </div>

              {/* Micro Stats Row */}
              <div className="pt-6 sm:pt-8 border-t border-slate-800/80 grid grid-cols-3 gap-3 sm:gap-6 max-w-lg mx-auto lg:mx-0 text-center sm:text-left">
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white font-['Outfit']">15,000</div>
                  <div className="text-[11px] text-slate-400 font-medium">Sq. Ft. Facility</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-lime-400 font-['Outfit']">40+</div>
                  <div className="text-[11px] text-slate-400 font-medium">Classes Weekly</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-amber-400 font-['Outfit']">4.96 ★</div>
                  <div className="text-[11px] text-slate-400 font-medium">Google Rating</div>
                </div>
              </div>
            </div>

            {/* Right Visual Showcase */}
            <div className="lg:col-span-5 relative mt-4 lg:mt-0">
              <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-gym-900 group">
                <img
                  src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80"
                  alt="PulseFit Gurugram Arena"
                  className="w-full h-[320px] sm:h-[420px] object-cover object-center group-hover:scale-105 transition-transform duration-700 brightness-90"
                />

                {/* Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-gym-950/20 to-transparent" />

                {/* Floating Stat Badge */}
                <div className="absolute top-4 left-4 glass-panel p-2.5 sm:p-3 rounded-2xl border border-white/10 shadow-xl flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Metabolic Burn</div>
                    <div className="text-xs sm:text-sm font-extrabold text-lime-400">600+ kcal / Class</div>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 left-4 glass-panel p-3 rounded-2xl border border-white/10 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-100 truncate">24/7 Digital QR Access</div>
                        <div className="text-[10px] text-slate-400">Instant turnstile check-in</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setCurrentTab('pricing')}
                      className="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 text-black text-xs font-bold rounded-xl transition-colors shrink-0"
                    >
                      Join Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Facility Amenities & Zones */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-10 sm:mb-12">
          <Badge variant="lime">WORLD-CLASS AMENITIES</Badge>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight font-['Outfit']">
            DESIGNED FOR PEAK PERFORMANCE
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Every zone in our Gurugram facility is built with precision equipment, biometric tracking, and recovery science.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {[
            {
              title: 'Olympic Lifting & Power Racks',
              desc: 'Calibrated steel barbell plates, competition platforms, and complete squat/bench setups.',
              tag: 'STRENGTH',
              icon: <Dumbbell className="w-5 h-5 text-lime-400" />,
              image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500&auto=format&fit=crop&q=80'
            },
            {
              title: 'Sprint Turf & Cricket Agility Zone',
              desc: 'Prowler sled lanes, sprint tracks, agility ladders, and multi-directional explosive conditioning.',
              tag: 'AGILITY & HIIT',
              icon: <Flame className="w-5 h-5 text-rose-400" />,
              image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500&auto=format&fit=crop&q=80'
            },
            {
              title: 'Infrared Sauna & Ice Plunge Suite',
              desc: 'Contrast hydrotherapy suite featuring 10°C cold plunge baths and Finnish infrared saunas.',
              tag: 'RECOVERY',
              icon: <HeartPulse className="w-5 h-5 text-cyan-400" />,
              image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=500&auto=format&fit=crop&q=80'
            },
            {
              title: 'Boxing Ring & Combat Vault',
              desc: 'Heavy bags, teardrop speed bags, and boxing footwork drills for anaerobic conditioning.',
              tag: 'COMBAT',
              icon: <Zap className="w-5 h-5 text-amber-400" />,
              image: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=500&auto=format&fit=crop&q=80'
            },
            {
              title: 'Power Yoga & Mobility Sanctuary',
              desc: 'Heated hardwood studio with ambient lighting for restorative flow, hip mobility, and breathwork.',
              tag: 'MOBILITY',
              icon: <Activity className="w-5 h-5 text-purple-400" />,
              image: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=500&auto=format&fit=crop&q=80'
            },
            {
              title: 'InBody Scan & Juice / Chai Bar',
              desc: 'Medical-grade body composition testing alongside cold-pressed juices and post-workout herbal teas.',
              tag: 'NUTRITION',
              icon: <Award className="w-5 h-5 text-lime-400" />,
              image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=500&auto=format&fit=crop&q=80'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className="glass-panel glass-panel-hover rounded-2xl overflow-hidden border border-slate-800 flex flex-col group"
            >
              <div className="relative h-44 sm:h-48 overflow-hidden">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-85"
                />
                <div className="absolute top-3 right-3">
                  <Badge variant="slate" size="sm">{item.tag}</Badge>
                </div>
              </div>
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <h3 className="text-base font-bold text-white group-hover:text-lime-400 transition-colors">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Interactive Class Schedule Teaser */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel p-5 sm:p-8 lg:p-10 rounded-3xl border border-slate-800/80 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6 sm:mb-8">
            <div className="space-y-1">
              <Badge variant="amber">WEEKLY TIMETABLE</Badge>
              <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
                COACH-LED GROUP CLASSES
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Reserve your spot in high-energy classes. Capacity capped for individualized coach attention.
              </p>
            </div>

            {/* Day Selector Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {days.map(d => (
                <button
                  key={d.value}
                  onClick={() => setSelectedDay(d.value)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    selectedDay === d.value
                      ? 'bg-lime-500 text-black shadow-glow-lime'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Classes Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredPreviewClasses.length > 0 ? (
              filteredPreviewClasses.map(cls => {
                const spotsLeft = cls.capacity - cls.booked_count;
                return (
                  <div
                    key={cls.id}
                    className="p-4 rounded-2xl bg-gym-950/70 border border-slate-800/80 hover:border-lime-500/40 transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-lime-400 font-extrabold flex items-center gap-1 text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          {cls.start_time} ({cls.duration_minutes}m)
                        </span>
                        <Badge
                          variant={cls.intensity === 'Extreme' ? 'crimson' : cls.intensity === 'High' ? 'amber' : 'lime'}
                          size="sm"
                        >
                          {cls.intensity}
                        </Badge>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-sm text-white group-hover:text-lime-400 transition-colors">
                          {cls.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{cls.description}</p>
                      </div>

                      <div className="flex items-center gap-2 pt-1 text-xs text-slate-300">
                        <img
                          src={cls.trainer_avatar || 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200'}
                          alt={cls.trainer_name}
                          className="w-5 h-5 rounded-full object-cover border border-slate-700"
                        />
                        <span className="font-medium text-[11px] text-slate-300 truncate">{cls.trainer_name}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-[11px] text-slate-400 truncate">{cls.room}</span>
                      </div>
                    </div>

                    {/* Capacity & Action */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-[11px] text-slate-400">
                        <span className={`font-bold ${spotsLeft <= 3 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {spotsLeft} spots
                        </span>{' '}
                        left
                      </div>

                      <button
                        onClick={() => setCurrentTab('schedule')}
                        className="text-xs font-bold text-lime-400 hover:text-lime-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                      >
                        Book <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-8 text-slate-400 text-xs sm:text-sm">
                No classes scheduled on this day. Explore the full timetable!
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setCurrentTab('schedule')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              Explore Full 40+ Weekly Schedule <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. Master Trainers Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8 sm:mb-10">
          <div className="space-y-1">
            <Badge variant="cyan">COACHING ROSTER</Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
              MASTER ATHLETIC COACHES
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Certified specialists in biomechanics, Olympic strength, mobility, and metabolic conditioning.
            </p>
          </div>

          <button
            onClick={() => setCurrentTab('trainers')}
            className="text-xs font-bold text-lime-400 hover:text-lime-300 flex items-center gap-1 shrink-0"
          >
            Meet All Coaches <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {trainers.slice(0, 4).map(trainer => (
            <div
              key={trainer.id}
              className="glass-panel glass-panel-hover rounded-2xl overflow-hidden border border-slate-800 group"
            >
              <div className="relative h-56 sm:h-60 overflow-hidden">
                <img
                  src={trainer.avatar_url}
                  alt={trainer.name}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500 brightness-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-gym-950/20 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-200 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg">
                    {trainer.experience_years} Yrs Exp
                  </span>
                  <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-amber-400 text-[11px] font-bold">
                    <Star className="w-3 h-3 fill-current" /> {trainer.rating}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <div>
                  <h4 className="text-base font-black text-white">{trainer.name}</h4>
                  <div className="text-[11px] font-semibold text-lime-400">{trainer.instagram}</div>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{trainer.bio}</p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {trainer.specialties.slice(0, 2).map((spec, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded-md"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Memberships & Pricing Peek */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-10 sm:mb-12">
          <Badge variant="lime">TRANSPARENT MEMBERSHIPS</Badge>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight font-['Outfit']">
            CHOOSE YOUR TRAINING TIER
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            All plans include 24/7 biometric access, digital mobile pass, and locker facilities.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Standard Pass */}
          <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-800 flex flex-col justify-between">
            <div className="space-y-4">
              <Badge variant="cyan">STANDARD PASS</Badge>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white font-['Outfit']">₹1,499</span>
                <span className="text-slate-400 text-xs">/ month</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Complete access to the 24/7 gym floor, free weights, and cardio vault.
              </p>
              <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> 24/7 Gym Floor Access</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Digital QR Pass Access</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Locker Rooms & Showers</div>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full mt-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors"
            >
              View Plan Details
            </button>
          </div>

          {/* Performance Pro */}
          <div className="p-6 sm:p-7 rounded-3xl border-2 border-lime-500/70 bg-gradient-to-b from-lime-500/10 via-gym-900 to-gym-950 shadow-glow-lime flex flex-col justify-between relative transform lg:-translate-y-2">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime-500 text-black text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full shadow-md">
              MOST POPULAR
            </div>
            <div className="space-y-4 mt-1">
              <Badge variant="lime">PERFORMANCE PRO</Badge>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white font-['Outfit']">₹2,499</span>
                <span className="text-slate-400 text-xs">/ month</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Unlimited group fitness classes, sauna & steam recovery, and workout tracking.
              </p>
              <div className="pt-4 border-t border-slate-700/60 space-y-2 text-xs text-slate-200">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Everything in Standard Pass</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> <strong>Unlimited Group Fitness Classes</strong></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Infrared Sauna & Steam Recovery</div>
              </div>
            </div>
            <button
              onClick={() => onOpenAuthModal('register')}
              className="w-full mt-6 py-3.5 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black font-extrabold rounded-xl text-xs shadow-glow-lime transition-all"
            >
              Get Started with Pro
            </button>
          </div>

          {/* Elite VIP */}
          <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-800 flex flex-col justify-between">
            <div className="space-y-4">
              <Badge variant="amber">ELITE VIP</Badge>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white font-['Outfit']">₹3,999</span>
                <span className="text-slate-400 text-xs">/ month</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                All-access athletic lifestyle with personal coaching credits and contrast hydro plunge.
              </p>
              <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> Everything in Performance Pro</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> <strong>Cold Plunge Hydrotherapy</strong></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> 2 Personal Coaching Sessions/Mo</div>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full mt-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors"
            >
              View Full Tier Details
            </button>
          </div>
        </div>
      </section>

      {/* 6. Testimonials */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-8 sm:mb-10">
          <Badge variant="purple">MEMBER RESULTS</Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
            REAL STORIES. TRANSFORMATIONAL IMPACT.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              quote: "PulseFit completely transformed my training consistency. Coach Vikram helped me fix my barbell deadlift form and hit 160kg with zero back strain.",
              author: "Aarav Sharma",
              role: "Pro Member (14 Mos)",
              stat: "+50kg Deadlift",
              avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300"
            },
            {
              quote: "The contrast therapy (sauna + ice plunge) after Friday MetCon HIIT classes is game-changing. Never recovered this fast for weekend cricket.",
              author: "Neha Singhal",
              role: "VIP Member (1 Yr)",
              stat: "Top 5% Consistency",
              avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300"
            },
            {
              quote: "The digital pass turnstiles and class reservation interface make coming to Cyber Hub before work seamless. The 7am Boxing energy is unmatched.",
              author: "Kabir Malhotra",
              role: "Pro Member (8 Mos)",
              stat: "28-Day Streak",
              avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300"
            }
          ].map((t, i) => (
            <div key={i} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(5)].map((_, idx) => (
                    <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">"{t.quote}"</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src={t.avatar} alt={t.author} className="w-8 h-8 rounded-full object-cover border border-slate-700" />
                  <div>
                    <div className="text-xs font-bold text-white">{t.author}</div>
                    <div className="text-[10px] text-slate-400">{t.role}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded-md border border-lime-500/20">
                  {t.stat}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7. Bottom CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-lime-950/70 via-gym-900 to-gym-950 border border-lime-500/40 p-6 sm:p-10 lg:p-12 text-center lg:text-left flex flex-col lg:flex-row items-center justify-between gap-6 shadow-glow-lime">
          <div className="space-y-2 max-w-xl">
            <Badge variant="lime">GET STARTED</Badge>
            <h3 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
              READY TO REDEFINE YOUR LIMITS?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Claim your 1-Day VIP Pass to experience PulseFit Cyber Hub, Gurugram. Full gym floor, group classes, and recovery suite included.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
            <button
              onClick={onOpenFreeTrialModal}
              className="w-full sm:w-auto px-6 py-3.5 bg-lime-500 hover:bg-lime-400 text-black font-black text-xs sm:text-sm rounded-xl shadow-glow-lime transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Claim Free Pass
            </button>
            <button
              onClick={() => onOpenAuthModal('register')}
              className="w-full sm:w-auto px-5 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors"
            >
              Join PulseFit
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
