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
              <div className="w-10 h-10 rounded-2xl bg-lime-500 flex items-center justify-center text-black font-black">
                <Dumbbell className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="text-2xl font-black text-white font-['Outfit']">
                PULSE<span className="text-lime-400">FIT</span>
              </span>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              Gurugram's premier athletic training club. Olympic lifting bays, high-octane HIIT arenas, recovery hydrotherapy suites, and certified master coaches.
            </p>

            <div className="flex items-center gap-3 pt-2 text-xs text-slate-300">
              <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-lime-400">
                #PULSEFITATHLETICS
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-amber-400">
                @PULSEFIT.GURUGRAM
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-200">
              EXPLORE
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => setCurrentTab('schedule')} className="hover:text-lime-400 transition-colors">
                  Class Timetable
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('pricing')} className="hover:text-lime-400 transition-colors">
                  Membership Plans
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('trainers')} className="hover:text-lime-400 transition-colors">
                  Master Coaches
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('home')} className="hover:text-lime-400 transition-colors">
                  Facilities & Amenities
                </button>
              </li>
            </ul>
          </div>

          {/* Member Portal */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-200">
              MEMBER ZONE
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => setCurrentTab('member-dashboard')} className="hover:text-lime-400 transition-colors">
                  Member Dashboard
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('workout-logger')} className="hover:text-lime-400 transition-colors">
                  Workout Logger & Sets
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('exercise-library')} className="hover:text-lime-400 transition-colors">
                  Exercise Directory
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('admin-dashboard')} className="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  Staff / Admin Suite
                </button>
              </li>
            </ul>
          </div>

          {/* Contact / Location */}
          <div className="space-y-3 text-sm">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-200">
              LOCATION & HOURS
            </h4>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                <span>Plot 42, Sector 29, Near Cyber Hub, Gurugram, Haryana 122002</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-lime-400 shrink-0" />
                <span>+91 98110 PULSE (78573)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-lime-400 shrink-0" />
                <span>contact@pulsefit.in</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-lime-400 shrink-0" />
                <span>Open 24 Hours / 7 Days a Week</span>
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
