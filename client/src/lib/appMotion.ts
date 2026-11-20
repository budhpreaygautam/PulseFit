import { flushSync } from 'react-dom';
import { isAppMode } from './appMode.js';

// Page animations in the app (index.css has them). Nothing moves for people who ask for less motion.

/**
 * Runs a page change as a view transition in the app: 'push' slides the new page in from the right,
 * 'pop' slides the old one out; the header stays still. On the website, without View Transitions in
 * the WebView or with reduced motion, the page just changes.
 */
export function withViewTransition(kind: 'push' | 'pop', update: () => void): void {
  if (!isAppMode || typeof document.startViewTransition !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  document.documentElement.dataset.nav = kind;
  // A second page change during the slide (two quick Backs) skips it, which rejects `ready`: nothing is wrong.
  document.startViewTransition(() => flushSync(update)).ready.catch(() => undefined);
}
