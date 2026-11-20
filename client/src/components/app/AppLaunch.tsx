import React, { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { prefersReducedMotion } from '../../lib/appMotion.js';

// Once per start of the app: a remount, or coming back to the app, does not show it again.
let launched = false;

/**
 * The app's launch animation: the logo springs in on the page's background (in the dark theme the
 * colour of Android's launch screen, #0F141D), then it all fades into the page (index.css), in under a
 * second whether or not the account has loaded. It never takes a tap, so it never blocks a dialog, and
 * is hidden from screen readers. Reduced motion gets a short fade. App only (App.tsx).
 */
export const AppLaunch: React.FC = () => {
  const [show, setShow] = useState(!launched);

  useEffect(() => {
    if (!show) return;
    launched = true;
    const timer = setTimeout(() => setShow(false), prefersReducedMotion() ? 250 : 900);
    return () => clearTimeout(timer);
  }, [show]);

  if (!show) return null;
  return (
    <div aria-hidden="true" className="app-launch fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3.5 bg-gym-950 pointer-events-none">
      <span className="app-launch-logo w-16 h-16 rounded-[1.375rem] flex items-center justify-center neu-btn-lime">
        <Dumbbell className="w-8 h-8 stroke-[2.5]" />
      </span>
      <span className="app-launch-name text-2xl font-black tracking-tight text-slate-100 font-heading">
        PULSE<span className="text-lime-400">FIT</span>
      </span>
    </div>
  );
};
