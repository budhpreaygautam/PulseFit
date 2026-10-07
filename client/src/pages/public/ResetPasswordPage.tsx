import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { errorMessage } from '../../api/client.js';
import { homeTabFor } from '../../routes.js';

// Landing page for the link from "Forgot password?" (/reset-password?token=...).
export const ResetPasswordPage: React.FC = () => {
  const { params, navigate } = useNavigation();
  const { resetPassword } = useAuth();
  const { showToast } = useToast();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least 8 characters, with at least one letter and one number.');
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
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="max-w-md mx-auto my-20 px-6">
      <div className="neu-flat-lg rounded-3xl p-8 border border-slate-800/80">
        <div className="mb-5 w-12 h-12 rounded-2xl neu-pressed-sm flex items-center justify-center text-lime-400">
          <KeyRound className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-black text-slate-100 font-['Outfit']">Choose a new password</h1>
        {!token ? (
          <p className="mt-3 text-sm text-rose-300">
            This page needs the link from your password reset request. Ask for a new one from the sign-in screen.
          </p>
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
                className="w-full px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 neu-inset rounded-xl"
                required
              />
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
    </section>
  );
};
