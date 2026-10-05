import React from 'react';
import {
  Flame,
  Sparkles,
  Calendar,
  ArrowRight,
  Heart,
  Zap
} from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';

interface ZumbaPageProps {
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

export const ZumbaPage: React.FC<ZumbaPageProps> = ({
  setCurrentTab,
  onOpenAuthModal,
  onOpenFreeTrialModal
}) => {
  const zumbaPhotos = [
    {
      url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&auto=format&fit=crop&q=80',
      title: 'High-Energy Zumba Cardio Floor',
      desc: 'Dynamic group fitness dance cardio with pounding beats and synchronized choreography.'
    },
    {
      url: 'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=1200&auto=format&fit=crop&q=80',
      title: 'Bollywood & Latin Dance Fusion',
      desc: 'Infectious rhythm blends of Bollywood beats, Salsa, Reggaeton, and Merengue footwork.'
    },
    {
      url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&auto=format&fit=crop&q=80',
      title: 'Acoustic Sound & Lighting Studio',
      desc: 'Club-grade immersive sound system, mood lighting, and hardwood spring aerobic floors.'
    },
    {
      url: 'https://images.unsplash.com/photo-1508215885820-4585e56135c8?w=1200&auto=format&fit=crop&q=80',
      title: 'Certified Master Instructors',
      desc: 'Led by licensed Zumba ZIN coaches who bring electrifying motivation and stage presence.'
    },
    {
      url: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=1200&auto=format&fit=crop&q=80',
      title: 'Cardio Calorie Torch (650+ kcal)',
      desc: 'High-intensity interval dance tracks designed to maximize VO2 max and burn fat effortlessly.'
    },
    {
      url: 'https://images.unsplash.com/photo-1549576490-b0b4831ef60a?w=1200&auto=format&fit=crop&q=80',
      title: 'Vibrant Community & Sisterhood',
      desc: 'Welcoming, non-judgmental environment for beginners, working professionals, and seasoned dancers.'
    }
  ];

  const danceDisciplines = [
    {
      title: 'Zumba Classic Party',
      intensity: 'Medium - High',
      calories: '~600 kcal',
      time: '60 Mins',
      desc: 'The original global dance fitness sensation. Easy-to-follow Latin and international dance moves.'
    },
    {
      title: 'Bollywood Beats Cardio',
      intensity: 'High Intensity',
      calories: '~700 kcal',
      time: '50 Mins',
      desc: 'High-octane Bhangra and Bollywood hits blended into an explosive aerobic cardio blast.'
    },
    {
      title: 'Zumba Step & Tone',
      intensity: 'High - Extreme',
      calories: '~650 kcal',
      time: '45 Mins',
      desc: 'Incorporates aerobic step platforms to sculpt glutes, hamstrings, and calves while dancing.'
    },
    {
      title: 'Sunset Cool-Down & Stretch',
      intensity: 'Low - Restorative',
      calories: '~250 kcal',
      time: '30 Mins',
      desc: 'Gentle mobility stretches, rhythmic breathwork, and muscle relaxation after high-bpm sessions.'
    }
  ];

  return (
    <div className="space-y-16 pb-20">
      {/* 1. Hero Section */}
      <section className="relative min-h-[520px] sm:min-h-[600px] flex items-center justify-center overflow-hidden border-b border-slate-800/80">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1600&auto=format&fit=crop&q=80"
            alt="Zumba Dance Studio"
            className="w-full h-full object-cover brightness-[0.28] contrast-125 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-gym-950/60 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-pink-500/15 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6 pt-12 pb-16">
          <Badge variant="amber" size="md">
            PULSEFIT DANCE & CARDIO ARENA
          </Badge>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight font-['Outfit'] uppercase leading-none">
            DANCE. SWEAT. <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-rose-300 to-amber-400">FEEL THE BEAT.</span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-medium">
            Torch up to 700 calories per session in our sound-engineered dance studio at Cyber Hub Gurugram. Pounding bass, energetic choreography, and an electric community vibe.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full sm:w-auto px-8 py-4 neu-btn-pink text-white font-extrabold text-sm rounded-2xl shadow-glow-pink transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              Get Zumba Pass @ ₹1,499/mo <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenFreeTrialModal}
              className="w-full sm:w-auto px-8 py-4 neu-btn text-slate-100 font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-pink-400" />
              Claim 1-Day Free Dance Pass
            </button>
          </div>

          {/* Quick Stat Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 max-w-3xl mx-auto border-t border-slate-800/80">
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-pink-400 font-['Outfit']">700 kcal</div>
              <div className="text-[11px] text-slate-400 font-medium">Avg Burn / Session</div>
            </div>
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-white font-['Outfit']">140+ BPM</div>
              <div className="text-[11px] text-slate-400 font-medium">Pumping Playlists</div>
            </div>
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-amber-400 font-['Outfit']">24+</div>
              <div className="text-[11px] text-slate-400 font-medium">Weekly Dance Classes</div>
            </div>
            <div className="p-3.5 neu-pressed-sm rounded-2xl text-center">
              <div className="text-2xl font-black text-white font-['Outfit']">Mon–Sat</div>
              <div className="text-[11px] text-slate-400 font-medium">Morning & Evening Slots</div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Real Zumba & Dance Studio Photo Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="amber">LIVE STUDIO GALLERY</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white font-['Outfit']">
            HIGH-ENERGY DANCE FITNESS
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            Real snapshots from our Zumba dance studio at Sector 29 Cyber Hub, Gurugram.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zumbaPhotos.map((photo, i) => (
            <div
              key={i}
              className="neu-flat group overflow-hidden rounded-3xl border border-slate-800/80 hover:border-pink-500/50 transition-all flex flex-col justify-between"
            >
              <div className="relative h-60 overflow-hidden bg-slate-900">
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-transparent to-transparent opacity-90" />
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-pink-400 font-mono text-[10px] font-bold border border-pink-500/30">
                    STUDIO 1 • CYBER HUB
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-2">
                <h3 className="text-base font-extrabold text-white group-hover:text-pink-400 transition-colors font-['Outfit']">
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

      {/* 3. Dance Cardio Disciplines Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="cyan">CLASS FORMATS</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white font-['Outfit']">
            CHOOSE YOUR DANCE RHYTHM
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-medium">
            From easy-going Latin grooves to calorie-shredding Bollywood cardio, we have sessions for all fitness levels.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {danceDisciplines.map((disc, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl neu-flat space-y-4 flex flex-col justify-between hover:border-pink-500/40 transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-pink-400 bg-pink-500/10 px-2.5 py-1 rounded-xl border border-pink-500/20">
                    {disc.time}
                  </span>
                  <span className="text-[11px] font-bold text-rose-400 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" /> {disc.calories}
                  </span>
                </div>

                <h3 className="text-lg font-black text-white font-['Outfit']">{disc.title}</h3>
                <div className="text-[11px] text-amber-300 font-bold">Intensity: {disc.intensity}</div>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">{disc.desc}</p>
              </div>

              <div className="pt-4 border-t border-slate-800/80">
                <button
                  onClick={() => setCurrentTab('schedule')}
                  className="w-full py-2.5 neu-btn text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-pink-400" /> Book in Timetable
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Benefits of Zumba Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl neu-flat space-y-8 border border-slate-800/80">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge variant="lime">TOTAL BODY WELLNESS</Badge>
            <h2 className="text-2xl sm:text-4xl font-black text-white font-['Outfit']">
              THE SCIENCE BEHIND DANCE CARDIO
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl neu-pressed-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center">
                <Heart className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white font-['Outfit']">Cardiovascular Endurance</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Interval training dance patterns elevate resting heart rates and enhance cardiovascular stamina without the monotony of a treadmill.
              </p>
            </div>

            <div className="p-5 rounded-2xl neu-pressed-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white font-['Outfit']">Endorphin & Mood Elevation</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Dancing releases massive dopamine and endorphin surges, drastically lowering corporate work stress and boosting mental focus.
              </p>
            </div>

            <div className="p-5 rounded-2xl neu-pressed-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white font-['Outfit']">Full-Body Core & Agility</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Multi-directional footwork, hip rotations, and fast arm movements engage core stabilizers and boost physical coordination.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Call To Action Footer Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl neu-flat border-2 border-pink-500/50 shadow-glow-pink text-center space-y-6">
          <Badge variant="amber">RESERVE YOUR SPOT</Badge>
          <h2 className="text-3xl sm:text-5xl font-black text-white font-['Outfit']">
            READY TO DANCE YOUR WAY TO PEAK FITNESS?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto font-medium">
            Unlimited Zumba & dance cardio classes at Cyber Hub starting at just ₹1,499/month. Or choose the Dual All-Access Pass for ₹1,999/month.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setCurrentTab('pricing')}
              className="w-full sm:w-auto px-8 py-4 neu-btn-pink text-white font-extrabold text-sm rounded-2xl shadow-glow-pink transition-all active:scale-95"
            >
              Get Zumba Pass @ ₹1,499/mo
            </button>
            <button
              onClick={() => setCurrentTab('schedule')}
              className="w-full sm:w-auto px-8 py-4 neu-btn text-white font-bold text-sm rounded-2xl"
            >
              Explore Class Timetable
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
