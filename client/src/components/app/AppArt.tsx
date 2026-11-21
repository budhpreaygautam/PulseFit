import React, { useEffect, useRef, useState } from 'react';
import type { SceneId } from '../../lib/appArt.js';
import { isAppMode } from '../../lib/appMode.js';
import { prefersReducedMotion } from '../../lib/appMotion.js';

interface AppArtProps {
  scene: SceneId;
  size: 'page' | 'moment' | 'state' | 'launch';
  /** A result: plays for 1500 ms at most, then holds its still for good. */
  once?: boolean;
  /** false holds the still. */
  playing?: boolean;
  /** false: it moves on while the page scrolls (the pull-to-refresh spinner, which would look stuck). */
  holdOnScroll?: boolean;
  className?: string;
}

type Player = { goToAndStop(f: number, isFrame: boolean): void; play(): void; pause(): void; destroy(): void };

const ONCE_MS = 1500;
const MODAL = '[role="dialog"][aria-modal="true"]';

/** Playing Lottie scenes that hold on a scroll, told when a scroll starts (true) and when it has stopped (false). */
const scrollFollowers = new Set<(scrolling: boolean) => void>();
let scrollWatched = false;
let scrollEnd: number | undefined;
const isScrolling = () => scrollEnd !== undefined;

/**
 * A scene holds still while anything scrolls, until 200 ms after the last scroll event: a moving scene
 * makes the WebView repaint its svg on every frame of the scroll. Not a once-only scene (its 1500 ms would
 * run out held) nor the pull-to-refresh spinner. html[data-scrolling] marks the scroll; the svg scenes
 * are paused by their own data-held (index.css): a style rule keyed on <html> would restyle the whole
 * page at every start and stop (traced on the Timetable: 2,234 elements each time). One listener for
 * the whole app, from the first scene on.
 */
function watchScroll() {
  if (scrollWatched) return;
  scrollWatched = true;
  const root = document.documentElement;
  // Only a playing scene: holding one already paused would restyle it for nothing.
  const hold = (held: boolean) =>
    document.querySelectorAll(held ? '.app-art[data-hold][data-state="playing"]' : '[data-held]').forEach(el => el.toggleAttribute('data-held', held));
  const onScroll = () => {
    if (scrollEnd === undefined) {
      root.dataset.scrolling = '';
      hold(true);
      scrollFollowers.forEach(follow => follow(true));
    }
    window.clearTimeout(scrollEnd);
    scrollEnd = window.setTimeout(() => {
      scrollEnd = undefined;
      delete root.dataset.scrolling;
      hold(false);
      scrollFollowers.forEach(follow => follow(false));
    }, 200);
  };
  // Capture: scrolling inside a container counts too.
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
}

/**
 * Scopes a scene's CSS to its own box: every rule applies only inside [data-scene="<id>"]. `:is()` keeps
 * selectors that start above the scene (`.light .x`, the theme overrides) working.
 * shortcut: a rule with a pseudo-element is not valid inside :is() and stays unscoped; scenes have none.
 */
function scopeCss(css: string, id: SceneId): string {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const scope = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) rule.selectorText = `[data-scene="${id}"] :is(${rule.selectorText})`;
      else if (rule instanceof CSSGroupingRule) scope(rule.cssRules);
    }
  };
  scope(sheet.cssRules);
  return Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
}

/**
 * One of the app's cartoons (client/app-art, module @app-art), loaded on demand. Decorative: hidden from
 * screen readers and taps. It moves only while someone can see it (on screen, under no dialog, the app
 * in front) and holds a still frame with reduced motion; a scene that cannot load collapses to nothing.
 * Nothing at all on the website.
 */
// Keyed: another scene (or once) is a fresh Art, so a once-only scene gets its own 1500 ms.
export const AppArt: React.FC<AppArtProps> = props => (isAppMode ? <Art key={`${props.scene} ${Boolean(props.once)}`} {...props} /> : null);

