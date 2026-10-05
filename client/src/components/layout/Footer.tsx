import React from 'react';
import { Dumbbell, MapPin, Phone, Mail, Clock, ShieldCheck } from 'lucide-react';

export const Footer: React.FC<{ setCurrentTab: (tab: string) => void }> = ({ setCurrentTab }) => {
  return (
    <footer className="bg-gym-950 border-t border-slate-800/80 pt-16 pb-12 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800/80">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-lime-500 flex items-center justify-center text-black font-black neu-btn-lime shadow-glow-lime">
                <Dumbbell className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="text-2xl font-black text-white font-['Outfit']">
                PULSE<span className="text-lime-400">FIT</span>
              </span>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed max-w-sm font-medium">
              Gurugram's premier athletic training club. Dedicated Workout & Strength floors, high-energy Zumba & Cardio dance studios, and certified coaching staff.
            </p>

            <div className="flex items-center gap-3 pt-2 text-xs text-slate-300">
              <span className="px-3 py-1.5 rounded-xl font-mono text-lime-400 neu-pressed-sm border border-lime-500/20">
                #PULSEFITATHLETICS
              </span>
              <span className="px-3 py-1.5 rounded-xl font-mono text-amber-400 neu-pressed-sm border border-amber-500/20">
                @PULSEFIT.GURUGRAM
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">
              EXPLORE
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => setCurrentTab('workout')} className="hover:text-lime-400 transition-colors font-medium">
                  Strength Floor & Racks
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('zumba')} className="hover:text-pink-400 transition-colors font-medium">
                  Zumba Dance Studio
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('guide')} className="hover:text-amber-400 transition-colors font-medium">
                  Workout Plans & Diet Charts
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('schedule')} className="hover:text-lime-400 transition-colors font-medium">
                  Class Timetable
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('pricing')} className="hover:text-lime-400 transition-colors font-medium">
                  Membership Plans
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('trainers')} className="hover:text-lime-400 transition-colors font-medium">
                  Master Coaches
                </button>
              </li>
            </ul>
          </div>

          {/* Member Portal */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">
              MEMBER ZONE
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => setCurrentTab('member-dashboard')} className="hover:text-lime-400 transition-colors font-medium">
                  Member Dashboard
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('workout-logger')} className="hover:text-lime-400 transition-colors font-medium">
                  Workout Logger & Sets
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('exercise-library')} className="hover:text-lime-400 transition-colors font-medium">
                  Exercise Directory
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('admin-dashboard')} className="hover:text-cyan-400 transition-colors flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  Staff / Admin Suite
                </button>
              </li>
            </ul>
          </div>

          {/* Contact / Location */}
          <div className="space-y-3 text-sm">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">
              LOCATION & HOURS
            </h4>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                <span className="text-xs text-slate-300">Plot 42, Sector 29, Near Cyber Hub, Gurugram, Haryana 122002</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-lime-400 shrink-0" />
                <span className="text-xs text-slate-300">+91 98110 PULSE (78573)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-lime-400 shrink-0" />
                <span className="text-xs text-slate-300">contact@pulsefit.in</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div>Mon – Sat: <span className="text-slate-200 font-bold">6:00 AM – 10:00 PM</span></div>
                  <div className="text-rose-400 font-semibold">Sunday: Rest Day (Facility Closed)</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© 2026 PulseFit Athletics Pvt. Ltd. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</a>
            <a href="#terms" className="hover:text-slate-300 transition-colors">Terms of Service</a>
            <a href="#security" className="hover:text-slate-300 transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
