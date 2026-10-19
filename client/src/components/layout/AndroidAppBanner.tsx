import React, { useLayoutEffect, useRef, useState } from 'react';
import { Download, Dumbbell, X } from 'lucide-react';
import { useAppConfig } from '../../context/ConfigContext.js';
import { isNativeApp } from '../../lib/native.js';
import { storage } from '../../lib/storage.js';

// "Get the PulseFit app": offered to visitors in an Android browser while the server has an APK to
// hand out (GET /api/config → androidApp). Never on iPhone or desktop, and never inside the app.
// It floats over the bottom of the page, so it moves nothing when it appears; a spacer after the
// page (outside the min-h-screen app root, so nothing above it moves) is kept as tall as the bar,
// wrapped text and open install help included, so the footer's last line can be scrolled clear of
// it. The header sits above it, so an open mobile menu is never covered. Closing it hides it for
// 30 days on this browser.

const DISMISSED_KEY = 'pulsefit_app_banner_dismissed';
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

const isAndroidBrowser = !isNativeApp && /Android/i.test(navigator.userAgent);

function dismissedRecently(): boolean {
  const at = Number(storage.get(DISMISSED_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
}

const megabytes = (bytes: number) => `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;

export const AndroidAppBanner: React.FC = () => {
  const { config } = useAppConfig();
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const [showHelp, setShowHelp] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const app = config.androidApp;
  const shown = isAndroidBrowser && !!app && !dismissed;

  // Size the spacer before the first paint, then follow the bar as it grows or shrinks.
  useLayoutEffect(() => {
    const bar = ref.current;
    const spacer = spacerRef.current;
    if (!shown || !bar || !spacer) return;
    const fit = () => { spacer.style.height = `${bar.offsetHeight}px`; };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [shown]);

  if (!shown) return null;

  const dismiss = () => {
    storage.set(DISMISSED_KEY, String(Date.now()));
    // Focus would otherwise fall back to the top of the page.
    if (ref.current?.contains(document.activeElement)) document.getElementById('main')?.focus({ preventScroll: true });
    setDismissed(true);
  };

  return (
    <>
      <div ref={spacerRef} aria-hidden="true" className="h-28" />
      <aside
        ref={ref}
        aria-label="PulseFit Android app"
        className="app-banner fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
      >
        <div className="glass-bar pointer-events-auto mx-auto max-w-lg rounded-2xl border border-slate-700/60 shadow-[0_-4px_24px_var(--neu-shadow-dark)] p-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center neu-btn-lime">
              <Dumbbell className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-100 leading-tight">Get the PulseFit app</p>
              <p className="text-xs text-slate-400 leading-snug">
                Book classes and show your pass in a tap. Android, {megabytes(app.size)}.
              </p>
            </div>
            <a
              href={app.url}
              download="PulseFit.apk"
              onClick={() => setShowHelp(true)}
              className="neu-btn-lime shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
            >
              <Download className="w-4 h-4" aria-hidden="true" /> Download
            </a>
            <button type="button" onClick={dismiss} aria-label="Close the app download bar" className="neu-icon-btn shrink-0 w-8 h-8">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <details open={showHelp} onToggle={e => setShowHelp(e.currentTarget.open)} className="mt-2 pl-[3.25rem] text-xs text-slate-400">
            <summary className="cursor-pointer w-fit font-semibold text-lime-400 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500">
              How to install
            </summary>
            <p className="mt-1.5 leading-snug">
              Open the downloaded PulseFit.apk. If Android asks, allow installing apps from your browser (Settings → Allow from this
              source), then go back and tap Install.
            </p>
          </details>
        </div>
      </aside>
    </>
  );
};
