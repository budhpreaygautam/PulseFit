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
  MapPin,
  Music2,
  ShieldCheck
} from 'lucide-react';
import { ClassOccurrence as GymClass, Trainer, ActiveFloorStatus } from '../../types/index.js';
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
  const [activeFloor, setActiveFloor] = useState<ActiveFloorStatus | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1); // Monday default
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    api.getClasses().then(setClasses).catch(console.error);
    api.getTrainers().then(setTrainers).catch(console.error);

    const loadActiveFloor = () => {
      api.getActiveFloorStatus().then(setActiveFloor).catch(console.error);
    };

    loadActiveFloor();
    const interval = setInterval(loadActiveFloor, 8000); // Live refresh every 8s
    return () => clearInterval(interval);
  }, []);

  const days = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun (Rest)', value: 0 }
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
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gym-900 border border-lime-500/30 text-lime-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse-dot shrink-0" />
                <MapPin className="w-3.5 h-3.5" />
                SECTOR 29 • CYBER HUB, GURUGRAM
              </div>

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1] font-['Outfit']">
                YOUR GO-TO FITNESS HUB FOR <br />
                <span className="text-gradient-lime">STRENGTH & ZUMBA</span>.
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Gurugram's high-energy fitness destination. Specialized in result-driven <strong>Workout & Strength Training</strong> and high-vibe <strong>Zumba & Cardio Sessions</strong> starting at just ₹1,199/month.
              </p>

              {/* Two Core Pillars Highlight */}
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto lg:mx-0 pt-1">
                <div className="p-3 rounded-xl bg-gym-900/80 border border-slate-800 text-left flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-lime-500/20 text-lime-400 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-white">Strength Training</div>
                    <div className="text-[10px] text-slate-400">Weights & hypertrophy</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gym-900/80 border border-slate-800 text-left flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
                    <Music2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-white">Zumba & Cardio</div>
                    <div className="text-[10px] text-slate-400">Dance & fat burn</div>
                  </div>
                </div>
              </div>

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
                  className="w-full sm:w-auto px-5 sm:px-7 py-3.5 neu-btn text-slate-800 dark:text-slate-100 hover:text-black dark:hover:text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                  View Class Schedule
                </button>
              </div>

              {/* Micro Stats Row */}
              <div className="pt-6 sm:pt-8 border-t border-slate-800/80 grid grid-cols-3 gap-3 sm:gap-6 max-w-lg mx-auto lg:mx-0 text-center sm:text-left">
                <div>
                  <div className="text-xl sm:text-2xl font-black text-lime-400 font-['Outfit']">₹1,199<span className="text-xs font-normal text-slate-400">/mo</span></div>
                  <div className="text-[11px] text-slate-400 font-medium">Starting Plan</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white font-['Outfit']">Mon – Sat</div>
                  <div className="text-[11px] text-slate-400 font-medium">6 AM – 10 PM (Sun Off)</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-amber-400 font-['Outfit']">4.9 ★</div>
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
                  <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Calorie Burn</div>
                    <div className="text-xs sm:text-sm font-extrabold text-lime-400">500+ kcal / Session</div>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 left-4 glass-panel p-3 rounded-2xl border border-white/10 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-8 h-8 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-100 truncate">Digital Turnstile Access</div>
                        <div className="text-[10px] text-slate-400">Instant QR scan entry</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setCurrentTab('pricing')}
                      className="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 text-black text-xs font-bold rounded-xl transition-colors shrink-0"
                    >
                      Join @ ₹1,199
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live Category-Wise Active Gym Floor Presence Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 bg-gradient-to-b from-gym-900 via-gym-950 to-gym-950 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-lime-400 animate-pulse-dot" />
                <Badge variant="lime">LIVE GYM FLOOR STATUS</Badge>
                <span className="text-xs font-mono text-slate-400 hidden sm:inline">Cyber Hub, Gurugram</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit'] mt-1">
                CURRENTLY ACTIVE ATHLETES & SESSIONS
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Real-time optical turnstile and clock-in activity across our two specialized fitness zones.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="p-2.5 px-4 rounded-2xl bg-gym-950 border border-slate-800 text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Total Active Now</div>
                <div className="text-xl font-black text-lime-400 font-mono">
                  {activeFloor?.totalActive || 0} Athletes
                </div>
              </div>
            </div>
          </div>

          {/* 2 Category-Wise Floor Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category A: Workout & Strength Floor */}
            <div className="p-5 sm:p-6 rounded-2xl bg-gym-950/80 border border-slate-800 hover:border-lime-500/40 transition-all space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center font-bold">
                    <Dumbbell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      Workout & Strength Floor
                    </h3>
                    <div className="text-[11px] text-slate-400">Free weights, squat racks & barbells</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 font-mono font-bold text-xs">
                  <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse-dot" />
                  {activeFloor?.workoutActive || 0} Lifting
                </div>
              </div>

              {/* Active Users List in Workout */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Currently On Floor:</span>
                  <span className="text-[10px] text-slate-500 font-mono">Real-time Clock-in</span>
                </div>

                {activeFloor && (activeFloor.workoutUsers ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {(activeFloor.workoutUsers ?? []).map(session => (
                      <div
                        key={`${session.user_name}-${session.clock_in_time}`}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <img
                            src={session.user_avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100'}
                            alt={session.user_name}
                            className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0"
                          />
                          <div className="truncate">
                            <div className="text-xs font-bold text-white truncate">{session.user_name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{'Strength Training'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded-md font-bold">
                            ⏱ {session.duration_minutes}m active
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-900/40 text-center text-xs text-slate-500">
                    Floor is ready for next training session.
                  </div>
                )}
              </div>
            </div>

            {/* Category B: Zumba & Cardio Studio */}
            <div className="p-5 sm:p-6 rounded-2xl bg-gym-950/80 border border-slate-800 hover:border-pink-500/40 transition-all space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center font-bold">
                    <Music2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      Zumba & Cardio Studio
                    </h3>
                    <div className="text-[11px] text-slate-400">Acoustic dance floor & cardio beats</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 font-mono font-bold text-xs">
                  <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse-dot" />
                  {activeFloor?.zumbaActive || 0} Dancing
                </div>
              </div>

              {/* Active Users List in Zumba */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Currently In Studio:</span>
                  <span className="text-[10px] text-slate-500 font-mono">Real-time Clock-in</span>
                </div>

                {activeFloor && (activeFloor.zumbaUsers ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {(activeFloor.zumbaUsers ?? []).map(session => (
                      <div
                        key={`${session.user_name}-${session.clock_in_time}`}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <img
                            src={session.user_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                            alt={session.user_name}
                            className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0"
                          />
                          <div className="truncate">
                            <div className="text-xs font-bold text-white truncate">{session.user_name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{'Dance Cardio Workout'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-md font-bold">
                            ⏱ {session.duration_minutes}m active
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-900/40 text-center text-xs text-slate-500">
                    Studio is ready for next dance session.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Operating Hours & Clock-In Prompt Banner */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2.5 text-slate-300">
              <Clock className="w-4 h-4 text-lime-400 shrink-0" />
              <div>
                <strong>Facility Hours:</strong> Monday – Saturday: <span className="text-white font-mono font-bold">6:00 AM – 10:00 PM</span> • <span className="text-amber-400 font-bold">Sunday Off (Rest Day)</span>
              </div>
            </div>

            <button
              onClick={() => (isAuthenticated ? setCurrentTab('dashboard') : onOpenAuthModal('login'))}
              className="px-4 py-2 bg-lime-500 hover:bg-lime-400 text-black font-extrabold rounded-xl shadow-glow-lime transition-all shrink-0"
            >
              {isAuthenticated ? 'Open My Time Tracker' : 'Sign In & Clock In'}
            </button>
          </div>
        </div>
      </section>

      {/* 3. Two Core Fitness Offerings Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-10 sm:mb-12">
          <Badge variant="lime">OUR CORE OFFERINGS</Badge>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight font-['Outfit']">
            TWO DEDICATED FITNESS DISCIPLINES
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            We keep fitness simple, focused, and ultra-effective. Everything you need to build muscle and stay lean.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* Service 1: Workout & Strength Training */}
          <div className="glass-panel glass-panel-hover rounded-3xl overflow-hidden border border-slate-800 flex flex-col justify-between group">
            <div className="relative h-64 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&auto=format&fit=crop&q=80"
                alt="Workout & Strength Training"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-85"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-transparent to-transparent" />
              <div className="absolute top-4 left-4">
                <Badge variant="lime">SERVICE 1</Badge>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-2 text-lime-400 text-xs font-bold">
                  <Dumbbell className="w-4 h-4" /> MUSCLE & STRENGTH
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                  Workout & Strength Training
                </h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Dedicated free weights zone, calibrated barbells, squat racks, dumbbell benches (up to 40kg), and guided lifting coaching. Master fundamental compound lifts, build lean muscle, and progress consistently with form feedback.
              </p>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
                  <span>Olympic Barbells, Power Cages & Bench Presses</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
                  <span>Daily Workout Logger with 1RM and Volume Tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" />
                  <span>Coach-Led Hypertrophy & Form Correction Sessions</span>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-400">Plans from <strong className="text-white text-base">₹1,199/mo</strong></span>
                <button
                  onClick={() => setCurrentTab('workout')}
                  className="px-4 py-2 bg-lime-500/10 hover:bg-lime-500 text-lime-400 hover:text-black font-extrabold text-xs rounded-xl border border-lime-500/30 transition-all flex items-center justify-center gap-1.5"
                >
                  Explore Strength Floor <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Service 2: Zumba & Cardio Sessions */}
          <div className="glass-panel glass-panel-hover rounded-3xl overflow-hidden border border-slate-800 flex flex-col justify-between group">
            <div className="relative h-64 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&auto=format&fit=crop&q=80"
                alt="Zumba & Cardio Sessions"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-85"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-transparent to-transparent" />
              <div className="absolute top-4 left-4">
                <Badge variant="amber">SERVICE 2</Badge>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-2 text-pink-400 text-xs font-bold">
                  <Music2 className="w-4 h-4" /> HIGH-ENERGY CARDIO
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                  Zumba & Cardio Sessions
                </h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                High-octane dance cardio choreography powered by rhythmic beats, Latin & Bollywood mixes, and dynamic aerobic intervals. Burn 500+ calories per session while having fun in an inclusive, high-energy group atmosphere.
              </p>

              <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-pink-400 shrink-0" />
                  <span>Licensed Zumba Instructors with Infectious Energy</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-pink-400 shrink-0" />
                  <span>Acoustic Dance Floor with Surround Sound & Studio Lights</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-pink-400 shrink-0" />
                  <span>Aerobic Fat Burn & Cardiovascular Stamina Conditioning</span>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-400">Plans from <strong className="text-white text-base">₹1,499/mo</strong></span>
                <button
                  onClick={() => setCurrentTab('zumba')}
                  className="px-4 py-2 bg-pink-500/10 hover:bg-pink-500 text-pink-400 hover:text-white font-extrabold text-xs rounded-xl border border-pink-500/30 transition-all flex items-center justify-center gap-1.5"
                >
                  Explore Zumba Studio <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Workout Plans, Desi Diets & Supplements Guide Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-slate-800 bg-gradient-to-r from-gym-900 via-gym-950 to-slate-950 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <Badge variant="cyan">MEMBER RESOURCE CENTER</Badge>
              <span className="text-xs font-mono text-lime-400 font-bold">100% Free Access</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
              WORKOUT SPLITS, DESI DIETS & SUPPLEMENTS GUIDE
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Explore 3,000 kcal Muscle Bulk, 1,800 kcal Fat Loss, and 100% Pure Vegetarian high-protein meal charts with authentic Indian staples, plus 4-Day / 5-Day PPL splits and safe supplement guidelines.
            </p>
          </div>

          <button
            onClick={() => setCurrentTab('guide')}
            className="px-6 py-3.5 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black font-black text-xs sm:text-sm rounded-xl shadow-glow-lime transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
          >
            <Zap className="w-4 h-4" /> View Guides & Diets <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* 5. Interactive Class Schedule Teaser */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel p-5 sm:p-8 lg:p-10 rounded-3xl border border-slate-800/80 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6 sm:mb-8">
            <div className="space-y-1">
              <Badge variant="amber">WEEKLY SESSIONS</Badge>
              <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
                DAILY STRENGTH & ZUMBA SCHEDULE
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Morning & evening sessions led by certified coaches. Reserve your spot instantly.
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
                      ? 'neu-btn-lime shadow-glow-lime'
                      : 'neu-btn text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white'
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
                const isZumba = cls.category.toLowerCase().includes('zumba');

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
                          variant={isZumba ? 'amber' : 'lime'}
                          size="sm"
                        >
                          {cls.category}
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
                No sessions scheduled on this day. Explore the full timetable!
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setCurrentTab('schedule')}
              className="inline-flex items-center gap-2 px-6 py-3 neu-btn text-slate-800 dark:text-slate-100 hover:text-black dark:hover:text-white text-xs font-extrabold rounded-xl transition-all"
            >
              Explore Full Weekly Schedule <ArrowRight className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. Master Trainers Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8 sm:mb-10">
          <div className="space-y-1">
            <Badge variant="cyan">EXPERT COACHES</Badge>
            <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
              STRENGTH & ZUMBA INSTRUCTORS
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Experienced coaches dedicated to helping you achieve your fitness goals safely and enthusiastically.
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

      {/* 5. Medium Affordable Memberships & Pricing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-10 sm:mb-12">
          <Badge variant="lime">AFFORDABLE MEMBERSHIPS</Badge>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight font-['Outfit']">
            CLEAR, BUDGET-FRIENDLY PRICING
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            High quality without high-fy prices. 24/7 digital turnstile access included with every plan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Plan 1: Strength Pass */}
          <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-800 flex flex-col justify-between">
            <div className="space-y-4">
              <Badge variant="cyan">STRENGTH PASS</Badge>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white font-['Outfit']">₹1,199</span>
                <span className="text-slate-400 text-xs">/ month</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Complete access to the gym floor, free weights & strength workout sessions.
              </p>
              <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Full Gym Floor & Free Weights</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Strength Training Sessions</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Daily Workout Set Logger & Time Tracker</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Digital QR Turnstile Pass</div>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full mt-6 py-3 neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white font-bold rounded-xl text-xs transition-all"
            >
              Get Strength Pass
            </button>
          </div>

          {/* Plan 2: Zumba & Cardio Pass */}
          <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-800 flex flex-col justify-between">
            <div className="space-y-4">
              <Badge variant="amber">ZUMBA & CARDIO</Badge>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white font-['Outfit']">₹1,499</span>
                <span className="text-slate-400 text-xs">/ month</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Unlimited high-energy Zumba dance and cardio conditioning classes.
              </p>
              <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> Unlimited Zumba Sessions</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> Dance Studio & Aerobic Floor</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> Locker Rooms & Showers</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> Digital QR Turnstile Pass</div>
              </div>
            </div>
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full mt-6 py-3 neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white font-bold rounded-xl text-xs transition-all"
            >
              Get Zumba Pass
            </button>
          </div>

          {/* Plan 3: Dual All-Access Pass (Best Value) */}
          <div className="p-6 sm:p-7 rounded-3xl border-2 border-lime-500/70 bg-gradient-to-b from-lime-500/10 via-gym-900 to-gym-950 shadow-glow-lime flex flex-col justify-between relative transform lg:-translate-y-2">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime-500 text-black text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full shadow-md">
              BEST VALUE
            </div>
            <div className="space-y-4 mt-1">
              <Badge variant="lime">DUAL ALL-ACCESS</Badge>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white font-['Outfit']">₹1,999</span>
                <span className="text-slate-400 text-xs">/ month</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Unlimited access to both Workout/Strength Training and Zumba/Cardio sessions.
              </p>
              <div className="pt-4 border-t border-slate-700/60 space-y-2 text-xs text-slate-200">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> <strong>Unlimited Strength & Free Weights</strong></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> <strong>Unlimited Zumba & Cardio Sessions</strong></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> 1 Monthly Trainer Form Assessment</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-lime-400 shrink-0" /> Priority Class Spot Booking</div>
              </div>
            </div>
            <button
              onClick={() => onOpenAuthModal('register')}
              className="w-full mt-6 py-3.5 neu-btn-lime text-black font-extrabold rounded-xl text-xs shadow-glow-lime transition-all"
            >
              Get Dual All-Access @ ₹1,999
            </button>
          </div>
        </div>
      </section>

      {/* 6. Testimonials */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 mb-8 sm:mb-10">
          <Badge variant="purple">MEMBER REVIEWS</Badge>
          <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
            REAL STORIES FROM GURUGRAM MEMBERS
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              quote: "The strength training floor is well-equipped with barbells and power racks. Coach Vikram corrected my squat form and I hit a new PR within a month!",
              author: "Aarav Sharma",
              role: "Strength Member",
              stat: "14-Day Streak",
              avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300"
            },
            {
              quote: "Kavya's Zumba classes are the highlight of my evenings in Gurugram! High energy, great playlists, and an amazing workout after a long office day.",
              author: "Ananya Gupta",
              role: "Zumba Member",
              stat: "Lost 4kg in 6 Wks",
              avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300"
            },
            {
              quote: "At ₹1,999/mo for both Strength and Zumba, PulseFit is unmatched in Cyber Hub. Digital QR turnstile check-in makes mornings frictionless.",
              author: "Rohan Mehra",
              role: "Dual All-Access Member",
              stat: "Top Consistency",
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
            <Badge variant="lime">FREE TRIAL</Badge>
            <h3 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
              TRY A STRENGTH OR ZUMBA SESSION FREE
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Claim your 1-Day Pass to experience PulseFit Cyber Hub, Gurugram. Strength gym floor and Zumba cardio classes included.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
            <button
              onClick={onOpenFreeTrialModal}
              className="w-full sm:w-auto px-6 py-3.5 neu-btn-lime text-black font-black text-xs sm:text-sm rounded-xl shadow-glow-lime transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Claim Free Pass
            </button>
            <button
              onClick={() => onOpenAuthModal('register')}
              className="w-full sm:w-auto px-5 py-3.5 neu-btn text-slate-800 dark:text-slate-100 hover:text-black dark:hover:text-white font-bold text-xs sm:text-sm rounded-xl transition-all"
            >
              Join from ₹1,199/mo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
