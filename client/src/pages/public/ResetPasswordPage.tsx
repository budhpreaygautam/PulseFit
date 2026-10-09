import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { errorMessage, isApiError } from '../../api/client.js';
import { homeTabFor } from '../../routes.js';
import { passwordError } from '../../components/public/validation.js';
import { AuthModal } from './AuthModal.js';

const PASSWORD_RULES = '8–72 characters, with at least one letter and one digit.';

// Landing page for the link from "Forgot password?" (/reset-password?token=...).
export const ResetPasswordPage: React.FC = () => {
  const { params, navigate } = useNavigation();
  const { resetPassword } = useAuth();
  const { showToast } = useToast();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The link is unknown, used or expired: only a new one helps.
  const [linkExpired, setLinkExpired] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  // A new link (opened from the "forgot password" dialog) starts the form again.
  useEffect(() => {
    setPassword('');
    setConfirm('');
    setError(null);
    setLinkExpired(false);
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordError(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setIsSaving(true);
    try {
      const user = await resetPassword(token, password);
      showToast('Your password has been changed and you are signed in.', 'success');
      navigate(homeTabFor(user.role), undefined, { replace: true });
    } catch (err) {
      setLinkExpired(isApiError(err) && err.code === 'INVALID_RESET_TOKEN');
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const requestNewLink = (
    <button
      type="button"
      onClick={() => setIsForgotOpen(true)}
      className="w-full py-3 neu-btn rounded-2xl text-sm font-bold text-slate-200 flex items-center justify-center gap-2"
    >
      <Mail className="w-4 h-4" aria-hidden="true" /> Request a new link
    </button>
  );

  return (
    <section className="max-w-md mx-auto my-20 px-6">
      <div className="neu-flat-lg rounded-3xl p-8 border border-slate-800/80">
        <div className="mb-5 w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <KeyRound className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-black text-slate-100 font-['Outfit']">Choose a new password</h1>
        {!token ? (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-rose-300">This page needs the link from your password reset request. Ask for a new one below.</p>
            {requestNewLink}
          </div>
        ) : linkExpired ? (
          <div className="mt-6 space-y-4">
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
            <p className="text-xs text-slate-400">Reset links work once, for 30 minutes. Ask for a new one and open the newest link.</p>
            {requestNewLink}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="new-password" className="block text-xs font-bold text-slate-400 mb-1.5">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                aria-describedby="new-password-hint"
                className="w-full px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 neu-inset rounded-xl"
                required
              />
              <p id="new-password-hint" className="mt-1 text-[11px] text-slate-500">
                {PASSWORD_RULES}
              </p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-400 mb-1.5">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 neu-inset rounded-xl"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 neu-btn-lime text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Save password and sign in
            </button>
          </form>
        )}
      </div>
      <AuthModal isOpen={isForgotOpen} onClose={() => setIsForgotOpen(false)} initialMode="forgot" />
    </section>
  );
};
