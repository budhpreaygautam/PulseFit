import React from 'react';

/** A headline number that is either real or shown as unavailable, never guessed. */
export const StatTile: React.FC<{ value: string | null; label: string; isLoading?: boolean; className?: string }> = ({ value, label, isLoading, className = '' }) => (
  <div className={`p-3.5 neu-pressed-sm rounded-2xl text-center ${className}`}>
    <div className="text-xl sm:text-2xl font-black text-slate-100 font-['Outfit']">
      {isLoading ? <span className="inline-block w-12 h-6 rounded bg-slate-700/40 animate-pulse align-middle" aria-hidden="true" /> : value ?? '—'}
      {!isLoading && value === null && <span className="sr-only">not available</span>}
    </div>
    <div className="text-[11px] text-slate-400 font-medium">{label}</div>
  </div>
);
