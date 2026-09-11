import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider } from './context/ToastContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';

// Pages
import { LandingPage } from './pages/public/LandingPage.js';
import { SchedulePage } from './pages/public/SchedulePage.js';
import { PricingPage } from './pages/public/PricingPage.js';
import { TrainersPage } from './pages/public/TrainersPage.js';
import { AuthModal } from './pages/public/AuthModal.js';
import { FreeTrialModal } from './pages/public/FreeTrialModal.js';

import { MemberDashboard } from './pages/member/MemberDashboard.js';
import { WorkoutLogger } from './pages/member/WorkoutLogger.js';
import { ExerciseLibraryView } from './pages/member/ExerciseLibraryView.js';
import { MemberProfilePage } from './pages/member/MemberProfilePage.js';

import { AdminDashboard } from './pages/admin/AdminDashboard.js';
import { MemberManagement } from './pages/admin/MemberManagement.js';
import { QuickCheckInScanner } from './pages/admin/QuickCheckInScanner.js';

function MainAppContent() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isFreeTrialOpen, setIsFreeTrialOpen] = useState<boolean>(false);

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  const openFreeTrialModal = () => {
    setIsFreeTrialOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gym-950 text-slate-100">
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenAuthModal={openAuthModal}
        onOpenFreeTrialModal={openFreeTrialModal}
      />

      {/* Main View Area */}
      <main className="flex-1">
        {currentTab === 'home' && (
          <LandingPage
            setCurrentTab={setCurrentTab}
            onOpenFreeTrialModal={openFreeTrialModal}
            onOpenAuthModal={openAuthModal}
          />
        )}

        {currentTab === 'schedule' && (
          <SchedulePage onOpenAuthModal={openAuthModal} />
        )}

        {currentTab === 'pricing' && (
          <PricingPage
            onOpenAuthModal={openAuthModal}
            onOpenFreeTrialModal={openFreeTrialModal}
          />
        )}

        {currentTab === 'trainers' && (
          <TrainersPage setCurrentTab={setCurrentTab} />
        )}

        {currentTab === 'profile' && (
          <MemberProfilePage setCurrentTab={setCurrentTab} />
        )}

        {currentTab === 'member-dashboard' && (
          <MemberDashboard setCurrentTab={setCurrentTab} />
        )}

        {currentTab === 'workout-logger' && (
          <WorkoutLogger setCurrentTab={setCurrentTab} />
        )}

        {currentTab === 'exercise-library' && (
          <ExerciseLibraryView setCurrentTab={setCurrentTab} />
        )}

        {currentTab === 'admin-dashboard' && (
          <AdminDashboard setCurrentTab={setCurrentTab} />
        )}

        {currentTab === 'admin-members' && (
          <MemberManagement />
        )}

        {currentTab === 'admin-scanner' && (
          <QuickCheckInScanner />
        )}
      </main>

      {/* Global Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authMode}
      />

      <FreeTrialModal
        isOpen={isFreeTrialOpen}
        onClose={() => setIsFreeTrialOpen(false)}
        onRegisterInstead={() => {
          setIsFreeTrialOpen(false);
          openAuthModal('register');
        }}
      />

      {/* Global Footer */}
      <Footer setCurrentTab={setCurrentTab} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider>
          <MainAppContent />
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
