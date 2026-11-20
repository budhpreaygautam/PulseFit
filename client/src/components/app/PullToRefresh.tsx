import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/appMotion.js';
import { AppArt } from './AppArt.js';

/** How far the spinner must come down (px) for letting go to refresh, and where it waits meanwhile. */
const THRESHOLD = 70;
const MAX_PULL = 120;
/** The spinner shows at least this long, so a quick refresh still reads as one. */
const MIN_SPIN_MS = 500;
/** A reload that hangs (no answer from the server) stops spinning after this long, as ConfigContext gives up. */
const MAX_SPIN_MS = 8_000;

/** True when the touch began in something that scrolls by itself (a carousel, a table, a list). */
function inScroller(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return true;
    if (/auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/** True while a text field on the page holds something typed: a refresh remounts the page and would lose it. */
const holdsText = (): boolean =>
  [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#main :is(input[type="text"], input[type="search"], textarea)')].some(field => field.value !== '');

/**
 * Pull to refresh, in the app: at the very top of the page, pulling down brings a spinner out from
 * under the header; let go past THRESHOLD and `onRefresh` runs while it spins, else it springs back.
 * Not while a dialog or the menu drawer is open, nor from inside something that scrolls. App.tsx only
 * renders it on pages without a form to fill in, and no pull starts while a text field on the page
 * (a note, a coupon, a search) holds text, so nothing typed is lost.
 */
export const PullToRefresh: React.FC<{ onRefresh: () => Promise<unknown> }> = ({ onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let pull = 0;
    let busy = false;

    const place = (distance: number, settle: boolean) => {
      const spinner = spinnerRef.current;
      if (!spinner) return;
      spinner.style.transition = settle && !prefersReducedMotion() ? 'transform 200ms cubic-bezier(0, 0, 0.2, 1), opacity 200ms' : 'none';
      spinner.style.transform = `translateY(${distance}px) rotate(${distance * 3}deg)`;
      spinner.style.opacity = String(Math.min(1, distance / THRESHOLD));
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || document.querySelector('[role="dialog"]') || inScroller(e.target) || holdsText()) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pulling = false;
      pull = 0;
      // The spinner comes out from under the header, which ends where the page begins.
      if (spinnerRef.current) spinnerRef.current.style.top = `${(document.getElementById('main')?.getBoundingClientRect().top ?? 0) - 48}px`;
      // Only a touch that may become a pull is followed, by a listener that can stop scrolling: any
      // other touch scrolls without waiting for script. It is removed when the touch ends.
      window.addEventListener('touchmove', onMove, { passive: false });
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        // Sideways or upwards is not a pull: leave this touch to the page.
        if (dy <= Math.abs(dx) || window.scrollY > 0) {
          start = null;
          window.removeEventListener('touchmove', onMove);
          return;
        }
        pulling = true;
      }
      // Only while pulling does the page not scroll; every other touch scrolls as usual.
      if (e.cancelable) e.preventDefault();
      pull = Math.min(Math.max(dy, 0) / 2, MAX_PULL);
      place(pull, false);
    };
    const onEnd = () => {
      window.removeEventListener('touchmove', onMove);
      if (!pulling) return;
      start = null;
      pulling = false;
      if (pull < THRESHOLD) return place(0, true);
      busy = true;
      setRefreshing(true);
      place(THRESHOLD, true);
      const minimum = new Promise(resolve => setTimeout(resolve, MIN_SPIN_MS));
      const hung = new Promise(resolve => setTimeout(resolve, MAX_SPIN_MS));
      void Promise.all([Promise.race([onRefreshRef.current().catch(() => undefined), hung]), minimum]).then(() => {
        busy = false;
        setRefreshing(false);
        place(0, true);
      });
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Below the header (z-45), so it slides out from under it.
  return (
    <>
      <div
        ref={spinnerRef}
        aria-hidden="true"
        data-refreshing={refreshing || undefined}
        className="pull-spinner fixed left-1/2 top-0 z-[44] -ml-5 w-10 h-10 rounded-full flex items-center justify-center bg-gym-900 border border-slate-800/80 shadow-lg pointer-events-none opacity-0"
      >
        <AppArt scene="state.loading" size="state" playing={refreshing} className="pull-art" />
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {refreshing ? 'Refreshing' : ''}
      </div>
    </>
  );
};
