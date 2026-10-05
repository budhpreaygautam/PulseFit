import React, { useState } from 'react';
import {
  Dumbbell,
  Flame,
  QrCode,
  LogOut,
  Menu,
  X,
  Sparkles,
  Award,
  Activity,
  BarChart3,
  Users,
  ShieldAlert,
  Sun,
  Moon,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { DigitalQrPassModal } from '../qr/DigitalQrPassModal.js';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenFreeTrialModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenAuthModal,
  onOpenFreeTrialModal
}) => {
  const { user, isAuthenticated, role, logout, demoLogin } = useAuth();
  const { showToast } = useToast();
  const { isDark, toggleTheme } = useTheme();
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleDemoSwitch = async (targetRole: 'member' | 'admin' | 'trainer' | 'vip') => {
    try {
      await demoLogin(targetRole);
      showToast(`Switched persona to ${targetRole.toUpperCase()}`, 'success');
      if (targetRole === 'admin') {
        setCurrentTab('admin-dashboard');
      } else {
        setCurrentTab('member-dashboard');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentTab('home');
    showToast('Logged out successfully', 'info');
  };

  const navLinks = [
    { id: 'home', label: 'Overview' },
    { id: 'workout', label: 'Strength Floor' },
    { id: 'zumba', label: 'Zumba Studio' },
    { id: 'guide', label: 'Plans & Diets' },
    { id: 'schedule', label: 'Timetable' },
    { id: 'pricing', label: 'Memberships' },
    { id: 'trainers', label: 'Coaches' }
  ];

  return (
    <>
      {/* 1. Neumorphic Top Persona Switcher Track */}
      <div className="bg-gym-950 border-b border-slate-800/60 px-4 py-1.5 text-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-400 uppercase">
              Demo Switcher:
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 py-0.5">
            <button
              onClick={() => {
                if (isAuthenticated) logout();
                setCurrentTab('home');
              }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                !isAuthenticated
                  ? 'neu-pressed-sm text-lime-400 font-bold border border-lime-500/30'
                  : 'neu-btn text-slate-400 hover:text-slate-200'
              }`}
            >
              Guest
            </button>

            <button
              onClick={() => handleDemoSwitch('member')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${
                isAuthenticated && user?.email === 'member@pulsefit.com'
                  ? 'neu-pressed-sm text-lime-400 font-bold border border-lime-500/30'
                  : 'neu-btn text-lime-400'
              }`}
            >
              <Flame className="w-3 h-3" />
              Aarav (Pro)
            </button>

            <button
              onClick={() => handleDemoSwitch('vip')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${
                isAuthenticated && user?.email === 'vip@pulsefit.com'
                  ? 'neu-pressed-sm text-amber-400 font-bold border border-amber-500/30'
                  : 'neu-btn text-amber-400'
              }`}
            >
              <Award className="w-3 h-3" />
              Ananya (VIP)
            </button>

            <button
              onClick={() => handleDemoSwitch('admin')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${
                isAuthenticated && role === 'admin'
                  ? 'neu-pressed-sm text-cyan-400 font-bold border border-cyan-500/30'
                  : 'neu-btn text-cyan-400'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              Priya (Admin)
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Neumorphic Sticky Header */}
      <header className="sticky top-0 z-40 bg-gym-950/95 backdrop-blur-md border-b border-slate-800/80 shadow-[0_4px_16px_var(--neu-shadow-dark)] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          {/* Brand Logo */}
          <button
            onClick={() => setCurrentTab('home')}
            className="flex items-center gap-3 group focus:outline-none shrink-0"
          >
            <div className="w-10 h-10 rounded-2xl bg-lime-500 flex items-center justify-center text-black shadow-glow-lime neu-btn-lime group-hover:scale-105 transition-transform">
              <Dumbbell className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black tracking-tight text-white font-['Outfit']">
                  PULSE<span className="text-lime-400">FIT</span>
                </span>
                <span className="hidden sm:inline-block text-[9px] font-mono font-bold bg-gym-900 text-slate-300 border border-slate-700/80 px-1.5 py-0.5 rounded-md neu-pressed-sm">
                  GURUGRAM
                </span>
              </div>
              <p className="hidden md:block text-[10px] text-slate-400 font-medium leading-none">
                Cyber Hub • Sector 29
              </p>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden xl:flex items-center gap-1.5">
            {navLinks.map((link) => {
              const isActive = currentTab === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => setCurrentTab(link.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? 'neu-pressed-sm text-lime-600 dark:text-lime-400 border border-lime-500/30'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}

            {/* Authenticated Member Specific Links */}
            {isAuthenticated && role !== 'admin' && (
              <>
                <div className="h-4 w-px bg-slate-400/30 dark:bg-slate-800 mx-1" />
                <button
                  onClick={() => setCurrentTab('member-dashboard')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    currentTab === 'member-dashboard'
                      ? 'neu-pressed-sm text-lime-600 dark:text-lime-400 border border-lime-500/30'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                  Dashboard
                </button>
                <button
                  onClick={() => setCurrentTab('workout-logger')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    currentTab === 'workout-logger'
                      ? 'neu-pressed-sm text-lime-600 dark:text-lime-400 border border-lime-500/30'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <Dumbbell className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  Logger
                </button>
                <button
                  onClick={() => setCurrentTab('exercise-library')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    currentTab === 'exercise-library'
                      ? 'neu-pressed-sm text-lime-600 dark:text-lime-400 border border-lime-500/30'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Exercises
                </button>
              </>
            )}

            {/* Authenticated Admin Specific Links */}
            {isAuthenticated && role === 'admin' && (
              <>
                <div className="h-4 w-px bg-slate-400/30 dark:bg-slate-800 mx-1" />
                <button
                  onClick={() => setCurrentTab('admin-dashboard')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    currentTab === 'admin-dashboard'
                      ? 'neu-pressed-sm text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Analytics
                </button>
                <button
                  onClick={() => setCurrentTab('admin-members')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    currentTab === 'admin-members'
                      ? 'neu-pressed-sm text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Members
                </button>
                <button
                  onClick={() => setCurrentTab('admin-scanner')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    currentTab === 'admin-scanner'
                      ? 'neu-btn-lime shadow-glow-lime'
                      : 'neu-btn text-lime-600 dark:text-lime-400 font-extrabold'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Scanner
                </button>
              </>
            )}
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {/* QR Access Pass Trigger */}
                {role !== 'admin' && (
                  <button
                    onClick={() => setIsQrModalOpen(true)}
                    className="neu-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white"
                  >
                    <QrCode className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    <span className="hidden sm:inline">QR Pass</span>
                  </button>
                )}

                {/* Profile Button */}
                <button
                  onClick={() => setCurrentTab('profile')}
                  className={`flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-xl transition-all ${
                    currentTab === 'profile'
                      ? 'neu-pressed-sm text-lime-600 dark:text-lime-400 border border-lime-500/30 font-bold'
                      : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <img
                    src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`}
                    alt={user?.name}
                    className="w-6 h-6 rounded-lg object-cover bg-slate-800"
                  />
                  <span className="text-xs font-bold hidden sm:inline">{user?.name}</span>
                </button>

                {/* Log Out Button */}
                <button
                  onClick={handleLogout}
                  title="Log Out"
                  className="neu-icon-btn p-2 text-slate-500 hover:text-rose-500"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenAuthModal('login')}
                  className="neu-btn px-3.5 py-1.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white"
                >
                  Sign In
                </button>
                <button
                  onClick={onOpenFreeTrialModal}
                  className="neu-btn-lime px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-black flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Free Pass
                </button>
              </div>
            )}

            {/* Light / Dark Mode Switcher */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="neu-icon-btn p-2 text-slate-700 dark:text-slate-200 hover:text-black dark:hover:text-white"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Mobile / Tablet Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="xl:hidden neu-icon-btn p-2 text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* 3. Mobile Navigation Sheet */}
        {isMobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-800/80 bg-gym-950 px-4 py-4 space-y-1.5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 py-1 font-bold">
              Explore PulseFit
            </div>

            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  setCurrentTab(link.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between transition-colors ${
                  currentTab === link.id
                    ? 'neu-pressed-sm text-lime-600 dark:text-lime-400 font-bold'
                    : 'neu-btn text-slate-800 dark:text-slate-200 hover:text-black dark:hover:text-white'
                }`}
              >
                <span>{link.label}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}

            {isAuthenticated && (
              <>
                <div className="pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 font-bold">
                  {role === 'admin' ? 'Staff & Administration' : 'Member Zone'}
                </div>

                {role !== 'admin' ? (
                  <>
                    <button
                      onClick={() => {
                        setCurrentTab('member-dashboard');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 neu-btn hover:text-black dark:hover:text-white flex items-center gap-2"
                    >
                      <Activity className="w-4 h-4 text-lime-600 dark:text-lime-400" /> Member Dashboard
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('workout-logger');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 neu-btn hover:text-black dark:hover:text-white flex items-center gap-2"
                    >
                      <Dumbbell className="w-4 h-4 text-amber-500 dark:text-amber-400" /> Workout Logger
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('exercise-library');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 neu-btn hover:text-black dark:hover:text-white flex items-center gap-2"
                    >
                      <Flame className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Exercise Library
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setCurrentTab('admin-dashboard');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 neu-btn hover:text-black dark:hover:text-white flex items-center gap-2"
                    >
                      <BarChart3 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Admin Analytics
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('admin-members');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 neu-btn hover:text-black dark:hover:text-white flex items-center gap-2"
                    >
                      <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Member Management
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('admin-scanner');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm neu-btn-lime flex items-center gap-2 shadow-glow-lime"
                    >
                      <QrCode className="w-4 h-4" /> Turnstile Scanner
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </header>

      {/* QR Pass Modal */}
      {isQrModalOpen && (
        <DigitalQrPassModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          user={user}
        />
      )}
    </>
  );
};
