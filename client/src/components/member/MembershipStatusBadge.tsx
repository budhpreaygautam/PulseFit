import React from 'react';
import { MembershipStatus } from '../../types/index.js';
import { STATUS_LABELS } from '../../lib/format.js';

const STYLES: Record<MembershipStatus, { chip: string; dot: string }> = {
  active: {
    chip: 'bg-lime-500/10 border-lime-500/40 text-lime-700 dark:text-lime-400',
    dot: 'bg-lime-500 animate-pulse'
  },
  frozen: {
    chip: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-500'
  },
  expired: {
    chip: 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500'
  },
  pending: {
    chip: 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500'
  }
};

/** Membership status as a coloured chip. Only an active membership is green. */
export const MembershipStatusBadge: React.FC<{ status: MembershipStatus; className?: string }> = ({ status, className = '' }) => {
  const style = STYLES[status] ?? STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full border ${style.chip} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
};
