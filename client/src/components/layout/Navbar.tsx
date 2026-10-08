import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  LogOut,
  Menu,
  Moon,
  QrCode,
  ScanLine,
  Sparkles,
  Sun,
  Tags,
  UserCircle,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { errorMessage } from '../../api/client.js';
import { homeTabFor } from '../../routes.js';
import { UserRole } from '../../types/index.js';
import { DigitalQrPassModal } from '../qr/DigitalQrPassModal.js';
import { TabLink } from '../public/TabLink.js';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

type DemoRole = 'member' | 'vip' | 'trainer' | 'admin';

const PUBLIC_LINKS = [
  { tab: 'home', label: 'Overview' },
  { tab: 'workout', label: 'Strength Floor' },
  { tab: 'zumba', label: 'Zumba Studio' },
  { tab: 'guide', label: 'Plans & Diets' },
  { tab: 'schedule', label: 'Timetable' },
  { tab: 'pricing', label: 'Memberships' },
  { tab: 'trainers', label: 'Coaches' }
];

interface RoleLink {
  tab: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ROLE_LINKS: Record<UserRole, RoleLink[]> = {
  member: [
    { tab: 'member-dashboard', label: 'Dashboard', icon: Activity },
    { tab: 'my-bookings', label: 'My bookings', icon: CalendarCheck },
    { tab: 'workout-logger', label: 'Log workout', icon: Dumbbell },
    { tab: 'exercise-library', label: 'Exercises', icon: BookOpen },
    { tab: 'profile', label: 'My account', icon: UserCircle }
  ],
  trainer: [
    { tab: 'trainer-dashboard', label: 'Coach dashboard', icon: Activity },
    { tab: 'admin-scanner', label: 'Check-in', icon: ScanLine },
    { tab: 'workout-logger', label: 'Log workout', icon: Dumbbell },
    { tab: 'profile', label: 'My account', icon: UserCircle }
  ],
  admin: [
    { tab: 'admin-dashboard', label: 'Dashboard', icon: BarChart3 },
    { tab: 'admin-members', label: 'Members', icon: Users },
    { tab: 'admin-scanner', label: 'Check-in', icon: ScanLine },
    { tab: 'admin-classes', label: 'Classes & coaches', icon: CalendarCheck },
    { tab: 'admin-plans', label: 'Plans', icon: Tags },
    { tab: 'admin-trials', label: 'Trial leads', icon: ClipboardList },
    { tab: 'profile', label: 'My account', icon: UserCircle }
  ]
};

const DEMO_PERSONAS: { role: DemoRole; label: string; email: string }[] = [
  { role: 'member', label: 'Member', email: 'member@pulsefit.com' },
  { role: 'vip', label: 'All-Access member', email: 'vip@pulsefit.com' },
  { role: 'trainer', label: 'Coach', email: 'trainer@pulsefit.com' },
  { role: 'admin', label: 'Admin', email: 'admin@pulsefit.com' }
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');

const ROLE_SECTION_LABEL: Record<UserRole, string> = { member: 'My PulseFit', trainer: 'Coach tools', admin: 'Front desk & admin' };

const linkClass = (active: boolean) =>
  `px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500 ${
    active ? 'neu-pressed-sm text-lime-400 border border-lime-500/30' : 'neu-btn text-slate-200'
  }`;

const mobileLinkClass = (active: boolean) =>
  `w-full px-3.5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500 ${
    active ? 'neu-pressed-sm text-lime-400 border border-lime-500/30' : 'neu-btn text-slate-200'
  }`;

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, onOpenAuthModal, onOpenFreeTrialModal }) => {
  const { user, isInitializing, logout, demoLogin } = useAuth();
  const { config } = useAppConfig();
  const { showToast } = useToast();
  const { isDark, toggleTheme } = useTheme();
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<DemoRole | 'guest' | null>(null);

  // Close the mobile sheet whenever the page changes (including back/forward).
  useEffect(() => setIsMobileMenuOpen(false), [currentTab]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setIsMobileMenuOpen(false);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileMenuOpen]);

  const go = (tab: string) => {
    setIsMobileMenuOpen(false);
    setCurrentTab(tab);
  };

  const handleDemoSwitch = async (role: DemoRole) => {
    setSwitchingTo(role);
    try {
      const next = await demoLogin(role);
      showToast(`Signed in as the demo ${DEMO_PERSONAS.find(p => p.role === role)?.label.toLowerCase()}.`, 'success');
      setCurrentTab(homeTabFor(next.role));
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
    setCurrentTab('home');
    showToast('You have signed out.', 'info');
  };

  const roleLinks = user ? ROLE_LINKS[user.role] : [];
  const activeDemoEmail = user?.email;

  return (
    <>
      {config.demoMode && (
        <div className="bg-gym-950 border-b border-slate-800/60 px-4 py-1.5 text-xs">
          <div className="max-w-7xl mx-auto flex items-center gap-3 overflow-x-auto [scrollbar-width:none]">
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-400 uppercase shrink-0" id="demo-switcher-label">
              Demo accounts:
            </span>
            <div className="flex items-center gap-1.5 shrink-0 py-0.5" role="group" aria-labelledby="demo-switcher-label">
              <button
                type="button"
                aria-pressed={!user && !isInitializing}
                disabled={switchingTo !== null}
                onClick={() => {
                  if (user) logout();
                  setCurrentTab('home');
                }}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  !user && !isInitializing ? 'neu-pressed-sm text-lime-400 border border-lime-500/30' : 'neu-btn text-slate-300'
                }`}
              >
                Guest
              </button>
              {DEMO_PERSONAS.map(persona => {
                const isActive = activeDemoEmail === persona.email;
                return (
                  <button
                    key={persona.role}
                    type="button"
                    aria-pressed={isActive}
                    disabled={switchingTo !== null}
                    onClick={() => handleDemoSwitch(persona.role)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all disabled:opacity-60 ${
                      isActive ? 'neu-pressed-sm text-lime-400 border border-lime-500/30' : 'neu-btn text-slate-300'
                    }`}
                  >
                    {switchingTo === persona.role ? 'Signing in…' : persona.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-gym-950 border-b border-slate-800/80 shadow-[0_4px_16px_var(--neu-shadow-dark)] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <TabLink
            tab="home"
            navigate={go}
            className="flex items-center gap-2.5 group shrink-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500"
            aria-label="PulseFit Athletics home"
          >
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center neu-btn-lime group-hover:scale-105 transition-transform">
              <Dumbbell className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            </span>
            {/* Below 360px only the logo mark fits next to the buttons; the link keeps its aria-label. */}
            <span className="text-left max-[359px]:hidden">
              <span className="block text-lg font-black tracking-tight text-slate-100 font-['Outfit'] leading-tight">
                PULSE<span className="text-lime-400">FIT</span>
              </span>
              <span className="hidden md:block text-[10px] text-slate-400 font-medium leading-none">Sector 29 · Gurugram</span>
            </span>
          </TabLink>

          <nav className="hidden xl:flex items-center gap-1.5" aria-label="Main">
            {PUBLIC_LINKS.map(link => (
              <TabLink key={link.tab} tab={link.tab} navigate={go} isCurrent={currentTab === link.tab} className={linkClass(currentTab === link.tab)}>
                {link.label}
              </TabLink>
            ))}
          </nav>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {isInitializing ? (
              <div className="flex items-center gap-2" role="status">
                <span className="w-24 h-8 rounded-xl neu-pressed-sm animate-pulse" aria-hidden="true" />
                <span className="sr-only">Loading your account…</span>
              </div>
            ) : user ? (
              <>
                {user.role === 'member' && (
                  <button
                    type="button"
                    onClick={() => setIsQrModalOpen(true)}
                    aria-label="Show my QR entry pass"
                    className="neu-btn flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold text-slate-200"
                  >
                    <QrCode className="w-4 h-4 text-lime-400" aria-hidden="true" />
                    <span className="hidden sm:inline">QR pass</span>
                  </button>
                )}
                <TabLink
                  tab="profile"
                  navigate={go}
                  isCurrent={currentTab === 'profile'}
                  aria-label={`My account (${user.name})`}
                  className={`flex items-center gap-2 pl-1.5 pr-1.5 sm:pr-3 py-1 rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500 ${
                    currentTab === 'profile' ? 'neu-pressed-sm border border-lime-500/30' : 'neu-btn'
                  }`}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-lg object-cover bg-slate-800" />
                  ) : (
                    <span aria-hidden="true" className="w-7 h-7 rounded-lg neu-btn-lime flex items-center justify-center text-[11px] font-black">
                      {initials(user.name)}
                    </span>
                  )}
                  <span className="text-xs font-bold hidden sm:inline text-slate-200 max-w-[8rem] truncate">{user.name.split(' ')[0]}</span>
                </TabLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  title="Sign out"
                  className="max-sm:!hidden neu-icon-btn p-2 text-slate-400 hover:text-rose-500"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onOpenAuthModal('login')} className="neu-btn px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-200 whitespace-nowrap">
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={onOpenFreeTrialModal}
                  className="neu-btn-lime px-3 py-2 sm:px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Sparkles className="hidden sm:block w-3.5 h-3.5" aria-hidden="true" />
                  Free pass
                </button>
              </>
            )}

            {/* .neu-icon-btn sets its own display, so the wrapper hides it on phones (it lives in the menu there). */}
            <span className="hidden sm:inline-flex">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                className="neu-icon-btn p-2 text-slate-200"
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
              </button>
            </span>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(open => !open)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="xl:hidden neu-icon-btn p-2 text-slate-200"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {user && !isInitializing && (
          <div className="hidden md:block border-t border-slate-800/60">
            <nav
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]"
              aria-label={ROLE_SECTION_LABEL[user.role]}
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mr-2 shrink-0">{ROLE_SECTION_LABEL[user.role]}</span>
              {roleLinks.map(link => (
                <TabLink key={link.tab} tab={link.tab} navigate={go} isCurrent={currentTab === link.tab} className={linkClass(currentTab === link.tab)}>
                  <link.icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {link.label}
                </TabLink>
              ))}
            </nav>
          </div>
        )}

        {isMobileMenuOpen && (
          <div id="mobile-menu" className="xl:hidden border-t border-slate-800/80 bg-gym-950 px-4 py-4 shadow-2xl max-h-[80vh] overflow-y-auto">
            <nav aria-label="Main" className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 py-1 font-bold">Explore PulseFit</div>
              {PUBLIC_LINKS.map(link => (
                <TabLink key={link.tab} tab={link.tab} navigate={go} isCurrent={currentTab === link.tab} className={mobileLinkClass(currentTab === link.tab)}>
                  {link.label}
                </TabLink>
              ))}
            </nav>

            <button type="button" onClick={toggleTheme} className={`sm:hidden mt-4 ${mobileLinkClass(false)}`}>
              {isDark ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
              {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            </button>

            {user && !isInitializing && (
              <nav aria-label={ROLE_SECTION_LABEL[user.role]} className="space-y-1.5 mt-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 py-1 font-bold">{ROLE_SECTION_LABEL[user.role]}</div>
                {roleLinks.map(link => (
                  <TabLink key={link.tab} tab={link.tab} navigate={go} isCurrent={currentTab === link.tab} className={mobileLinkClass(currentTab === link.tab)}>
                    <link.icon className="w-4 h-4 text-lime-400" aria-hidden="true" />
                    {link.label}
                  </TabLink>
                ))}
                <button type="button" onClick={handleLogout} className={mobileLinkClass(false)}>
                  <LogOut className="w-4 h-4 text-rose-400" aria-hidden="true" />
                  Sign out
                </button>
              </nav>
            )}
          </div>
        )}
      </header>

      {isQrModalOpen && <DigitalQrPassModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} user={user} />}
    </>
  );
};
