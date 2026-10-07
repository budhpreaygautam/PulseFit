import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { AuthSession, User, UserRole } from '../types/index.js';
import { api, isApiError, UNAUTHORIZED_EVENT } from '../api/client.js';
import { storage, TOKEN_KEY } from '../lib/storage.js';
import { useToast } from './ToastContext.js';

type DemoRole = 'member' | 'vip' | 'trainer' | 'admin';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True only while the saved session is being restored on page load. */
  isInitializing: boolean;
  role: UserRole | 'guest';
  login: (credentials: { email: string; password: string }) => Promise<User>;
  register: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  /** Sign in with a Google Identity Services credential (see GoogleSignInButton). */
  loginWithGoogle: (credential: string) => Promise<User>;
  demoLogin: (role: DemoRole) => Promise<User>;
  forgotPassword: (email: string) => Promise<{ message: string; resetUrl?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<User>;
  changePassword: (currentPassword: string | undefined, newPassword: string) => Promise<void>;
  /** Store a session returned by the API (login, payment verification, password change). */
  setSession: (session: AuthSession) => void;
  /** Replace the signed-in user after an API call returned the updated user. */
  updateUser: (user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  triggerCelebration: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => storage.get(TOKEN_KEY));
  const [isInitializing, setIsInitializing] = useState<boolean>(() => Boolean(storage.get(TOKEN_KEY)));
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const triggerCelebration = useCallback(() => {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#84cc16', '#a3e635', '#f59e0b', '#38bdf8'] });
  }, []);

  const clearSession = useCallback(() => {
    storage.remove(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const setSession = useCallback((session: AuthSession) => {
    storage.set(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!storage.get(TOKEN_KEY)) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.getMe());
    } catch (err) {
      // Only a rejected token ends the session. A network blip keeps it, so a brief
      // outage at page load does not sign people out.
      if (isApiError(err) && err.status === 401) clearSession();
    }
  }, [clearSession]);

  // Restore the saved session once, retrying a few times if the server is unreachable.
  useEffect(() => {
    if (!storage.get(TOKEN_KEY)) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const me = await api.getMe();
          if (!cancelled) setUser(me);
          break;
        } catch (err) {
          if (isApiError(err) && err.status === 401) {
            if (!cancelled) clearSession();
            break;
          }
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!cancelled) setIsInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Any API call answered with 401 means the token is no longer valid (expired, or revoked
  // by a password change elsewhere).
  useEffect(() => {
    const onUnauthorized = () => {
      if (userRef.current) showToast('Your session has expired. Please sign in again.', 'warning');
      clearSession();
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clearSession, showToast]);

  const startSession = useCallback(
    (session: AuthSession) => {
      setSession(session);
      triggerCelebration();
      return session.user;
    },
    [setSession, triggerCelebration]
  );

  const login = useCallback(async (credentials: { email: string; password: string }) => startSession(await api.login(credentials)), [startSession]);
  const register = useCallback(
    async (payload: { name: string; email: string; password: string; phone?: string }) => startSession(await api.register(payload)),
    [startSession]
  );
  const loginWithGoogle = useCallback(async (credential: string) => startSession(await api.googleSignIn(credential)), [startSession]);
  const demoLogin = useCallback(async (role: DemoRole) => startSession(await api.demoLogin(role)), [startSession]);
  const forgotPassword = useCallback((email: string) => api.forgotPassword(email), []);
  const resetPassword = useCallback(
    async (resetToken: string, newPassword: string) => startSession(await api.resetPassword({ token: resetToken, newPassword })),
    [startSession]
  );
  const changePassword = useCallback(
    async (currentPassword: string | undefined, newPassword: string) => {
      // The server revokes older tokens on a password change and returns a fresh one.
      setSession(await api.changePassword({ currentPassword, newPassword }));
    },
    [setSession]
  );

  const updateUser = useCallback((next: User) => setUser(next), []);
  const logout = useCallback(() => clearSession(), [clearSession]);

  const role: UserRole | 'guest' = user ? user.role : 'guest';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isInitializing,
        role,
        login,
        register,
        loginWithGoogle,
        demoLogin,
        forgotPassword,
        resetPassword,
        changePassword,
        setSession,
        updateUser,
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
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
