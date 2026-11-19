import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext.js';
import { routeForTab } from '../../routes.js';
import { TabLink } from '../public/TabLink.js';
import { isTabRoot, type AppTab } from './tabs.js';

const tabClass =
  'flex-1 h-[50px] pt-1.5 flex flex-col items-center gap-[5px] text-[10px] font-bold rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500';

/**
 * The app's frame in app mode (App.tsx), in place of the website's header and footer: the handoff's
 * backdrop glows, a title bar with Back on every screen that is not a tab's own, and the tab bar.
 * An action tab (the guests' Sign in) calls onSignIn.
 */
export const AppShell: React.FC<{ tabs: AppTab[]; onSignIn?: () => void; children: React.ReactNode }> = ({ tabs, onSignIn, children }) => {
  const { tab, params, navigate } = useNavigation();
  const atTabRoot = isTabRoot(tabs, tab, params);
  const firstTab = tabs.find(t => 'tab' in t);
  const homeTab = firstTab && 'tab' in firstTab ? firstTab.tab : 'home';
  // Back to the previous page of this app session; with none (a reload, a deep link) it goes to the first tab.
  const goBack = () => (window.history.state?.inApp ? window.history.back() : navigate(homeTab, undefined, { replace: true }));

  return (
    <>
      <div className="app-backdrop" aria-hidden="true" />
      {/* Behind the phone's status bar, as on the website. */}
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] glass-bar" />
      {!atTabRoot && (
        <header className="sticky top-[env(safe-area-inset-top)] z-[45] h-12 glass-bar border-b border-slate-800/60 flex items-center gap-1 pl-1 pr-5">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[color:var(--app-tx)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          {/* Not a heading: the page keeps its own h1. */}
          <span className="font-heading font-extrabold text-[15px] text-[color:var(--app-tx)] truncate">{routeForTab(tab)?.title}</span>
        </header>
      )}
      <div className="app-content">{children}</div>
      <nav aria-label="Tabs" className="app-tabbar fixed inset-x-0 bottom-0 z-40 flex">
        {tabs.map(t =>
          'tab' in t ? (
            <TabLink key={t.tab} tab={t.tab} navigate={navigate} isCurrent={atTabRoot && t.tab === tab} className={tabClass}>
              <t.icon className="w-[17px] h-[17px]" />
              {t.label}
            </TabLink>
          ) : (
            <button key={t.action} type="button" onClick={onSignIn} aria-haspopup="dialog" className={tabClass}>
              <t.icon className="w-[17px] h-[17px]" />
              {t.label}
            </button>
          )
        )}
      </nav>
    </>
  );
};
