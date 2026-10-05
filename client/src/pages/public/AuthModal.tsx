import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { Dumbbell, Mail, Lock, User, Phone, Sparkles, ShieldCheck, Flame, Award, KeyRound } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login'
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('pro');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const { login, register, loginWithGoogle, demoLogin, sendPasswordReset } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
        showToast('Welcome back to PulseFit Cyber Hub!', 'success');
      } else {
        await register({ name, email, password, phone, tier });
        showToast('Registration successful! Welcome to the club.', 'success');
      }
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Authentication failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle(tier);
      showToast('Authenticated via Google successfully!', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Google authentication cancelled', 'error');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showToast('Please enter your email address in the field below first', 'warning');
      return;
    }
    setIsResetting(true);
    try {
      await sendPasswordReset(email);
      showToast(`Password reset link sent to ${email}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not send reset email', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleQuickDemo = async (role: 'member' | 'admin' | 'trainer' | 'vip') => {
    try {
      await demoLogin(role);
      showToast(`Logged in as ${role.toUpperCase()}`, 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'login' ? 'Sign In to PulseFit' : 'Join PulseFit Gurugram'}
      description={
        mode === 'login'
          ? 'Sign in with Google, credentials, or a 1-click demo persona.'
          : 'Create your member account to unlock 24/7 access & class bookings.'
      }
      maxWidth="md"
    >
      {/* 1. Google OAuth Button */}
      <div className="space-y-3 mb-4">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full py-2.5 px-4 rounded-xl neu-btn text-slate-100 font-bold text-xs flex items-center justify-center gap-3 transition-all active:scale-[0.99] group"
        >
          {/* Official Google Color SVG */}
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-gym-900 px-3 text-slate-500 font-bold">Or 1-click demo persona</span>
          </div>
        </div>
      </div>

      {/* 2. Quick Demo Persona Shortcuts */}
      <div className="mb-4 p-3 rounded-2xl neu-pressed-sm">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleQuickDemo('member')}
            className="flex items-center gap-2 p-2 rounded-xl neu-btn text-left group"
          >
            <div className="w-6 h-6 rounded-lg bg-lime-500/20 text-lime-400 flex items-center justify-center shrink-0">
              <Flame className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-200 group-hover:text-lime-400 truncate">Aarav Sharma</div>
              <div className="text-[10px] text-slate-400 truncate">Pro Member</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickDemo('vip')}
            className="flex items-center gap-2 p-2 rounded-xl neu-btn text-left group"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Award className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-200 group-hover:text-amber-400 truncate">Ananya Gupta</div>
              <div className="text-[10px] text-slate-400 truncate">VIP Pass</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickDemo('admin')}
            className="flex items-center gap-2 p-2 rounded-xl neu-btn text-left group"
          >
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 truncate">Priya Verma</div>
              <div className="text-[10px] text-slate-400 truncate">General Manager</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleQuickDemo('trainer')}
            className="flex items-center gap-2 p-2 rounded-xl neu-btn text-left group"
          >
            <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <Dumbbell className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-200 group-hover:text-purple-400 truncate">Coach Vikram</div>
              <div className="text-[10px] text-slate-400 truncate">Head Coach</div>
            </div>
          </button>
        </div>
      </div>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-gym-900 px-3 text-slate-500 font-bold">Or enter email & password</span>
        </div>
      </div>

      {/* 3. Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'register' && (
          <>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 z-10" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 z-10" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98110 12345"
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Select Initial Membership Plan
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'basic', label: 'Strength', price: '₹1,199' },
                  { id: 'pro', label: 'Zumba', price: '₹1,499' },
                  { id: 'vip', label: 'Dual Access', price: '₹1,999' }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTier(p.id)}
                    className={`p-2.5 rounded-2xl text-center transition-all ${
                      tier === p.id
                        ? 'neu-pressed-sm text-lime-400 font-bold border border-lime-500/40'
                        : 'neu-btn text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-[11px]">{p.label}</div>
                    <div className="text-xs font-extrabold">{p.price}<span className="text-[9px] font-normal">/mo</span></div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 z-10" />
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="member@pulsefit.com"
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Password
            </label>
            {mode === 'login' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isResetting}
                className="text-[11px] text-lime-400 hover:underline font-semibold"
              >
                {isResetting ? 'Sending link...' : 'Forgot password?'}
              </button>
            )}
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 z-10" />
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 neu-btn-lime text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 mt-4 active:scale-95"
        >
          {isSubmitting ? (
            'Processing...'
          ) : mode === 'login' ? (
            <>
              <KeyRound className="w-4 h-4" /> Sign In to Dashboard
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Create Account
            </>
          )}
        </button>
      </form>

      {/* Switch mode footer */}
      <div className="mt-4 text-center text-xs text-slate-400">
        {mode === 'login' ? (
          <p>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('register')}
              className="text-lime-400 font-bold hover:underline"
            >
              Sign Up Free
            </button>
          </p>
        ) : (
          <p>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="text-lime-400 font-bold hover:underline"
            >
              Sign In
            </button>
          </p>
        )}
      </div>
    </Modal>
  );
};
