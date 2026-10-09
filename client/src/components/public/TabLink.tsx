import React from 'react';
import { routeForTab } from '../../routes.js';

interface TabLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  tab: string;
  params?: Record<string, string>;
  navigate: (tab: string, params?: Record<string, string>) => void;
  isCurrent?: boolean;
}

/**
 * A real link to an app page: it has an href (so it can be opened in a new tab or copied) but a
 * plain click navigates in place.
 */
export const TabLink: React.FC<TabLinkProps> = ({ tab, params, navigate, isCurrent, onClick, children, ...rest }) => {
  const path = routeForTab(tab)?.path ?? '/';
  const search = params ? `?${new URLSearchParams(params)}` : '';
  return (
    <a
      {...rest}
      href={`${path}${search}`}
      aria-current={isCurrent ? 'page' : undefined}
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(tab, params);
      }}
    >
      {children}
    </a>
  );
};
