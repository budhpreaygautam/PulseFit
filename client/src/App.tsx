import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider } from './context/ToastContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { ConfigProvider } from './context/ConfigContext.js';
import { NavigationProvider, useNavigation } from './context/NavigationContext.js';
import { canAccess, homeTabFor, routeForTab } from './routes.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';

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
  const { user, isInitializing } = useAuth();
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
  // a specific page (a class, the pricing page, a protected page) keeps them there.
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousUserId.current;
    previousUserId.current = user?.id ?? null;
    if (!isInitializing && user && !previous && (tab === 'home' || tab === 'reset-password')) {
      navigate(homeTabFor(user.role), undefined, { replace: true });
    }
  }, [user, isInitializing, tab, navigate]);

  const route = routeForTab(tab);

  let page: React.ReactNode;
  if (!route) {
    page = <NotFoundPage setCurrentTab={setCurrentTab} />;
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
    <div className="min-h-screen flex flex-col bg-gym-950 text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] neu-btn-lime px-4 py-2 rounded-lg text-sm font-bold">
        Skip to content
      </a>
      <Navbar currentTab={tab} setCurrentTab={setCurrentTab} onOpenAuthModal={openAuthModal} onOpenFreeTrialModal={openFreeTrialModal} />

      <main id="main" className="flex-1">
        <Suspense fallback={<PageLoader />}>{page}</Suspense>
      </main>

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
