import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthSession, isMfaChallenge, MfaChallenge, User, UserRole } from '../types/index.js';
import { api, isApiError, UNAUTHORIZED_EVENT } from '../api/client.js';
import { forgetSession, hasSavedSession, rememberSession } from '../lib/authToken.js';
import { abortableGet } from '../lib/abortableGet.js';
import { useToast } from './ToastContext.js';

type DemoRole = 'member' | 'vip' | 'trainer' | 'admin';

/** A finished sign-in, or (two-step sign-in on) the token to send with the code to verifyMfa. */
export type SignInOutcome = { user: User; mfaToken?: undefined } | { user?: undefined; mfaToken: string };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  /** True only while the saved session is being restored on page load (also while the server cannot be reached). */
  isInitializing: boolean;
  /**
   * The saved session could not be checked because the server cannot be reached. The token is kept
   * and the check is retried on its own (and when the browser comes back online or regains focus).
   */
  isServerUnreachable: boolean;
  /** Check the saved session again now (the "Try again" button of the offline state). */
  retrySessionRestore: () => void;
  role: UserRole | 'guest';
  login: (credentials: { email: string; password: string }) => Promise<SignInOutcome>;
  register: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  /** Sign in with a Google Identity Services credential (see GoogleSignInButton). */
  loginWithGoogle: (credential: string) => Promise<SignInOutcome & { created: boolean; message?: string }>;
  /** Second step of a sign-in with two-step sign-in on: an authenticator code or a backup code. */
  verifyMfa: (mfaToken: string, code: string) => Promise<{ user: User; message?: string }>;
  demoLogin: (role: DemoRole) => Promise<User>;
  forgotPassword: (email: string) => Promise<{ message: string; resetUrl?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<SignInOutcome>;
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

/** Delay before each retry of the session check while the server cannot be reached. */
const RESTORE_RETRY_MS = [800, 2_000, 4_000, 8_000, 15_000, 30_000];
/** A session check still unanswered after this long counts as "cannot reach the server" too. */
const RESTORE_SLOW_MS = 5_000;
/** ...and after this long it is called off and tried again. */
const RESTORE_TIMEOUT_MS = 15_000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(hasSavedSession);
  const [isServerUnreachable, setIsServerUnreachable] = useState(false);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  // Set while the saved session is being restored: retry now, or stop (a new sign-in or sign-out wins).
  const restoreControls = useRef<{ retry: () => void; stop: () => void } | null>(null);

  const triggerCelebration = useCallback(() => {
    // Loaded on first use: most visits never celebrate anything, so it stays out of the main bundle.
    import('canvas-confetti')
      .then(({ default: confetti }) =>
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#84cc16', '#a3e635', '#f59e0b', '#38bdf8'], disableForReducedMotion: true })
      )
      .catch(() => undefined);
  }, []);

  const clearSession = useCallback(() => {
    restoreControls.current?.stop();
    forgetSession();
    setUser(null);
  }, []);

  const setSession = useCallback((session: AuthSession) => {
    restoreControls.current?.stop();
    rememberSession(session.token);
    setUser(session.user);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!hasSavedSession()) {
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

  // Restore the saved session. Only a rejected token (401) ends it. If the server cannot be reached,
  // the token is kept, the app says so after the second failed try (about a second in) or when a try
  // hangs for 5 s, and the check keeps retrying with a growing delay, and at once when the browser is
  // back online or regains focus. One check runs at a time: a check that hangs is called off after
  // 15 s (or sooner when one of those "try now" moments comes once it has hung for 5 s), and an answer
  // that arrives before then still counts.
  useEffect(() => {
    if (!hasSavedSession()) return;
    let done = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: { controller: AbortController; slow: boolean } | null = null;

    const stop = () => {
      done = true;
      clearTimeout(timer);
      // A sign-in or sign-out during the restore wins: a check still waiting is no longer needed.
      current?.controller.abort();
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      restoreControls.current = null;
      setIsServerUnreachable(false);
      setIsInitializing(false);
    };

    async function attempt() {
      if (done) return;
      if (current) {
        if (!current.slow) return;
        current.controller.abort();
      }
      clearTimeout(timer);
      const check = { controller: new AbortController(), slow: false };
      current = check;
      const slow = setTimeout(() => {
        check.slow = true;
        setIsServerUnreachable(true);
      }, RESTORE_SLOW_MS);
      const giveUp = setTimeout(() => check.controller.abort(), RESTORE_TIMEOUT_MS);
      try {
        const me = await abortableGet<User>('/auth/me', check.controller.signal);
        if (done) return;
        setUser(me);
        stop();
      } catch (err) {
        if (done) return;
        if (isApiError(err) && err.status === 401) {
          stop();
          clearSession();
          return;
        }
        // A check replaced by a newer one is not a failure of its own.
        if (current !== check) return;
        current = null;
        failures += 1;
        if (failures >= 2) setIsServerUnreachable(true);
        timer = setTimeout(attempt, RESTORE_RETRY_MS[Math.min(failures, RESTORE_RETRY_MS.length) - 1]);
      } finally {
        clearTimeout(slow);
        clearTimeout(giveUp);
      }
    }
    function retry() {
      void attempt();
    }

    restoreControls.current = { retry, stop };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    void attempt();
    return () => {
      done = true;
      clearTimeout(timer);
      current?.controller.abort();
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      restoreControls.current = null;
    };
  }, [clearSession]);

  const retrySessionRestore = useCallback(() => restoreControls.current?.retry(), []);

  // Any API call answered with 401 means the token is no longer valid (expired, or revoked
  // by a password change elsewhere).
  useEffect(() => {
    const onUnauthorized = () => {
      // Requests that were in flight together all fail with 401: only the first one says so.
      // userRef is cleared here because the re-render that would clear it comes after them.
      if (userRef.current) {
        userRef.current = null;
        showToast('Your session has expired. Please sign in again.', 'warning');
      }
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

  const outcome = useCallback(
    (result: AuthSession | MfaChallenge): SignInOutcome => (isMfaChallenge(result) ? { mfaToken: result.mfa_token } : { user: startSession(result) }),
    [startSession]
  );
  const login = useCallback(async (credentials: { email: string; password: string }) => outcome(await api.login(credentials)), [outcome]);
  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const { data, message } = await api.verifyMfa({ mfa_token: mfaToken, code });
      return { user: startSession(data), message };
    },
    [startSession]
  );
  const register = useCallback(
    async (payload: { name: string; email: string; password: string; phone?: string }) => startSession(await api.register(payload)),
    [startSession]
  );
  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const result = await api.googleSignIn(credential);
      return { ...outcome(result), created: result.created, message: result.message };
    },
    [outcome]
  );
  const demoLogin = useCallback(async (role: DemoRole) => startSession(await api.demoLogin(role)), [startSession]);
  const forgotPassword = useCallback((email: string) => api.forgotPassword(email), []);
  const resetPassword = useCallback(
    async (resetToken: string, newPassword: string) => outcome(await api.resetPassword({ token: resetToken, newPassword })),
    [outcome]
  );
  const changePassword = useCallback(
    async (currentPassword: string | undefined, newPassword: string) => {
      // The server revokes older tokens on a password change and returns a fresh one.
      setSession(await api.changePassword({ currentPassword, newPassword }));
    },
    [setSession]
  );

  const updateUser = useCallback((next: User) => setUser(next), []);
  const logout = useCallback(() => {
    // Clears the website's httpOnly session cookie; the apps just forget their token.
    api.logout().catch(() => undefined);
    clearSession();
  }, [clearSession]);

  // Nearly every component reads this context, so its value changes only when the session does: this
  // provider also re-renders whenever a toast comes or goes (useToast), and that alone must not
  // re-render the whole app.
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: !!user,
      isInitializing,
      isServerUnreachable,
      retrySessionRestore,
      role: user ? user.role : 'guest',
      login,
      register,
      loginWithGoogle,
      verifyMfa,
      demoLogin,
      forgotPassword,
      resetPassword,
      changePassword,
      setSession,
      updateUser,
      logout,
      refreshUser,
      triggerCelebration
    }),
    [
      user,
      isInitializing,
      isServerUnreachable,
      retrySessionRestore,
      login,
      register,
      loginWithGoogle,
      verifyMfa,
      demoLogin,
      forgotPassword,
      resetPassword,
      changePassword,
      setSession,
      updateUser,
      logout,
      refreshUser,
      triggerCelebration
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
