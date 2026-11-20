import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { prefersReducedMotion } from '../../lib/appMotion.js';
import { TabLink } from '../public/TabLink.js';
import { isTabOpen, tabsFor } from './tabs.js';

const tabClass =
  'flex-1 min-w-0 max-w-[10.5rem] h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500';

/**
 * True while the on-screen keyboard is up: a text field has focus and the visible screen is clearly
 * shorter than it has been at this width (a rotation starts over). Pinch zoom does not count.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let width = window.innerWidth;
    let tallest = 0;
    const check = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        tallest = 0;
      }
      const height = viewport.height * viewport.scale;
      tallest = Math.max(tallest, height);
      const typing = document.activeElement?.matches('input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"]), textarea, select, [contenteditable="true"]');
      setOpen(Boolean(typing) && height < tallest - 120);
    };
    check();
    viewport.addEventListener('resize', check);
    return () => viewport.removeEventListener('resize', check);
  }, []);
  return open;
}

/**
 * The app's bottom tabs (App.tsx), each account's own (tabs.ts). The open tab is marked, and tapping it
 * again scrolls its page to the top. The guests' Sign in tab opens the sign-in dialog. Hidden while the
 * keyboard is up; the page keeps clear of it (index.css).
 */
export const AppTabBar: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const { user, isInitializing } = useAuth();
  const { tab, params, navigate } = useNavigation();
  const keyboardOpen = useKeyboardOpen();
  const tabs = tabsFor(user, isInitializing);
  if (tabs.length === 0) return null;

  const icon = (Icon: React.ComponentType<{ className?: string }>, open: boolean) => (
    <span className={`w-16 h-8 rounded-full flex items-center justify-center transition-colors ${open ? 'bg-lime-500/25 text-lime-400' : ''}`}>
      <Icon className="w-5 h-5" aria-hidden="true" />
    </span>
  );

  return (
    <nav aria-label="Tabs" className={`app-tabbar fixed inset-x-0 bottom-0 z-40 items-center justify-center glass-bar border-t border-slate-800/60 ${keyboardOpen ? 'hidden' : 'flex'}`}>
      {tabs.map(t => {
        if (!('tab' in t)) {
          return (
            <button key={t.action} type="button" onClick={onSignIn} aria-haspopup="dialog" className={`${tabClass} text-slate-400`}>
              {icon(t.icon, false)}
              {t.label}
            </button>
          );
        }
        const open = t.tab === tab && isTabOpen(tabs, tab, params);
        return (
          <TabLink
            key={t.tab}
            tab={t.tab}
            navigate={navigate}
            isCurrent={open}
            onClick={e => {
              if (!open) return;
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            }}
            className={`${tabClass} ${open ? 'text-slate-100' : 'text-slate-400'}`}
          >
            {icon(t.icon, open)}
            {t.label}
          </TabLink>
        );
      })}
    </nav>
  );
};
