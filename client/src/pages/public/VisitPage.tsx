import React, { useEffect, useState } from 'react';
import { Clock, Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { useAppConfig } from '../../context/ConfigContext.js';
import { SocialLinks, VisitWebsiteLink, WhatsAppButton } from '../../components/public/ContactLinks.js';
import { GYM_ADDRESS, weekdayOf } from '../../components/public/gymInfo.js';
import { DAY_NAMES, formatClock, formatPhone, gymClockNow, gymToday } from '../../lib/format.js';

// Monday first, as the gym's week runs.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
// A link to another site leaves the app: Capacitor hands it to the Maps app (or the browser).
const DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(GYM_ADDRESS)}`;

/**
 * The app's Visit us page (the website has none): the address with directions in Google Maps, tap to
 * call, email or WhatsApp, the opening hours with whether the gym is open now, at gym time, and the
 * gym's social pages and website. No embedded map, which would load Google's scripts and tracking.
 */
export const VisitPage: React.FC = () => {
  const { hours, contact, website } = useAppConfig().config.gym;
  const hasSocial = Boolean(contact.instagram || contact.facebook || contact.youtube || contact.x);
  // The page can stay open across opening or closing time, or overnight in the background.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  const today = weekdayOf(gymToday(now));
  const clock = gymClockNow(now);
  const openNow = !hours.closedWeekdays.includes(today) && clock >= hours.opensAt && clock < hours.closesAt;

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14 space-y-5">
      <header className="space-y-3">
        <div className="w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <MapPin className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-100 font-heading">Visit us</h1>
      </header>

      <section aria-label="Address" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
        <address className="not-italic flex items-start gap-3 text-sm text-slate-200 font-semibold leading-relaxed">
          <MapPin className="w-5 h-5 text-lime-400 shrink-0 mt-0.5" aria-hidden="true" />
          {GYM_ADDRESS}
        </address>
        <a href={DIRECTIONS} className="neu-btn-lime w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2">
          <Navigation className="w-4 h-4" aria-hidden="true" /> Get directions
        </a>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <a href={`tel:${contact.phone}`} className="neu-btn px-4 py-3 rounded-xl text-sm font-bold text-slate-200 flex items-center gap-3">
            <Phone className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" /> {formatPhone(contact.phone)}
          </a>
          <a href={`mailto:${contact.email}`} className="neu-btn px-4 py-3 rounded-xl text-sm font-bold text-slate-200 flex items-center gap-3 break-all">
            <Mail className="w-4 h-4 text-lime-400 shrink-0" aria-hidden="true" /> {contact.email}
          </a>
          <WhatsAppButton className="sm:col-span-2 justify-center py-3" />
        </div>
      </section>

      {(hasSocial || website) && (
        <section aria-labelledby="visit-follow" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
          <h2 id="visit-follow" className="text-lg font-black text-slate-100 font-heading">
            Follow us
          </h2>
          <SocialLinks />
          <VisitWebsiteLink className="neu-btn w-full justify-center py-3 rounded-xl text-sm" />
        </section>
      )}

      <section aria-labelledby="visit-hours" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id="visit-hours" className="text-lg font-black text-slate-100 font-heading flex items-center gap-2">
            <Clock className="w-5 h-5 text-lime-400" aria-hidden="true" /> Opening hours
          </h2>
          <p className={`text-sm font-black ${openNow ? 'text-lime-400' : 'text-rose-400'}`}>
            {openNow ? `Open now · until ${formatClock(hours.closesAt)}` : 'Closed now'}
          </p>
        </div>
        <dl className="neu-pressed-sm rounded-2xl divide-y divide-slate-800/60 text-sm">
          {WEEK.map(day => {
            const closed = hours.closedWeekdays.includes(day);
            return (
              <div key={day} className={`flex justify-between gap-3 px-4 py-2.5 ${day === today ? 'font-black text-slate-100' : 'text-slate-300'}`}>
                <dt>
                  {DAY_NAMES[day]}
                  {day === today && <span className="sr-only"> (today)</span>}
                </dt>
                <dd className={closed ? 'text-rose-400 font-bold' : ''}>{closed ? 'Closed' : `${formatClock(hours.opensAt)} – ${formatClock(hours.closesAt)}`}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </article>
  );
};
