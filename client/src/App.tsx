import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Lock, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider, useToast } from './context/ToastContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { ConfigProvider } from './context/ConfigContext.js';
import { NavigationProvider, useNavigation } from './context/NavigationContext.js';
import { canAccess, homeTabFor, routeForTab } from './routes.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { AndroidAppBanner } from './components/layout/AndroidAppBanner.js';
import { AppUpdatePrompt } from './components/app/AppUpdatePrompt.js';
import { AppArt } from './components/app/AppArt.js';
import { AppLaunch } from './components/app/AppLaunch.js';
import { PullToRefresh } from './components/app/PullToRefresh.js';
import { AppTabBar } from './components/app/AppTabBar.js';
import { firstTab, tabsFor } from './components/app/tabs.js';
import type { SceneId } from './lib/appArt.js';
import { isAppMode } from './lib/appMode.js';
import { PageScene } from './components/app/PageScene.js';
import { revealCards } from './lib/appMotion.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { clearPendingPage, rememberPendingPage } from './components/public/pendingPage.js';

// Only the home page ships in the main bundle, so the first visit to / downloads and runs as little
// as possible. Every other page loads on demand; the public ones are also fetched in the background
// once the first page has loaded (see MainAppContent), so moving around the site stays instant. The
// pages that need an account, the six service pages among them, are only fetched once opened.
import { LandingPage } from './pages/public/LandingPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then(m => ({ default: m[name] as React.ComponentType<any> })));

/** Loaders of the public pages and dialogs, fetched in the background after the first page. */
const warmUpLoaders: Array<() => Promise<unknown>> = [];
const publicPage = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) => {
  warmUpLoaders.push(loader);
  return named(loader, name);
};

const WorkoutPage = named(() => import('./pages/public/WorkoutPage.js'), 'WorkoutPage');
const ZumbaPage = named(() => import('./pages/public/ZumbaPage.js'), 'ZumbaPage');
const FitnessGuidePage = named(() => import('./pages/public/FitnessGuidePage.js'), 'FitnessGuidePage');
const SchedulePage = named(() => import('./pages/public/SchedulePage.js'), 'SchedulePage');
const PricingPage = named(() => import('./pages/public/PricingPage.js'), 'PricingPage');
const TrainersPage = named(() => import('./pages/public/TrainersPage.js'), 'TrainersPage');
const ResetPasswordPage = publicPage(() => import('./pages/public/ResetPasswordPage.js'), 'ResetPasswordPage');
const PaymentStatusPage = publicPage(() => import('./pages/public/PaymentStatusPage.js'), 'PaymentStatusPage');
const LegalPage = publicPage(() => import('./pages/public/LegalPage.js'), 'LegalPage');
const ContactPage = publicPage(() => import('./pages/public/ContactPage.js'), 'ContactPage');

// The sign-in and free-trial dialogs load the first time they are opened. As with the QR pass in the
// navbar, React remembers a load that failed, so a failure gets a fresh loader for the next try.
const loadAuthModal = () => import('./pages/public/AuthModal.js');
const loadFreeTrialModal = () => import('./pages/public/FreeTrialModal.js');
const lazyAuthModal = () => lazy(() => loadAuthModal().then(m => ({ default: m.AuthModal })));
const lazyFreeTrialModal = () => lazy(() => loadFreeTrialModal().then(m => ({ default: m.FreeTrialModal })));
warmUpLoaders.push(loadAuthModal, loadFreeTrialModal);

