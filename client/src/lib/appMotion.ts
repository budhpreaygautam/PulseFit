import { flushSync } from 'react-dom';
import { isAppMode } from './appMode.js';

// Page animations in the app (index.css has them). Nothing moves for people who ask for less motion.

/** True when the phone or browser asks for less motion. */
export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs a page change as a view transition in the app: 'push' slides the new page in from the right,
 * 'pop' slides the old one out, 'tab' (switching bottom tabs) cross-fades; the app bar and tab bar
 * stay still. On the website, without View Transitions in the WebView or with reduced motion, the
 * page just changes.
 */
export function withViewTransition(kind: 'push' | 'pop' | 'tab', update: () => void): void {
  if (!isAppMode || typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    update();
    return;
  }
  document.documentElement.dataset.nav = kind;
  // A second page change during the slide (two quick Backs) skips it, which rejects `ready`: nothing is wrong.
  document.startViewTransition(() => flushSync(update)).ready.catch(() => undefined);
}

/** The card surfaces pages are built from (index.css). */
const CARDS = '.neu-flat, .neu-card, .neu-flat-lg';

/**
 * In the app, the cards in `root` fade and rise into place as they first scroll into view, those
 * arriving together a little after one another, including cards that appear later (data loading, a
 * new page). Only the outermost card moves, never one in a dialog. A card is hidden only once it is
 * watched, and nothing is hidden with reduced motion or without IntersectionObserver. Returns a stop.
 */
export function revealCards(root: HTMLElement): () => void {
  if (!isAppMode || prefersReducedMotion() || typeof IntersectionObserver !== 'function') return () => undefined;
  const seen = new WeakSet<Element>();
  const io = new IntersectionObserver(entries => {
    entries
      .filter(entry => entry.isIntersecting)
      .forEach((entry, i) => {
        const card = entry.target as HTMLElement;
        io.unobserve(card);
        card.style.setProperty('--rise-delay', `${Math.min(i, 6) * 50}ms`);
        // A re-render may have dropped the class already: that card simply shows.
        if (card.classList.contains('card-pending')) card.classList.replace('card-pending', 'card-rise');
      });
  });
  const watch = (node: Node) => {
    if (!(node instanceof Element)) return;
    for (const card of [node, ...node.querySelectorAll(CARDS)]) {
      if (seen.has(card) || !card.matches(CARDS) || card.parentElement?.closest(CARDS) || card.closest('[role="dialog"]')) continue;
      seen.add(card);
      io.observe(card);
      card.classList.add('card-pending');
    }
  };
  // Once risen, the card's own hover and press transforms work again.
  const settle = (e: Event) => {
    const card = e.target as HTMLElement;
    if ((e as AnimationEvent).animationName !== 'card-rise') return;
    card.classList.remove('card-rise');
    card.style.removeProperty('--rise-delay');
  };
  const mo = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(watch)));
  mo.observe(root, { childList: true, subtree: true });
  watch(root);
  root.addEventListener('animationend', settle);
  root.addEventListener('animationcancel', settle);
  return () => {
    mo.disconnect();
    io.disconnect();
    root.removeEventListener('animationend', settle);
    root.removeEventListener('animationcancel', settle);
    // Nothing stays hidden once nothing would reveal it.
    root.querySelectorAll('.card-pending').forEach(card => card.classList.remove('card-pending'));
  };
}
