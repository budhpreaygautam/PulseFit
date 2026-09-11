import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { User, UserRole } from '../types/index.js';
import { api } from '../api/client.js';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  googleProvider,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
  isFirebaseConfigured
} from '../config/firebase.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | 'guest';
  isFirebaseEnabled: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; phone?: string; tier?: string }) => Promise<void>;
  loginWithGoogle: (tier?: string) => Promise<void>;
  demoLogin: (role: 'member' | 'admin' | 'trainer' | 'vip') => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  triggerCelebration: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pulsefit_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isFirebaseEnabled = isFirebaseConfigured();

  const triggerCelebration = useCallback(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#84cc16', '#a3e635', '#f59e0b', '#38bdf8']
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      if (!localStorage.getItem('pulsefit_token')) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      const userData = await api.getMe();
      setUser(userData);
    } catch (err) {
      console.warn('Session expired or invalid, logging out.');
      localStorage.removeItem('pulsefit_token');
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Standard or Firebase Login
  const login = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      let fbUser = null;
      if (isFirebaseConfigured()) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
          fbUser = userCredential.user;
        } catch (fbErr: any) {
          console.warn('Firebase login attempt:', fbErr.message);
        }
      }

      // If Firebase user authenticated or using backend auth
      if (fbUser) {
        const res = await api.firebaseSync({
          uid: fbUser.uid,
          email: fbUser.email || credentials.email,
          displayName: fbUser.displayName || undefined,
          photoURL: fbUser.photoURL || undefined
        });
        localStorage.setItem('pulsefit_token', res.token);
        setToken(res.token);
        setUser(res.user);
      } else {
        const res = await api.login(credentials);
        localStorage.setItem('pulsefit_token', res.token);
        setToken(res.token);
        setUser(res.user);
      }

      triggerCelebration();
    } finally {
      setIsLoading(false);
    }
  };

  // Standard or Firebase Register
  const register = async (payload: { name: string; email: string; password: string; phone?: string; tier?: string }) => {
    setIsLoading(true);
    try {
      let fbUser = null;
      if (isFirebaseConfigured()) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
          fbUser = userCredential.user;
          await firebaseUpdateProfile(fbUser, { displayName: payload.name });
        } catch (fbErr: any) {
          console.warn('Firebase registration attempt:', fbErr.message);
        }
      }

      if (fbUser) {
        const res = await api.firebaseSync({
          uid: fbUser.uid,
          email: payload.email,
          displayName: payload.name,
          phone: payload.phone,
          tier: payload.tier || 'pro'
        });
        localStorage.setItem('pulsefit_token', res.token);
        setToken(res.token);
        setUser(res.user);
      } else {
        const res = await api.register(payload);
        localStorage.setItem('pulsefit_token', res.token);
        setToken(res.token);
        setUser(res.user);
      }

      triggerCelebration();
    } finally {
      setIsLoading(false);
    }
  };

  // Google Sign-In with Firebase Auth
  const loginWithGoogle = async (tier: string = 'pro') => {
    setIsLoading(true);
    try {
      if (isFirebaseConfigured()) {
        const result = await signInWithPopup(auth, googleProvider);
        const fbUser = result.user;
        const res = await api.firebaseSync({
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.displayName || '',
          photoURL: fbUser.photoURL || '',
          tier
        });
        localStorage.setItem('pulsefit_token', res.token);
        setToken(res.token);
        setUser(res.user);
      } else {
        // Mock Google sign-in demo if Firebase is in development/demo mode
        const demoGoogleUser = {
          name: 'Google Athlete',
          email: `athlete.google.${Math.floor(100 + Math.random() * 900)}@gmail.com`,
          avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
          tier
        };
        const res = await api.firebaseSync({
          uid: `goog_${Date.now()}`,
          email: demoGoogleUser.email,
          displayName: demoGoogleUser.name,
          photoURL: demoGoogleUser.avatar_url,
          tier
        });
        localStorage.setItem('pulsefit_token', res.token);
        setToken(res.token);
        setUser(res.user);
      }
      triggerCelebration();
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    if (isFirebaseConfigured()) {
      await sendPasswordResetEmail(auth, email);
    }
  };

  const demoLogin = async (targetRole: 'member' | 'admin' | 'trainer' | 'vip') => {
    setIsLoading(true);
    try {
      const res = await api.demoLogin(targetRole);
      localStorage.setItem('pulsefit_token', res.token);
      setToken(res.token);
      setUser(res.user);
      triggerCelebration();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    if (isFirebaseConfigured()) {
      firebaseSignOut(auth).catch(console.error);
    }
    localStorage.removeItem('pulsefit_token');
    setToken(null);
    setUser(null);
  };

  const role: UserRole | 'guest' = user ? user.role : 'guest';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        role,
        isFirebaseEnabled,
        login,
        register,
        loginWithGoogle,
        sendPasswordReset,
        demoLogin,
        logout,
        refreshUser,
        triggerCelebration
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