const MemberDashboard = named(() => import('./pages/member/MemberDashboard.js'), 'MemberDashboard');
const MyBookingsPage = named(() => import('./pages/member/MyBookingsPage.js'), 'MyBookingsPage');
const WorkoutLogger = named(() => import('./pages/member/WorkoutLogger.js'), 'WorkoutLogger');
const ExerciseLibraryView = publicPage(() => import('./pages/member/ExerciseLibraryView.js'), 'ExerciseLibraryView');
const MemberProfilePage = named(() => import('./pages/member/MemberProfilePage.js'), 'MemberProfilePage');
const RewardsPage = named(() => import('./pages/member/RewardsPage.js'), 'RewardsPage');
const PassPage = named(() => import('./pages/member/PassPage.js'), 'PassPage');
// The app's own pages, from its menu drawer (not fetched ahead: the website never shows them).
const OffersPage = named(() => import('./pages/public/OffersPage.js'), 'OffersPage');
const VisitPage = named(() => import('./pages/public/VisitPage.js'), 'VisitPage');
const PoliciesPage = named(() => import('./pages/public/PoliciesPage.js'), 'PoliciesPage');
const TrainerDashboard = named(() => import('./pages/trainer/TrainerDashboard.js'), 'TrainerDashboard');
const AdminDashboard = named(() => import('./pages/admin/AdminDashboard.js'), 'AdminDashboard');
const MemberManagement = named(() => import('./pages/admin/MemberManagement.js'), 'MemberManagement');
const IdCardManagement = named(() => import('./pages/admin/IdCardManagement.js'), 'IdCardManagement');
const QuickCheckInScanner = named(() => import('./pages/admin/QuickCheckInScanner.js'), 'QuickCheckInScanner');
const ClassManagement = named(() => import('./pages/admin/ClassManagement.js'), 'ClassManagement');
const PlanManagement = named(() => import('./pages/admin/PlanManagement.js'), 'PlanManagement');
const TrialLeads = named(() => import('./pages/admin/TrialLeads.js'), 'TrialLeads');

// Pull to refresh in the app, only on pages without a form to fill in: refreshing remounts the page,
// which would lose what someone typed; nor while a note or search on them holds text (PullToRefresh).
const PULL_TO_REFRESH_TABS = new Set(['home', 'workout', 'zumba', 'guide', 'schedule', 'pricing', 'trainers', 'exercise-library', 'member-dashboard', 'my-bookings', 'rewards', 'pass', 'offers']);

// At least a screen tall, so the footer stays below the fold while a page loads instead of showing
// and then jumping down when the page arrives (a layout shift).
const PageLoader: React.FC = () => (
  <div className="flex items-start justify-center pt-32 min-h-screen" role="status" aria-live="polite">
    {isAppMode ? <AppArt scene="state.loading" size="state" /> : <div className="w-10 h-10 rounded-full border-4 border-lime-500/30 border-t-lime-400 animate-spin" aria-hidden="true" />}
    <span className="sr-only">Loading…</span>
  </div>
);

const AccessPanel: React.FC<{ icon: React.ReactNode; title: string; body: string; action: string; onAction: () => void; scene?: SceneId }> = ({
  icon,
  title,
  body,
  action,
  onAction,
  scene
}) => (
  <section className="max-w-lg mx-auto my-24 px-6 text-center">
    <div className="neu-flat-lg rounded-3xl p-10 border border-slate-800/80">
      {isAppMode && scene ? <AppArt scene={scene} size="state" /> : <div className="mx-auto mb-5 w-14 h-14 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">{icon}</div>}
      <h1 className="text-2xl font-black text-slate-100 font-heading">{title}</h1>
      <p className="mt-3 text-sm text-slate-400">{body}</p>
      <button type="button" onClick={onAction} className="mt-6 neu-btn-lime px-6 py-3 rounded-xl font-bold text-sm">
        {action}
      </button>
    </div>
  </section>
);

