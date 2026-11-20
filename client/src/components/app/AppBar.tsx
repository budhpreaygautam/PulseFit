import React from 'react';
import { ArrowLeft, Dumbbell, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { routeForTab } from '../../routes.js';
import { firstTab, isTabOpen, tabsFor } from './tabs.js';

interface AppBarProps {
  menuOpen: boolean;
  onOpenMenu: () => void;
  /** The buttons at the right (Navbar's QR pass, Free pass or account link). */
  children: React.ReactNode;
}

const iconButton = 'neu-icon-btn w-11 h-11 rounded-xl flex items-center justify-center text-slate-200 shrink-0';

/**
 * The app's slim bar in place of the website header (Navbar renders it in app mode): ☰ opens the menu
 * drawer on a tab's own page, ← goes back on any other; then the page's title. It stays still while
 * pages slide (its view-transition name).
 */
export const AppBar: React.FC<AppBarProps> = ({ menuOpen, onOpenMenu, children }) => {
  const { user, isInitializing } = useAuth();
  const { tab, params, navigate } = useNavigation();
  const tabs = tabsFor(user, isInitializing);
  const showBack = tabs.length > 0 && !isTabOpen(tabs, tab, params);
  const isHome = tab === 'home';

  // Back to this session's previous page; with none (the app opened on this one) to the account's first tab.
  const goBack = () => (window.history.state?.inApp ? window.history.back() : navigate(firstTab(tabs), undefined, { replace: true }));

  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-[45] glass-bar border-b border-slate-800/60 shadow-[0_4px_16px_var(--neu-shadow-dark)] transition-colors [view-transition-name:app-header]">
      <div className="h-14 px-3 flex items-center gap-3">
        {showBack ? (
          <button type="button" onClick={goBack} aria-label="Back" className={iconButton}>
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={onOpenMenu} aria-haspopup="dialog" aria-expanded={menuOpen} aria-label="Open menu" className={iconButton}>
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        {isHome && (
          <span className="w-9 h-9 rounded-xl flex items-center justify-center neu-btn-lime shrink-0" aria-hidden="true">
            <Dumbbell className="w-[18px] h-[18px] stroke-[2.5]" />
          </span>
        )}
        {/* Not a heading: the page keeps its own h1. */}
        <span className="min-w-0 flex-1 truncate text-lg font-black tracking-tight text-slate-100 font-heading">
          {isHome ? 'PulseFit' : routeForTab(tab)?.title ?? 'Page not found'}
        </span>
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      </div>
    </header>
  );
};
