import type React from 'react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// App-mode motion (index.css has the animations). Nothing here moves for people who ask for less motion.

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs a page change as a view transition on the app's own screens (the shell and the welcome panel,
 * which draw .app-backdrop): 'tab' cross-fades, 'push' slides the new page in from the right, 'pop'
 * slides the old one out. On the website, for coaches and admins in the app (website layout), without
 * View Transitions in the WebView or with reduced motion, the page just changes.
 */
export function withViewTransition(kind: 'tab' | 'push' | 'pop', update: () => void): void {
  if (!document.querySelector('.app-backdrop') || typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    update();
    return;
  }
  document.documentElement.dataset.nav = kind;
  document.startViewTransition(() => flushSync(update));
}

/** `target`, counted up from 0 with an ease-out on mount and whenever it changes; at once with reduced motion. */
export function useCountUp(target: number, durationMs = 350): number {
  const [value, setValue] = useState(0);
  const still = prefersReducedMotion();
  useEffect(() => {
    if (still) return;
    let start: number | undefined;
    let frame = requestAnimationFrame(function tick(now) {
      start ??= now;
      const t = Math.min((now - start) / durationMs, 1);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, still]);
  return still ? target : value;
}

/**
 * Numbers a screen's cards for .app-rise's stagger: call the returned function on each top-level card
 * in render (DOM) order and put the result in its style.
 */
export function riseOrder(): () => React.CSSProperties {
  let i = 0;
  return () => ({ '--i': i++ }) as React.CSSProperties;
}
