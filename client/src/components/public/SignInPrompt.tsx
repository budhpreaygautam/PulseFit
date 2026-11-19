import React from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';

/**
 * Shown to guests in place of content for signed-in accounts (the full guide, the strength split):
 * what they get by signing in, and the sign-in dialog in either mode. Accounts are free to create.
 */
export const SignInPrompt: React.FC<{
  title: string;
  body: string;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  /** The title's heading level, to fit the page's outline. */
  headingLevel?: 'h2' | 'h3';
  className?: string;
}> = ({ title, body, onOpenAuthModal, headingLevel: Heading = 'h2', className = '' }) => (
  <div className={`neu-flat rounded-3xl border border-lime-500/40 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5 ${className}`}>
    <div className="flex items-start gap-4">
      <div className="glass-tint w-11 h-11 rounded-xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center text-lime-400 shrink-0">
        <Lock className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <Heading className="text-base sm:text-lg font-black text-slate-100 font-heading">{title}</Heading>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl">{body}</p>
      </div>
    </div>
    <div className="flex flex-col sm:flex-row gap-3 shrink-0">
      <button
        type="button"
        onClick={() => onOpenAuthModal('login')}
        className="px-6 py-3 neu-btn-lime font-extrabold text-sm rounded-xl inline-flex items-center justify-center gap-2"
      >
        <LogIn className="w-4 h-4" aria-hidden="true" /> Sign in
      </button>
      <button
        type="button"
        onClick={() => onOpenAuthModal('register')}
        className="px-6 py-3 neu-btn text-slate-100 font-bold text-sm rounded-xl inline-flex items-center justify-center gap-2"
      >
        <UserPlus className="w-4 h-4" aria-hidden="true" /> Create a free account
      </button>
    </div>
  </div>
);
