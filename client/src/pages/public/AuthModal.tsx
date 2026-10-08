import React, { useEffect, useState } from 'react';
import { ArrowLeft, Dumbbell, ExternalLink, KeyRound, Loader2, Lock, Mail, Phone, ShieldCheck, Sparkles, User as UserIcon, Users } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton.js';
import { FormField, issuesByField } from '../../components/public/FormField.js';
import { emailError, nameError, normalizeIndianPhone, passwordError, PHONE_HINT } from '../../components/public/validation.js';
import { takePendingPlan } from '../../components/public/pendingPlan.js';
import { useAuth } from '../../context/AuthContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { errorMessage, isApiError } from '../../api/client.js';
import { homeTabFor } from '../../routes.js';
import { User } from '../../types/index.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

type Mode = 'login' | 'register' | 'forgot';
type DemoRole = 'member' | 'vip' | 'trainer' | 'admin';
type Field = 'name' | 'email' | 'password' | 'phone';

const DEMO_PERSONAS: { role: DemoRole; label: string; detail: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { role: 'member', label: 'Member', detail: 'Books classes', icon: UserIcon },
  { role: 'vip', label: 'All-Access', detail: 'Every class', icon: Sparkles },
  { role: 'trainer', label: 'Coach', detail: 'Class rosters', icon: Dumbbell },
  { role: 'admin', label: 'Admin', detail: 'Front desk', icon: ShieldCheck }
];

const TITLES: Record<Mode, { title: string; description: string }> = {
  login: { title: 'Sign in to PulseFit', description: 'Book classes, show your entry pass and track your training.' },
  register: { title: 'Create your account', description: 'Free to create. Pick a membership afterwards to start booking classes.' },
  forgot: { title: 'Reset your password', description: "Enter your account's email and we'll prepare a reset link." }
};

