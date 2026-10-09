import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

// Shared loading / error / empty states so every screen says what is going on instead of
// spinning forever or showing invented numbers.

export const LoadingState: React.FC<{ label?: string; className?: string }> = ({ label = 'Loading…', className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-16 text-slate-400 ${className}`} role="status" aria-live="polite">
    <div className="w-8 h-8 rounded-full border-4 border-lime-500/30 border-t-lime-400 animate-spin" aria-hidden="true" />
    <span className="text-xs font-semibold">{label}</span>
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void; className?: string }> = ({ message, onRetry, className = '' }) => (
  <div className={`neu-pressed-sm rounded-2xl p-6 text-center ${className}`} role="alert">
    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" aria-hidden="true" />
    <p className="mt-2 text-sm text-slate-300">{message}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="mt-4 neu-btn px-4 py-2 rounded-xl text-xs font-bold text-slate-200 inline-flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Try again
      </button>
    )}
  </div>
);

export const EmptyState: React.FC<{ title: string; body?: string; action?: React.ReactNode; className?: string }> = ({ title, body, action, className = '' }) => (
  <div className={`neu-pressed-sm rounded-2xl p-8 text-center ${className}`}>
    <Inbox className="w-6 h-6 text-slate-500 mx-auto" aria-hidden="true" />
    <p className="mt-2 text-sm font-bold text-slate-200">{title}</p>
    {body && <p className="mt-1 text-xs text-slate-400">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
