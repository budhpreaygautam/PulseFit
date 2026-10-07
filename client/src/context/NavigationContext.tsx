import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NOT_FOUND_TAB, routeForTab, tabForPath } from '../routes.js';

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
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

function readLocation(): Location {
  return { tab: tabForPath(window.location.pathname), params: new URLSearchParams(window.location.search) };
}

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<Location>(readLocation);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((tab: string, params?: Record<string, string>, options?: { replace?: boolean }) => {
    const route = routeForTab(tab);
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

  useEffect(() => {
    const title = routeForTab(location.tab)?.title ?? 'Page not found';
    document.title = `${title} · PulseFit Athletics`;
  }, [location.tab]);

  const value = useMemo(() => ({ tab: location.tab, params: location.params, navigate }), [location, navigate]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within a NavigationProvider');
  return context;
};