const GOOGLE_ERRORS: Record<string, string> = {
  GOOGLE_ACCOUNT_CONFLICT: 'This email is already linked to a different Google account. Sign in with that Google account, or with your email and password.',
  INVALID_GOOGLE_TOKEN: 'Google could not confirm your sign-in. Please try again.',
  GOOGLE_SIGNIN_DISABLED: "Google sign-in isn't available right now. Use your email and password instead."
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestLogin, setSuggestLogin] = useState(false);
  const [resetResult, setResetResult] = useState<{ message: string; resetUrl?: string } | null>(null);
  const [busy, setBusy] = useState<'form' | 'google' | DemoRole | null>(null);

  const { login, register, loginWithGoogle, demoLogin, forgotPassword } = useAuth();
  const { config } = useAppConfig();
  const { navigate } = useNavigation();
  const { showToast } = useToast();

  // Every open starts clean in the mode the caller asked for; closing wipes what was typed.
  useEffect(() => {
    setMode(initialMode);
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setFieldErrors({});
    setFormError(null);
    setSuggestLogin(false);
    setResetResult(null);
    setBusy(null);
  }, [isOpen, initialMode]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setFieldErrors({});
    setFormError(null);
    setSuggestLogin(false);
    setResetResult(null);
  };

  /** After any sign-in: a plan picked as a guest takes them back to pricing to pay for it. */
  const finishSignIn = (user: User, greeting: string) => {
    const pending = takePendingPlan();
    onClose();
    if (pending) {
      showToast(`${greeting} Finish choosing your plan below.`, 'success');
      navigate('pricing', { plan: pending.tier, cycle: pending.cycle });
    } else {
      showToast(greeting, 'success');
    }
    return user;
  };

  const showError = (err: unknown) => {
    if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
      const issues = issuesByField(err.data);
      const known = (['name', 'email', 'password', 'phone'] as Field[]).filter(f => issues[f]);
      if (known.length > 0) {
        setFieldErrors(Object.fromEntries(known.map(f => [f, issues[f]])));
        return;
      }
    }
    if (isApiError(err) && err.code === 'EMAIL_TAKEN') setSuggestLogin(true);
    setFormError(isApiError(err) && err.code && GOOGLE_ERRORS[err.code] ? GOOGLE_ERRORS[err.code] : errorMessage(err));
  };

  const validate = (): boolean => {
    const errors: Partial<Record<Field, string>> = {};
    const emailProblem = emailError(email);
    if (emailProblem) errors.email = emailProblem;
    if (mode === 'login' && !password) errors.password = 'Enter your password.';
    if (mode === 'register') {
      const nameProblem = nameError(name);
      if (nameProblem) errors.name = nameProblem;
      const passwordProblem = passwordError(password);
      if (passwordProblem) errors.password = passwordProblem;
      if (phone.trim() && !normalizeIndianPhone(phone)) errors.phone = PHONE_HINT;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuggestLogin(false);
    if (!validate()) return;

    setBusy('form');
    try {
      if (mode === 'forgot') {
        setResetResult(await forgotPassword(email.trim()));
      } else if (mode === 'login') {
        const user = await login({ email: email.trim(), password });
        finishSignIn(user, `Welcome back, ${user.name.split(' ')[0]}!`);
      } else {
        const normalizedPhone = phone.trim() ? normalizeIndianPhone(phone) ?? undefined : undefined;
        const user = await register({ name: name.trim(), email: email.trim(), password, phone: normalizedPhone });
        finishSignIn(user, `Welcome to PulseFit, ${user.name.split(' ')[0]}! Choose a membership to start booking classes.`);
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setFormError(null);
    setBusy('google');
    try {
      const result = await loginWithGoogle(credential);
      if (result.message) {
        // Linking removed the old password; send them where they can set a new one.
        onClose();
        showToast(result.message, 'warning', 'Google account linked');
        navigate('profile');
      } else {
        finishSignIn(result.user, result.created ? `Welcome to PulseFit, ${result.user.name.split(' ')[0]}!` : `Welcome back, ${result.user.name.split(' ')[0]}!`);
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  };

  const handleDemo = async (role: DemoRole) => {
    setFormError(null);
    setBusy(role);
    try {
      const user = await demoLogin(role);
      onClose();
      showToast(`Signed in as the demo ${DEMO_PERSONAS.find(p => p.role === role)?.label.toLowerCase()}.`, 'success');
      navigate(homeTabFor(user.role));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  };

  const openResetLink = (resetUrl: string) => {
    try {
      // The link may name another origin (the server's configured client URL); the token works
      // against this API either way, so open it in place.
      const url = new URL(resetUrl, window.location.origin);
      const token = url.searchParams.get('token');
      if (url.pathname.endsWith('/reset-password') && token) {
        onClose();
        navigate('reset-password', { token });
        return;
      }
    } catch {
      /* fall through to a full page load */
    }
    window.location.assign(resetUrl);
  };

  const isBusy = busy !== null;
  const { title, description } = TITLES[mode];
  const showAlternatives = mode !== 'forgot' && (Boolean(config.googleClientId) || config.demoMode);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description} maxWidth="md">
      {mode === 'forgot' && resetResult ? (
        <div className="space-y-4">
          <div role="status" className="p-4 rounded-2xl neu-pressed-sm text-sm text-slate-200 leading-relaxed">
            {resetResult.message}
          </div>
          {resetResult.resetUrl && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">This server does not send email, so the reset link is shown here (demo and development only).</p>
              <button
                type="button"
                onClick={() => openResetLink(resetResult.resetUrl!)}
                className="w-full py-3 neu-btn-lime rounded-2xl text-sm font-black flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" /> Open reset link
              </button>
            </div>
          )}
          <button type="button" onClick={() => switchMode('login')} className="w-full py-2.5 neu-btn rounded-xl text-sm font-bold text-slate-200 flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to sign in
          </button>
        </div>
      ) : (
        <>
          {showAlternatives && (
            <div className="space-y-4 mb-5">
              <GoogleSignInButton onCredential={handleGoogleCredential} onError={setFormError} />
              {busy === 'google' && (
                <p role="status" className="text-xs text-slate-400 text-center">
                  Signing in with Google…
                </p>
              )}

              {config.demoMode && (
                <div className="p-3 rounded-2xl neu-pressed-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5" id="demo-personas-label">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" /> Try a demo account
                  </p>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="demo-personas-label">
                    {DEMO_PERSONAS.map(persona => (
                      <button
                        key={persona.role}
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDemo(persona.role)}
                        className="flex items-center gap-2 p-2 rounded-xl neu-btn text-left disabled:opacity-60 min-w-0"
                      >
                        <span className="w-7 h-7 rounded-lg bg-lime-500/15 text-lime-400 flex items-center justify-center shrink-0">
                          {busy === persona.role ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <persona.icon className="w-3.5 h-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-200 truncate">{persona.label}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{persona.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative" aria-hidden="true">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-gym-900 px-3 text-slate-500 font-bold">or use your email</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {mode === 'register' && (
              <FormField
                id="auth-name"
                label="Full name"
                icon={UserIcon}
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
                maxLength={60}
                error={fieldErrors.name}
                required
              />
            )}

            <FormField
              id="auth-email"
              label="Email address"
              icon={Mail}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              error={fieldErrors.email}
              required
            />

            {mode !== 'forgot' && (
              <FormField
                id="auth-password"
                label="Password"
                icon={Lock}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                hint={mode === 'register' ? '8–72 characters, with at least one letter and one digit.' : undefined}
                error={fieldErrors.password}
                required
                labelAside={
                  mode === 'login' ? (
                    <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] text-lime-400 hover:underline font-semibold rounded">
                      Forgot password?
                    </button>
                  ) : undefined
                }
              />
            )}

            {mode === 'register' && (
              <FormField
                id="auth-phone"
                label="Mobile number"
                optional
                icon={Phone}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98110 12345"
                hint="Only used by the front desk to reach you about your membership."
                error={fieldErrors.phone}
              />
            )}

            {formError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-300 space-y-2">
                <p>{formError}</p>
                {suggestLogin && (
                  <button type="button" onClick={() => switchMode('login')} className="text-lime-400 font-bold hover:underline">
                    Sign in with this email instead
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-3 px-4 neu-btn-lime font-black text-sm rounded-2xl flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
            >
              {busy === 'form' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : mode === 'register' ? (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              ) : (
                <KeyRound className="w-4 h-4" aria-hidden="true" />
              )}
              {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Get a reset link'}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-slate-400">
            {mode === 'login' && (
              <p>
                New to PulseFit?{' '}
                <button type="button" onClick={() => switchMode('register')} className="text-lime-400 font-bold hover:underline rounded">
                  Create an account
                </button>
              </p>
            )}
            {mode === 'register' && (
              <p>
                Already a member?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-lime-400 font-bold hover:underline rounded">
                  Sign in
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => switchMode('login')} className="text-lime-400 font-bold hover:underline rounded inline-flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to sign in
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};
