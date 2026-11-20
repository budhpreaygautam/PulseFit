import { routeForTab } from '../../routes.js';

// A guest who follows a link to a page that needs an account is asked to sign in first (navigate in
// context/NavigationContext.tsx). The page, with its query (a plan picked on the home page, a class's
// week and day), is kept for this tab only, so that after signing in or creating an account they
// land on it. It belongs to the sign-in dialog opened for it: AuthModal clears it when that dialog
// closes without a sign-in, so it never steers a later, unrelated sign-in.

const KEY = 'pulsefit_pending_page';

export interface PendingPage {
  tab: string;
  params?: Record<string, string>;
}

export function rememberPendingPage(page: PendingPage): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(page));
  } catch {
    /* storage blocked: the visitor just opens the page again */
  }
}

export function clearPendingPage(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing was kept */
  }
}

export function takePendingPage(): PendingPage | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const page = JSON.parse(raw) as PendingPage;
    return typeof page.tab === 'string' && routeForTab(page.tab) ? page : null;
  } catch {
    return null;
  }
}
