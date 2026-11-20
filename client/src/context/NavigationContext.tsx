import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NOT_FOUND_TAB, routeForTab, tabForPath } from '../routes.js';
import { applyPageHead } from '../lib/seo.js';
import { hasSavedSession } from '../lib/authToken.js';
import { rememberPendingPage } from '../components/public/pendingPage.js';
import { isTabOpen, tabsFor } from '../components/app/tabs.js';
import { withViewTransition } from '../lib/appMotion.js';
import { isAppMode } from '../lib/appMode.js';
import { useAuth } from './AuthContext.js';

interface Location {
  tab: string;
  params: URLSearchParams;
}

interface NavigationContextType {
  /** Current tab id (see routes.ts), or 'not-found'. */
  tab: string;
  /** Query string of the current URL, e.g. ?date=2026-10-12 on a roster. */
  params: URLSearchParams;
  /** In the app a new page slides in, or a tab's page cross-fades (lib/appMotion.ts), unless `instant` or `replace`. */
  navigate: (tab: string, params?: Record<string, string>, options?: { replace?: boolean; instant?: boolean }) => void;
  /** Counts the links to a page that needs an account that a guest has followed; App opens the sign-in dialog. */
  signInRequests: number;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

function readLocation(): Location {
  const tab = tabForPath(window.location.pathname);
  // The app's own pages (the Pass tab, the drawer's Offers, Visit us and Policies): on the website each
  // is a missing page, not one to sign in for.
  return { tab: routeForTab(tab)?.appOnly && !isAppMode ? NOT_FOUND_TAB : tab, params: new URLSearchParams(window.location.search) };
}

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<Location>(readLocation);
  const [signInRequests, setSignInRequests] = useState(0);
  // The account's bottom tabs and the page open now, read by the handlers below: going to a tab's own
  // page cross-fades, and so does Back from one; any other page slides.
  const { user, isInitializing } = useAuth();
  const tabs = useRef(tabsFor(user, isInitializing));
  tabs.current = tabsFor(user, isInitializing);
  const current = useRef(location);
  current.current = location;

  useEffect(() => {
    // In the app Back renders a frame later (in a view transition), after the browser would restore
    // the scroll, so it would land on the page being left: the app keeps each page's scroll itself.
    if (isAppMode) window.history.scrollRestoration = 'manual';
    // Back (the Android button included) slides the page out, and the page comes back where it was left.
    const onPopState = (e: PopStateEvent) =>
      withViewTransition(isTabOpen(tabs.current, current.current.tab, current.current.params) ? 'tab' : 'pop', () => {
        flushSync(() => setLocation(readLocation()));
        if (isAppMode) window.scrollTo(0, e.state?.y ?? 0);
      });
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((tab: string, params?: Record<string, string>, options?: { replace?: boolean; instant?: boolean }) => {
    const route = routeForTab(tab);
    // Every link and button reaches its page through here, so this is where a guest is stopped: the
    // page is not opened (nor mounted, nor its data or code fetched), the sign-in dialog opens instead,
    // and the page opens after signing in (AuthModal). hasSavedSession is set the moment a sign-in
    // succeeds, before the user state is, so the page that sign-in then opens is let through.
    if (route && route.access !== 'public' && !hasSavedSession()) {
      rememberPendingPage({ tab: route.tab, params });
      setSignInRequests(n => n + 1);
      return;
    }
    const search = params ? new URLSearchParams(params) : new URLSearchParams();
    const path = route ? route.path : '/';
    const url = search.toString() ? `${path}?${search}` : path;
    const samePage = url === window.location.pathname + window.location.search;
    const go = () => {
      // The address is checked again here: in the app this runs a frame later, and a redirect (after
      // signing in) or a second tap may have changed it meanwhile.
      if (url !== window.location.pathname + window.location.search) {
        if (options?.replace) window.history.replaceState(window.history.state, '', url);
        else {
          // The page being left keeps its scroll, for Back (above). Entries pushed here are marked, so
          // the app bar's Back knows this session has an earlier page (the app opens fresh on one).
          if (isAppMode) window.history.replaceState({ ...window.history.state, y: window.scrollY }, '');
          window.history.pushState({ inApp: true }, '', url);
        }
      }
      setLocation({ tab: route ? route.tab : NOT_FOUND_TAB, params: search });
      window.scrollTo({ top: 0 });
    };
    // Signing in and out are instant: a transition renders its page change later, so the old page would
    // first render for the new account (signed out, a gated page opens the sign-in dialog; signed in on
    // the homepage, App redirects to the account's home first). A replace (a redirect, a section of
    // the same page) or the page already open opens no new page, so nothing slides in.
    if (options?.instant || options?.replace || samePage) go();
    else withViewTransition(route && isTabOpen(tabs.current, route.tab, search) ? 'tab' : 'push', go);
  }, []);

  // Title, description, canonical address and robots/Open Graph tags follow the page.
  useEffect(() => {
    applyPageHead(routeForTab(location.tab));
  }, [location.tab]);

  const value = useMemo(() => ({ tab: location.tab, params: location.params, navigate, signInRequests }), [location, navigate, signInRequests]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within a NavigationProvider');
  return context;
};
