import React from 'react';
import { Clock, Dumbbell, Mail, MapPin, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { homeTabFor } from '../../routes.js';
import { gymToday } from '../../lib/format.js';
import { TabLink } from '../public/TabLink.js';
import { GYM_ADDRESS, GYM_EMAIL, GYM_NAME, GYM_PHONE_DISPLAY, GYM_PHONE_TEL, HOURS_DAYS, HOURS_TIME } from '../public/gymInfo.js';

const EXPLORE = [
  { tab: 'workout', label: 'Strength floor' },
  { tab: 'zumba', label: 'Zumba & Cardio studio' },
  { tab: 'guide', label: 'Training plans & diets' },
  { tab: 'schedule', label: 'Class timetable' },
  { tab: 'pricing', label: 'Memberships' },
  { tab: 'trainers', label: 'Coaches' },
  { tab: 'exercise-library', label: 'Exercise library' }
];

const LEGAL = [
  { tab: 'privacy', label: 'Privacy policy' },
  { tab: 'terms', label: 'Terms of service' },
  { tab: 'refunds', label: 'Refunds & cancellations' }
];

const linkClass = 'hover:text-lime-400 transition-colors font-medium rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500';

export const Footer: React.FC<{ setCurrentTab: (tab: string) => void }> = ({ setCurrentTab }) => {
  const { user } = useAuth();
  const year = gymToday().slice(0, 4);

  const accountLinks = user
    ? [
        { tab: homeTabFor(user.role), label: 'My dashboard' },
        ...(user.role === 'member' ? [{ tab: 'my-bookings', label: 'My bookings' }] : []),
        { tab: 'workout-logger', label: 'Log a workout' },
        { tab: 'profile', label: 'My account' }
      ]
    : [
        { tab: 'pricing', label: 'Become a member' },
        { tab: 'schedule', label: 'Book a class' }
      ];

  return (
    <footer className="bg-gym-950 border-t border-slate-800/80 pt-14 pb-10 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="neu-flat rounded-3xl p-6 sm:p-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center neu-btn-lime">
                <Dumbbell className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
              </span>
              <span className="text-2xl font-black text-slate-100 font-['Outfit']">
                PULSE<span className="text-lime-400">FIT</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm font-medium">
              A single-location gym in Gurugram with a Workout & Strength floor, a Zumba & Cardio studio and coaches who run every class on the timetable.
            </p>
          </div>

          <nav aria-label="Explore" className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">Explore</h2>
            <ul className="space-y-2 text-sm">
              {EXPLORE.map(link => (
                <li key={link.tab}>
                  <TabLink tab={link.tab} navigate={setCurrentTab} className={linkClass}>
                    {link.label}
                  </TabLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Your account" className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">{user ? 'Your account' : 'Get started'}</h2>
            <ul className="space-y-2 text-sm">
              {accountLinks.map(link => (
                <li key={link.tab}>
                  <TabLink tab={link.tab} navigate={setCurrentTab} className={linkClass}>
                    {link.label}
                  </TabLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3 text-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-200 font-mono">Visit us</h2>
            <address className="not-italic space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-slate-300">{GYM_ADDRESS}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" />
                <a href={`tel:${GYM_PHONE_TEL}`} className={`text-slate-300 ${linkClass}`}>
                  {GYM_PHONE_DISPLAY}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" />
                <a href={`mailto:${GYM_EMAIL}`} className={`text-slate-300 ${linkClass}`}>
                  {GYM_EMAIL}
                </a>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="text-slate-300">
                    {HOURS_DAYS}: <span className="text-slate-200 font-bold">{HOURS_TIME}</span>
                  </div>
                  <div className="text-rose-400 font-semibold">Sunday: closed</div>
                </div>
              </div>
            </address>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            © {year} {GYM_NAME}
          </p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {LEGAL.map(link => (
                <li key={link.tab}>
                  <TabLink tab={link.tab} navigate={setCurrentTab} className="hover:text-slate-300 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500">
                    {link.label}
                  </TabLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
};