const Art: React.FC<AppArtProps> = ({ scene, size, once = false, playing = true, holdOnScroll = true, className = '' }) => {
  const host = useRef<HTMLDivElement>(null);
  const lottie = useRef<{ player: Player; stillFrame: number }>();
  const [marker, setMarker] = useState<string>();
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [onScreen, setOnScreen] = useState(false);
  const [covered, setCovered] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [done, setDone] = useState(false);
  const left = useRef(ONCE_MS);
  const holds = holdOnScroll && !once;

  const state =
    load !== 'ready' ? load : prefersReducedMotion() || !playing || done ? 'still' : onScreen && !covered && !hidden ? 'playing' : 'paused';

  useEffect(() => {
    const el = host.current!;
    let live = true;
    setLoad('loading');
    import('@app-art')
      .then(async art => {
        if (live) setMarker(art.marker);
        const s = await art.loadScene(scene);
        if (!s) throw new Error(`no scene ${scene}`);
        if (s.kind === 'svg') {
          if (live) el.innerHTML = `${s.svg}<style>${scopeCss(s.css, scene)}</style>`;
          return;
        }
        const lottieWeb = await art.loadLottie();
        if (!live) return;
        const player = lottieWeb.loadAnimation({ container: el, renderer: 'svg', loop: !once, autoplay: false, animationData: s.data });
        lottie.current = { player, stillFrame: s.stillFrame };
      })
      // Decorative: a scene that cannot load is simply left out, without an error.
      .then(() => live && setLoad('ready'), () => live && setLoad('missing'));
    return () => {
      live = false;
      lottie.current?.player.destroy();
      lottie.current = undefined;
      el.replaceChildren();
    };
  }, [scene, once]);

  // Paused off screen, under a dialog (re-checked as focus moves, and every 500 ms while one is open)
  // and while the app is in the background. Held still while the page scrolls (watchScroll).
  useEffect(() => {
    watchScroll();
    const el = host.current!;
    const io = new IntersectionObserver(entries => setOnScreen(entries[entries.length - 1].isIntersecting));
    io.observe(el);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    let poll: number | undefined;
    const checkDialogs = () => {
      const dialogs = Array.from(document.querySelectorAll(MODAL));
      setCovered(dialogs.some(dialog => !dialog.contains(el)));
      if (dialogs.length && poll === undefined) poll = window.setInterval(checkDialogs, 500);
      if (!dialogs.length && poll !== undefined) {
        window.clearInterval(poll);
        poll = undefined;
      }
    };
    checkDialogs();
    document.addEventListener('focusin', checkDialogs);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusin', checkDialogs);
      window.clearInterval(poll);
    };
  }, []);

  // A once-only scene plays 1500 ms in all, however often it is paused, then holds its still.
  useEffect(() => {
    if (!once || state !== 'playing') return;
    const start = performance.now();
    const timer = window.setTimeout(() => setDone(true), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current -= performance.now() - start;
    };
  }, [once, state]);

  // The svg scenes run on CSS (index.css pauses them); Lottie scenes are told. A still is the first frame
  // of the svg's loops, or the Lottie scene's still frame. A scene that does not hold plays through a scroll.
  useEffect(() => {
    // A scene that starts playing mid-scroll (it came into view, or loaded) is held at once, like the others.
    if (state === 'playing' && holds && isScrolling()) host.current?.toggleAttribute('data-held', true);
    const anim = lottie.current;
    if (state === 'playing' && anim && holds) {
      const follow = (scrolling: boolean) => {
        if (lottie.current !== anim) return; // destroyed with its scene
        if (scrolling) anim.player.pause();
        else anim.player.play();
      };
      follow(isScrolling());
      scrollFollowers.add(follow);
      return () => void scrollFollowers.delete(follow);
    }
    if (state === 'playing') anim?.player.play();
    else if (state === 'paused') anim?.player.pause();
    else if (state === 'still') {
      if (anim) anim.player.goToAndStop(anim.stillFrame, true);
      else host.current?.getAnimations({ subtree: true }).forEach(a => (a.currentTime = 0));
    }
  }, [state, holds]);

  return (
    <div
      ref={host}
      className={['app-art', `app-art-${size}`, className].filter(Boolean).join(' ')}
      data-scene={scene}
      data-art={marker}
      data-state={state}
      data-hold={holds || undefined}
      aria-hidden="true"
    />
  );
};
