import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Lock, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider } from './context/ToastContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { ConfigProvider } from './context/ConfigContext.js';
import { NavigationProvider, useNavigation } from './context/NavigationContext.js';
import { canAccess, homeTabFor, routeForTab } from './routes.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

// Public pages ship in the main bundle; signed-in areas load on demand.
import { LandingPage } from './pages/public/LandingPage.js';
import { WorkoutPage } from './pages/public/WorkoutPage.js';
import { ZumbaPage } from './pages/public/ZumbaPage.js';
import { FitnessGuidePage } from './pages/public/FitnessGuidePage.js';
import { SchedulePage } from './pages/public/SchedulePage.js';
import { PricingPage } from './pages/public/PricingPage.js';
import { TrainersPage } from './pages/public/TrainersPage.js';
import { AuthModal } from './pages/public/AuthModal.js';
import { FreeTrialModal } from './pages/public/FreeTrialModal.js';
import { ResetPasswordPage } from './pages/public/ResetPasswordPage.js';
import { LegalPage } from './pages/public/LegalPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then(m => ({ default: m[name] as React.ComponentType<any> })));

const MemberDashboard = named(() => import('./pages/member/MemberDashboard.js'), 'MemberDashboard');
const MyBookingsPage = named(() => import('./pages/member/MyBookingsPage.js'), 'MyBookingsPage');
const WorkoutLogger = named(() => import('./pages/member/WorkoutLogger.js'), 'WorkoutLogger');
const ExerciseLibraryView = named(() => import('./pages/member/ExerciseLibraryView.js'), 'ExerciseLibraryView');
const MemberProfilePage = named(() => import('./pages/member/MemberProfilePage.js'), 'MemberProfilePage');
const TrainerDashboard = named(() => import('./pages/trainer/TrainerDashboard.js'), 'TrainerDashboard');
const AdminDashboard = named(() => import('./pages/admin/AdminDashboard.js'), 'AdminDashboard');
const MemberManagement = named(() => import('./pages/admin/MemberManagement.js'), 'MemberManagement');
const QuickCheckInScanner = named(() => import('./pages/admin/QuickCheckInScanner.js'), 'QuickCheckInScanner');
const ClassManagement = named(() => import('./pages/admin/ClassManagement.js'), 'ClassManagement');
const PlanManagement = named(() => import('./pages/admin/PlanManagement.js'), 'PlanManagement');
const TrialLeads = named(() => import('./pages/admin/TrialLeads.js'), 'TrialLeads');

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center py-32" role="status" aria-live="polite">
    <div className="w-10 h-10 rounded-full border-4 border-lime-500/30 border-t-lime-400 animate-spin" aria-hidden="true" />
    <span className="sr-only">Loading…</span>
  </div>
);

const AccessPanel: React.FC<{ icon: React.ReactNode; title: string; body: string; action: string; onAction: () => void }> = ({
  icon,
  title,
  body,
  action,
  onAction
}) => (
  <section className="max-w-lg mx-auto my-24 px-6 text-center">
    <div className="neu-flat-lg rounded-3xl p-10 border border-slate-800/80">
      <div className="mx-auto mb-5 w-14 h-14 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">{icon}</div>
      <h1 className="text-2xl font-black text-slate-100 font-['Outfit']">{title}</h1>
      <p className="mt-3 text-sm text-slate-400">{body}</p>
      <button type="button" onClick={onAction} className="mt-6 neu-btn-lime px-6 py-3 rounded-xl font-bold text-sm">
        {action}
      </button>
    </div>
  </section>
);

