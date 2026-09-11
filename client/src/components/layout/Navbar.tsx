import React, { useState } from 'react';
import {
  Dumbbell,
  Calendar,
  Zap,
  Users,
  ShieldAlert,
  Flame,
  QrCode,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  Sparkles,
  Award,
  Activity,
  BarChart3,
  Settings,
  Home,
  Tag,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { DigitalQrPassModal } from '../qr/DigitalQrPassModal.js';
import { Badge } from '../common/Badge.js';

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

  return (
    <>
      {/* Top Demo Persona Bar */}
      <div className="bg-gym-900 border-b border-slate-800/80 px-3 sm:px-4 py-1.5 text-xs text-slate-300 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
          </span>
          <span className="font-semibold text-[11px] sm:text-xs text-slate-300">Quick Persona:</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 py-0.5">
          <button
            onClick={() => {
              if (isAuthenticated) logout();
              setCurrentTab('home');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              !isAuthenticated
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Guest
          </button>

          <button
            onClick={() => handleDemoSwitch('member')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
              isAuthenticated && user?.email === 'member@pulsefit.com'
                ? 'bg-lime-500 text-black shadow-glow-lime'
                : 'bg-slate-800/70 text-lime-400 hover:bg-lime-500/10'
            }`}
          >
            <Flame className="w-3 h-3" />
            Aarav (Pro)
          </button>

          <button
            onClick={() => handleDemoSwitch('vip')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
              isAuthenticated && user?.email === 'vip@pulsefit.com'
                ? 'bg-amber-500 text-black shadow-glow-amber'
                : 'bg-slate-800/70 text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <Award className="w-3 h-3" />
            Ananya (VIP)
          </button>

          <button
            onClick={() => handleDemoSwitch('admin')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
              isAuthenticated && role === 'admin'
                ? 'bg-cyan-500 text-black'
                : 'bg-slate-800/70 text-cyan-400 hover:bg-cyan-500/10'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            Priya (Admin)
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <header className="sticky top-0 z-40 bg-gym-950/90 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <button
            onClick={() => setCurrentTab('home')}
            className="flex items-center gap-2.5 sm:gap-3 group focus:outline-none text-left shrink-0"
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-lime-500 to-lime-400 flex items-center justify-center text-black shadow-glow-lime group-hover:scale-105 transition-transform">
              <Dumbbell className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg sm:text-xl font-black tracking-tight text-white font-['Outfit']">
                  PULSE<span className="text-lime-400">FIT</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-bold text-slate-300">
                  GURUGRAM
                </span>
              </div>
              <p className="hidden md:block text-[10px] sm:text-[11px] text-slate-400 font-medium tracking-wide">
                SECTOR 29 • CYBER HUB
              </p>
            </div>
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {/* Public Section */}
            <button
              onClick={() => setCurrentTab('home')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                currentTab === 'home'
                  ? 'bg-slate-800/90 text-lime-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => setCurrentTab('schedule')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'schedule'
                  ? 'bg-slate-800/90 text-lime-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Timetable
            </button>

            <button
              onClick={() => setCurrentTab('pricing')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                currentTab === 'pricing'
                  ? 'bg-slate-800/90 text-lime-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
              }`}
            >
              Memberships
            </button>

            <button
              onClick={() => setCurrentTab('trainers')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                currentTab === 'trainers'
                  ? 'bg-slate-800/90 text-lime-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
              }`}
            >
              Trainers
            </button>

            {/* Member Section Links */}
            {isAuthenticated && role !== 'admin' && (
              <div className="flex items-center ml-2 pl-2 border-l border-slate-800 gap-1">
                <button
                  onClick={() => setCurrentTab('member-dashboard')}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    currentTab === 'member-dashboard'
                      ? 'bg-lime-500/10 text-lime-400 border border-lime-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Activity className="w-4 h-4 text-lime-400" />
                  Dashboard
                </button>

                <button
                  onClick={() => setCurrentTab('workout-logger')}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    currentTab === 'workout-logger'
                      ? 'bg-lime-500/10 text-lime-400 border border-lime-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Dumbbell className="w-4 h-4 text-amber-400" />
                  Logger
                </button>

                <button
                  onClick={() => setCurrentTab('exercise-library')}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    currentTab === 'exercise-library'
                      ? 'bg-slate-800/90 text-lime-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  Exercises
                </button>
              </div>
            )}

            {/* Admin Section Links */}
            {isAuthenticated && role === 'admin' && (
              <div className="flex items-center ml-2 pl-2 border-l border-slate-800 gap-1">
                <button
                  onClick={() => setCurrentTab('admin-dashboard')}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    currentTab === 'admin-dashboard'
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  Analytics
                </button>

                <button
                  onClick={() => setCurrentTab('admin-members')}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    currentTab === 'admin-members'
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Users className="w-4 h-4 text-cyan-400" />
                  Members
                </button>

                <button
                  onClick={() => setCurrentTab('admin-scanner')}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    currentTab === 'admin-scanner'
                      ? 'bg-lime-500 text-black font-bold shadow-glow-lime'
                      : 'bg-lime-500/10 text-lime-400 border border-lime-500/30 hover:bg-lime-500/20'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Scanner
                </button>
              </div>
            )}
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {/* QR Pass Trigger (For members) */}
                {role !== 'admin' && (
                  <button
                    onClick={() => setIsQrModalOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gym-900 border border-slate-700 hover:border-lime-500/40 rounded-xl text-xs font-bold text-slate-200 transition-all hover:shadow-glow-lime"
                  >
                    <QrCode className="w-4 h-4 text-lime-400" />
                    <span className="hidden sm:inline">Pass</span>
                  </button>
                )}

                {/* Profile Manage Button */}
                <button
                  onClick={() => setCurrentTab('profile')}
                  className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1 sm:pl-2 sm:pr-3 sm:py-1.5 rounded-2xl border transition-all ${
                    currentTab === 'profile'
                      ? 'bg-lime-500/15 border-lime-500 text-lime-400 shadow-glow-lime'
                      : 'bg-gym-900 border-slate-800 hover:border-slate-700 text-slate-200'
                  }`}
                  title="Manage Profile"
                >
                  <img
                    src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name}`}
                    alt={user?.name}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-cover bg-slate-800 border border-slate-700"
                  />
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
                      {user?.name}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Settings className="w-2.5 h-2.5 text-lime-400" /> Profile
                    </div>
                  </div>
                </button>

                <button
                  onClick={handleLogout}
                  title="Log Out"
                  className="text-slate-400 hover:text-rose-400 transition-colors p-1.5 sm:p-2 bg-gym-900 hover:bg-slate-800 rounded-xl border border-slate-800"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => onOpenAuthModal('login')}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all"
                >
                  Sign In
                </button>
                <button
                  onClick={onOpenFreeTrialModal}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black text-xs sm:text-sm font-extrabold rounded-xl shadow-glow-lime transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Free Pass
                </button>
              </div>
            )}

            {/* Theme Toggle (Sun / Moon) */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all active:scale-95"
            >
              {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-gym-950 px-4 pt-3 pb-6 space-y-2 animate-in slide-in-from-top-4 max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => {
                setCurrentTab('home');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
            >
              <Home className="w-4 h-4 text-lime-400" /> Overview
            </button>
            <button
              onClick={() => {
                setCurrentTab('schedule');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-lime-400" /> Class Timetable
            </button>
            <button
              onClick={() => {
                setCurrentTab('pricing');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
            >
              <Tag className="w-4 h-4 text-lime-400" /> Memberships & Pricing
            </button>
            <button
              onClick={() => {
                setCurrentTab('trainers');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-lime-400" /> Master Trainers
            </button>

            {isAuthenticated && (
              <>
                <div className="pt-2 border-t border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
                  Account Management
                </div>
                <button
                  onClick={() => {
                    setCurrentTab('profile');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-lime-400 bg-lime-500/10 flex items-center gap-2"
                >
                  <UserIcon className="w-4 h-4" /> Manage Profile & Plan
                </button>
              </>
            )}

            {isAuthenticated && role !== 'admin' && (
              <>
                <button
                  onClick={() => {
                    setCurrentTab('member-dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
                >
                  <Activity className="w-4 h-4 text-lime-400" /> My Dashboard
                </button>
                <button
                  onClick={() => {
                    setCurrentTab('workout-logger');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
                >
                  <Dumbbell className="w-4 h-4 text-amber-400" /> Workout Logger
                </button>
                <button
                  onClick={() => {
                    setCurrentTab('exercise-library');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
                >
                  <Zap className="w-4 h-4 text-cyan-400" /> Exercise Library
                </button>
              </>
            )}

            {isAuthenticated && role === 'admin' && (
              <>
                <div className="pt-2 border-t border-slate-800 text-xs font-bold text-cyan-400 uppercase tracking-wider px-2">
                  Management Zone
                </div>
                <button
                  onClick={() => {
                    setCurrentTab('admin-dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-cyan-400 bg-cyan-500/10 flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" /> Admin Overview
                </button>
                <button
                  onClick={() => {
                    setCurrentTab('admin-members');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-slate-200 hover:bg-slate-900 flex items-center gap-2"
                >
                  <Users className="w-4 h-4" /> Members Directory
                </button>
                <button
                  onClick={() => {
                    setCurrentTab('admin-scanner');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold text-lime-400 bg-lime-500/10 flex items-center gap-2"
                >
                  <QrCode className="w-4 h-4" /> Turnstile Scanner Tool
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {/* Sticky Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-gym-950/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setCurrentTab('home')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
            currentTab === 'home' ? 'text-lime-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-4 h-4" />
          <span className="text-[10px]">Overview</span>
        </button>

        <button
          onClick={() => setCurrentTab('schedule')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
            currentTab === 'schedule' ? 'text-lime-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-[10px]">Classes</span>
        </button>

        {isAuthenticated && role !== 'admin' ? (
          <>
            <button
              onClick={() => setCurrentTab('member-dashboard')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
                currentTab === 'member-dashboard' ? 'text-lime-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span className="text-[10px]">Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentTab('workout-logger')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
                currentTab === 'workout-logger' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              <span className="text-[10px]">Logger</span>
            </button>
          </>
        ) : isAuthenticated && role === 'admin' ? (
          <>
            <button
              onClick={() => setCurrentTab('admin-dashboard')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
                currentTab === 'admin-dashboard' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="text-[10px]">Admin</span>
            </button>

            <button
              onClick={() => setCurrentTab('admin-scanner')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
                currentTab === 'admin-scanner' ? 'text-lime-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span className="text-[10px]">Scanner</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => setCurrentTab('pricing')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
              currentTab === 'pricing' ? 'text-lime-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span className="text-[10px]">Pricing</span>
          </button>
        )}

        {isAuthenticated ? (
          <button
            onClick={() => setCurrentTab('profile')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
              currentTab === 'profile' ? 'text-lime-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span className="text-[10px]">Profile</span>
          </button>
        ) : (
          <button
            onClick={() => onOpenAuthModal('login')}
            className="flex flex-col items-center gap-0.5 py-1 px-2 text-slate-400 hover:text-white"
          >
            <UserIcon className="w-4 h-4" />
            <span className="text-[10px]">Sign In</span>
          </button>
        )}
      </div>

      {/* Digital QR Pass Modal */}
      <DigitalQrPassModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        user={user}
      />
    </>
  );
};
