import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NOT_FOUND_TAB, routeForTab, tabForPath } from '../routes.js';
import { applyPageHead } from '../lib/seo.js';
import { hasSavedSession } from '../lib/authToken.js';
import { rememberPendingPage } from '../components/public/pendingPage.js';

interface Location {
  tab: string;
  params: URLSearchParams;
}

interface NavigationContextType {
  /** Current tab id (see routes.ts), or 'not-found'. */
  tab: string;
  /** Query string of the current URL, e.g. ?date=2026-10-12 on a roster. */
  params: URLSearchParams;
  navigate: (tab: string, params?: Record<string, string>, options?: { replace?: boolean }) => void;
  /** Counts the links to a page that needs an account that a guest has followed; App opens the sign-in dialog. */
  signInRequests: number;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

function readLocation(): Location {
  return { tab: tabForPath(window.location.pathname), params: new URLSearchParams(window.location.search) };
}

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<Location>(readLocation);
  const [signInRequests, setSignInRequests] = useState(0);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((tab: string, params?: Record<string, string>, options?: { replace?: boolean }) => {
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
    if (url !== window.location.pathname + window.location.search) {
      if (options?.replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    }
    setLocation({ tab: route ? route.tab : NOT_FOUND_TAB, params: search });
    window.scrollTo({ top: 0 });
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