function MainAppContent() {
  const { tab, navigate } = useNavigation();
  const { user, isInitializing, isServerUnreachable, retrySessionRestore } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isFreeTrialOpen, setIsFreeTrialOpen] = useState(false);

  const setCurrentTab = useCallback((next: string) => navigate(next), [navigate]);

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  }, []);
  const openFreeTrialModal = useCallback(() => setIsFreeTrialOpen(true), []);

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
      return;
    }
    if (user && !previous && tab === 'home') navigate(homeTabFor(user.role), undefined, { replace: true });
  }, [user, isInitializing, tab, navigate]);

  // Pages load their data once, so the page is remounted whenever the signed-in account changes or
  // signs out: nothing from the previous account stays on screen. A guest signing in, or the saved
  // session being restored, keeps the page as it is.
  const [accountGeneration, setAccountGeneration] = useState(0);
  const [lastUserId, setLastUserId] = useState<string | null>(user?.id ?? null);
  if ((user?.id ?? null) !== lastUserId) {
    if (lastUserId !== null) setAccountGeneration(g => g + 1);
    setLastUserId(user?.id ?? null);
  }

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

  const route = routeForTab(tab);
  const showOfflinePanel = Boolean(route && route.access !== 'public' && isInitializing && isServerUnreachable);

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
      />
    );
  } else if (route.access !== 'public' && isInitializing) {
    page = <PageLoader />;
  } else if (route.access !== 'public' && !user) {
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
        return <WorkoutPage setCurrentTab={setCurrentTab} onOpenAuthModal={openAuthModal} onOpenFreeTrialModal={openFreeTrialModal} />;
      case 'zumba':
        return <ZumbaPage setCurrentTab={setCurrentTab} onOpenAuthModal={openAuthModal} onOpenFreeTrialModal={openFreeTrialModal} />;
      case 'guide':
        return <FitnessGuidePage setCurrentTab={setCurrentTab} />;
      case 'schedule':
        return <SchedulePage onOpenAuthModal={openAuthModal} />;
      case 'pricing':
        return <PricingPage onOpenAuthModal={openAuthModal} onOpenFreeTrialModal={openFreeTrialModal} />;
      case 'trainers':
        return <TrainersPage setCurrentTab={setCurrentTab} />;
      case 'exercise-library':
        return <ExerciseLibraryView setCurrentTab={setCurrentTab} />;
      case 'reset-password':
        return <ResetPasswordPage />;
      case 'privacy':
      case 'terms':
      case 'refunds':
        return <LegalPage kind={id} />;
      case 'member-dashboard':
        return <MemberDashboard setCurrentTab={setCurrentTab} />;
      case 'my-bookings':
        return <MyBookingsPage />;
      case 'workout-logger':
        return <WorkoutLogger setCurrentTab={setCurrentTab} />;
      case 'profile':
        return <MemberProfilePage setCurrentTab={setCurrentTab} />;
      case 'trainer-dashboard':
        return <TrainerDashboard />;
      case 'admin-dashboard':
        return <AdminDashboard setCurrentTab={setCurrentTab} />;
      case 'admin-members':
        return <MemberManagement />;
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

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip bg-gym-950 text-slate-100">
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
            this panel instead of emptying the whole app. Moving to another page tries again. */}
        <ErrorBoundary
          resetKey={`${accountGeneration}:${tab}`}
          fallback={
            <AccessPanel
              icon={<AlertTriangle className="w-6 h-6" aria-hidden="true" />}
              title="This page didn't load"
              body="Something went wrong while opening it. Check your connection, then reload the page to try again."
              action="Reload page"
              onAction={() => window.location.reload()}
            />
          }
        >
          <Suspense key={accountGeneration} fallback={<PageLoader />}>
            {page}
          </Suspense>
        </ErrorBoundary>
      </main>

      <div id="route-announcer" className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />

      <FreeTrialModal
        isOpen={isFreeTrialOpen}
        onClose={() => setIsFreeTrialOpen(false)}
        onRegisterInstead={() => {
          setIsFreeTrialOpen(false);
          openAuthModal('register');
        }}
      />

      <Footer setCurrentTab={setCurrentTab} />
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
            </NavigationProvider>
          </ThemeProvider>
        </AuthProvider>
      </ConfigProvider>
    </ToastProvider>
  );
}
