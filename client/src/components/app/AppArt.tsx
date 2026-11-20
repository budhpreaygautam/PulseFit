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
  className?: string;
}

type Player = { goToAndStop(f: number, isFrame: boolean): void; play(): void; pause(): void; destroy(): void };

const ONCE_MS = 1500;
const MODAL = '[role="dialog"][aria-modal="true"]';

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
export const AppArt: React.FC<AppArtProps> = props => (isAppMode ? <Art {...props} /> : null);

const Art: React.FC<AppArtProps> = ({ scene, size, once = false, playing = true, className = '' }) => {
  const host = useRef<HTMLDivElement>(null);
  const lottie = useRef<{ player: Player; stillFrame: number }>();
  const [marker, setMarker] = useState<string>();
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [onScreen, setOnScreen] = useState(false);
  const [covered, setCovered] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [done, setDone] = useState(false);
  const left = useRef(ONCE_MS);

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
  // and while the app is in the background.
  useEffect(() => {
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
  // of the svg's loops, or the Lottie scene's still frame.
  useEffect(() => {
    const anim = lottie.current;
    if (state === 'playing') anim?.player.play();
    else if (state === 'paused') anim?.player.pause();
    else if (state === 'still') {
      if (anim) anim.player.goToAndStop(anim.stillFrame, true);
      else host.current?.getAnimations({ subtree: true }).forEach(a => (a.currentTime = 0));
    }
  }, [state]);

  return <div ref={host} className={`app-art app-art-${size} ${className}`} data-scene={scene} data-art={marker} data-state={state} aria-hidden="true" />;
};