function MainAppContent() {
  const { tab, params, navigate, signInRequests } = useNavigation();
  const { user, isInitializing, isServerUnreachable, retrySessionRestore, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isFreeTrialOpen, setIsFreeTrialOpen] = useState(false);
  // Each dialog stays mounted once it has been opened (AuthModal tidies up when it closes), and is
  // unmounted again only when it could not be loaded.
  const [AuthModal, setAuthModal] = useState(lazyAuthModal);
  const [FreeTrialModal, setFreeTrialModal] = useState(lazyFreeTrialModal);
  const [isAuthModalMounted, setIsAuthModalMounted] = useState(false);
  const [isFreeTrialMounted, setIsFreeTrialMounted] = useState(false);

  const setCurrentTab = useCallback((next: string) => navigate(next), [navigate]);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setIsAuthModalMounted(true);
    setIsAuthModalOpen(true);
  }, []);
  const openFreeTrialModal = useCallback(() => {
    setIsFreeTrialMounted(true);
    setIsFreeTrialOpen(true);
  }, []);

  // A page a guest asked for belongs to the sign-in dialog opened for it, so one left over from before
  // a refresh is dropped (AuthModal used to do this when it mounted closed, on page load).
  useEffect(() => clearPendingPage(), []);

  // A guest followed a link to a page that needs an account: navigate kept them where they were.
  useEffect(() => {
    if (signInRequests > 0) openAuthModal('login');
  }, [signInRequests, openAuthModal]);

  // Once the first page has loaded, fetch the other public pages and the dialogs while the browser is
  // idle, so opening them later does not wait on the network. Skipped offline and on data saver.
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData || !navigator.onLine) return;
    let idle: number | undefined;
    const warmUp = () => {
      const run = () => warmUpLoaders.forEach(load => void load().catch(() => undefined));
      // Safari (and the iOS app's WebView) has no requestIdleCallback.
      idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(run, { timeout: 5_000 }) : window.setTimeout(run, 1_500);
    };
    if (document.readyState === 'complete') warmUp();
    else window.addEventListener('load', warmUp, { once: true });
    return () => {
      window.removeEventListener('load', warmUp);
      if (idle === undefined) return;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  // After signing in from the home page, take people to their own area. Signing in while on
  // a specific page (a class, the pricing page, a protected page) keeps them there. Restoring the
  // saved session on page load is not a sign-in: a signed-in visitor can still open the home page,
  // and a password-reset link opened in a signed-in browser keeps its page and token.
  const previousUserId = useRef<string | null>(null);
  const restoreSettled = useRef(!isInitializing);
  useEffect(() => {
    const previous = previousUserId.current;
    previousUserId.current = user?.id ?? null;
    if (isInitializing) return;
    if (!restoreSettled.current) {
      restoreSettled.current = true;
      // The app starts coaches and admins on their first tab (their dashboard); a deep link keeps its page.
      if (isAppMode && user && user.role !== 'member' && tab === 'home' && params.toString() === '') {
        navigate(firstTab(tabsFor(user, false)), undefined, { replace: true });
      }
      return;
    }
    if (user && !previous && tab === 'home') navigate(homeTabFor(user.role), undefined, { replace: true });
  }, [user, isInitializing, tab, params, navigate]);

  // Pages load their data once, so the page is remounted whenever the signed-in account changes or
  // signs out: nothing from the previous account stays on screen. A guest signing in, or the saved
  // session being restored, keeps the page as it is.
  const [accountGeneration, setAccountGeneration] = useState(0);
  const [lastUserId, setLastUserId] = useState<string | null>(user?.id ?? null);
  if ((user?.id ?? null) !== lastUserId) {
    if (lastUserId !== null) setAccountGeneration(g => g + 1);
    setLastUserId(user?.id ?? null);
  }

  // Pull to refresh remounts the page the same way, so it loads its data again, and reloads the account.
  const [refreshes, setRefreshes] = useState(0);
  const refreshPage = useCallback(() => {
    setRefreshes(n => n + 1);
    return user ? refreshUser() : Promise.resolve();
  }, [user, refreshUser]);

  // A new page moves focus to its heading (or to <main>) and is announced, so keyboard and
  // screen-reader users know the link worked. Not on first load, and not over an open dialog.
  const mainRef = useRef<HTMLElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const lastTab = useRef(tab);
  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    setAnnouncement(routeForTab(tab)?.title ?? 'Page not found');
    const main = mainRef.current;
    if (!main) return;

    // The new page's heading. While a page that loads on demand is on its way, React keeps the
    // previous page in the DOM but hidden (display: none), so only a heading on screen counts.
    const shownHeading = (): HTMLElement | undefined =>
      Array.from(main.querySelectorAll<HTMLElement>('h1')).find(h => h.getClientRects().length > 0);
    // True when focus is settled: on the heading, or left alone because a dialog is open.
    const focusHeading = (): boolean => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
      const heading = shownHeading();
      if (!heading) return false;
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      return true;
    };
    // Signed-in pages load on demand: until the heading arrives, focus waits on <main>, and moves
    // to the heading when it shows up (unless the user has moved on by then). React shows content
    // it had hidden by changing its style, so attribute changes count as well as new elements.
    let observer: MutationObserver | undefined;
    const frame = requestAnimationFrame(() => {
      if (focusHeading()) return;
      main.focus({ preventScroll: true });
      observer = new MutationObserver(() => {
        if (document.activeElement !== main) observer?.disconnect();
        else if (shownHeading()) {
          observer?.disconnect();
          focusHeading();
        }
      });
      observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    });
    const giveUp = setTimeout(() => observer?.disconnect(), 5_000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(giveUp);
      observer?.disconnect();
    };
  }, [tab]);

  // In the app, cards rise into view as the pages show them (lib/appMotion.ts).
  useEffect(() => revealCards(mainRef.current!), []);

  const route = routeForTab(tab);
  // A page that needs an account waits for the saved session: the loader, or the offline panel.
  const restoring = Boolean(route && route.access !== 'public' && isInitializing);
  const showOfflinePanel = restoring && isServerUnreachable;

  // Such a page opened by its address (or back/forward, or a session that ended there) shows "Please
  // sign in" below, never the page, and opens the sign-in dialog for it straight away.
  const needsSignIn = Boolean(route && route.access !== 'public' && !isInitializing && !user);
  useEffect(() => {
    if (!needsSignIn) return;
    rememberPendingPage({ tab, params: Object.fromEntries(params) });
    openAuthModal('login');
    // Once per page: a dialog closed there stays closed until another page needs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSignIn, tab]);

  let page: React.ReactNode;
  if (!route) {
    page = <NotFoundPage setCurrentTab={setCurrentTab} />;
  } else if (showOfflinePanel) {
    page = (
      <AccessPanel
        icon={<WifiOff className="w-6 h-6" aria-hidden="true" />}
        title="Can't reach PulseFit right now"
        body={`You're still signed in. We'll keep trying and open ${route.title.toLowerCase()} as soon as the connection is back.`}
        action="Try again"
        onAction={retrySessionRestore}
        scene="state.offline"
      />
    );
  } else if (restoring) {
    page = <PageLoader />;
  } else if (needsSignIn) {
    page = (
      <AccessPanel
        icon={<Lock className="w-6 h-6" aria-hidden="true" />}
        title="Please sign in"
        body={`Sign in to open ${route.title.toLowerCase()}.`}
        action="Sign in"
        onAction={() => openAuthModal('login')}
      />
    );
  } else if (!canAccess(route, user?.role ?? null)) {
    page = (
      <AccessPanel
        icon={<ShieldAlert className="w-6 h-6" aria-hidden="true" />}
        title="This page isn't for your account"
        body={`${route.title} is only available to ${(route.access as string[]).join(' and ')} accounts.`}
        action="Go to my dashboard"
        onAction={() => navigate(homeTabFor(user!.role))}
      />
    );
  } else {
    page = renderPage(route.tab);
  }

  function renderPage(id: string): React.ReactNode {
    switch (id) {
      case 'home':
        return <LandingPage setCurrentTab={setCurrentTab} onOpenFreeTrialModal={openFreeTrialModal} onOpenAuthModal={openAuthModal} />;
      case 'workout':
        return <WorkoutPage setCurrentTab={setCurrentTab} onOpenFreeTrialModal={openFreeTrialModal} />;
      case 'zumba':
        return <ZumbaPage setCurrentTab={setCurrentTab} onOpenAuthModal={openAuthModal} onOpenFreeTrialModal={openFreeTrialModal} />;
      case 'guide':
        return <FitnessGuidePage setCurrentTab={setCurrentTab} />;
      case 'schedule':
        return <SchedulePage onOpenAuthModal={openAuthModal} />;
      case 'pricing':
        return <PricingPage onOpenFreeTrialModal={openFreeTrialModal} />;
      case 'trainers':
        return <TrainersPage setCurrentTab={setCurrentTab} />;
      case 'exercise-library':
        return <ExerciseLibraryView setCurrentTab={setCurrentTab} />;
      case 'contact':
        return <ContactPage />;
      case 'reset-password':
        return <ResetPasswordPage />;
      case 'payment-status':
        return <PaymentStatusPage onOpenAuthModal={openAuthModal} />;
      case 'privacy':
      case 'terms':
      case 'refunds':
        return <LegalPage kind={id} />;
      case 'offers':
        return <OffersPage onOpenAuthModal={openAuthModal} />;
      case 'visit':
        return <VisitPage />;
      case 'policies':
        return <PoliciesPage />;
      case 'member-dashboard':
        return <MemberDashboard setCurrentTab={setCurrentTab} />;
      case 'my-bookings':
        return <MyBookingsPage />;
      case 'workout-logger':
        return <WorkoutLogger setCurrentTab={setCurrentTab} />;
      case 'rewards':
        return <RewardsPage />;
      case 'pass':
        return <PassPage />;
      case 'profile':
        return <MemberProfilePage setCurrentTab={setCurrentTab} />;
      case 'trainer-dashboard':
        return <TrainerDashboard />;
      case 'admin-dashboard':
        return <AdminDashboard setCurrentTab={setCurrentTab} />;
      case 'admin-members':
        return <MemberManagement />;
      case 'admin-id-cards':
        return <IdCardManagement />;
      case 'admin-scanner':
        return <QuickCheckInScanner />;
      case 'admin-classes':
        return <ClassManagement />;
      case 'admin-plans':
        return <PlanManagement />;
      case 'admin-trials':
        return <TrialLeads />;
      default:
        return <NotFoundPage setCurrentTab={setCurrentTab} />;
    }
  }

  // In the app the sides keep clear of a landscape phone's side nav bar and camera cutout (not on the
  // website, where iOS Safari reports side insets too).
  return (
    <div
      className={`min-h-screen flex flex-col overflow-x-clip pt-[env(safe-area-inset-top)] ${
        isAppMode ? 'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]' : ''
      } bg-gym-950 text-slate-100`}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] neu-btn-lime px-4 py-2 rounded-lg text-sm font-bold">
        Skip to content
      </a>
      <Navbar currentTab={tab} setCurrentTab={setCurrentTab} onOpenAuthModal={openAuthModal} onOpenFreeTrialModal={openFreeTrialModal} />

      {isServerUnreachable && !showOfflinePanel && (
        <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-300">
              <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              Can't reach PulseFit right now. You're still signed in, and we'll reconnect on our own.
            </p>
            <button type="button" onClick={retrySessionRestore} className="neu-btn px-3 py-1.5 rounded-lg text-xs font-bold text-slate-200 inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Try again
            </button>
          </div>
        </div>
      )}

      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 outline-none">
        {/* A page that fails (one that loads on demand and could not be fetched, or a crash) shows
            this panel instead of emptying the whole app. Moving to another page tries again. The page's
            scene goes with the page, so the loader and the offline and "didn't load" panels show only
            their own scene; the panels with just an icon keep the page's scene. */}
        <ErrorBoundary
          resetKey={`${accountGeneration}:${refreshes}:${tab}`}
          fallback={
            <AccessPanel
              icon={<AlertTriangle className="w-6 h-6" aria-hidden="true" />}
              title="This page didn't load"
              body="Something went wrong while opening it. Check your connection, then reload the page to try again."
              action="Reload page"
              onAction={() => window.location.reload()}
              scene="state.error"
            />
          }
        >
          <Suspense key={`${accountGeneration}:${refreshes}`} fallback={<PageLoader />}>
            {isAppMode && !restoring && <PageScene tab={tab} />}
            {page}
          </Suspense>
        </ErrorBoundary>
      </main>

      {isAppMode && PULL_TO_REFRESH_TABS.has(tab) && <PullToRefresh onRefresh={refreshPage} />}
      {isAppMode && <AppTabBar onSignIn={() => openAuthModal('login')} />}

      <div id="route-announcer" className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* A dialog that cannot be fetched says so in a toast and leaves the page as it was, rather
          than reaching the app-wide error screen. */}
      {isAuthModalMounted && (
        <ErrorBoundary
          fallback={null}
          onError={() => {
            setIsAuthModalOpen(false);
            setIsAuthModalMounted(false);
            setAuthModal(() => lazyAuthModal());
            showToast("Couldn't open sign-in. Check your connection, then reload the page and try again.", 'error');
          }}
        >
          <Suspense fallback={null}>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />
          </Suspense>
        </ErrorBoundary>
      )}

      {isFreeTrialMounted && (
        <ErrorBoundary
          fallback={null}
          onError={() => {
            setIsFreeTrialOpen(false);
            setIsFreeTrialMounted(false);
            setFreeTrialModal(() => lazyFreeTrialModal());
            showToast("Couldn't open the free-trial form. Check your connection, then reload the page and try again.", 'error');
          }}
        >
          <Suspense fallback={null}>
            <FreeTrialModal
              isOpen={isFreeTrialOpen}
              onClose={() => setIsFreeTrialOpen(false)}
              onRegisterInstead={() => {
                setIsFreeTrialOpen(false);
                openAuthModal('register');
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* No footer in the app: the menu drawer (AppDrawer), with its Visit us and Policies & terms pages, and the bottom tabs take its place. */}
      {!isAppMode && <Footer setCurrentTab={setCurrentTab} />}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfigProvider>
        <AuthProvider>
          <ThemeProvider>
            <NavigationProvider>
              <MainAppContent />
              {/* After the app root: its spacer then adds to the end of the page and moves nothing. */}
              <AndroidAppBanner />
              <AppUpdatePrompt />
              {isAppMode && <AppLaunch />}
            </NavigationProvider>
          </ThemeProvider>
        </AuthProvider>
      </ConfigProvider>
    </ToastProvider>
  );
}
