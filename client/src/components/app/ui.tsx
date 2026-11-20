import React from 'react';
import type { MembershipStatus } from '../../types/index.js';
import { STATUS_LABELS } from '../../lib/format.js';
import { useCountUp } from '../../lib/appMotion.js';

// Small pieces the app screens (pages/app) share, in the handoff's look.

const PILL_COLOURS: Record<MembershipStatus, { background: string; color: string }> = {
  active: { background: 'rgba(132, 204, 22, 0.15)', color: 'var(--app-lime)' },
  frozen: { background: 'rgba(6, 182, 212, 0.15)', color: 'var(--app-cyan-tx)' },
  expired: { background: 'rgba(239, 68, 68, 0.15)', color: 'var(--app-red-tx)' },
  pending: { background: 'rgba(245, 158, 11, 0.15)', color: 'var(--app-amber-tx)' }
};

/** Membership status as the handoff's pill; `large` (the Pass) has a dot in front. */
export const StatusPill: React.FC<{ status: MembershipStatus; large?: boolean }> = ({ status, large = false }) => (
  <span
    style={PILL_COLOURS[status] ?? PILL_COLOURS.pending}
    className={`inline-flex items-center rounded-full font-bold whitespace-nowrap ${large ? 'text-[11px] px-3.5 py-1.5 gap-1.5' : 'text-[10px] px-2 py-0.5'}`}
  >
    {large && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
    {STATUS_LABELS[status] ?? status}
  </span>
);

/** Placeholder rows while a list loads, announced once as `label`. */
export const ShimmerList: React.FC<{ rows: number; label: string; className?: string; style?: React.CSSProperties }> = ({ rows, label, className = '', style }) => (
  <div role="status" aria-label={label} className={`flex flex-col gap-2.5 ${className}`} style={style}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="app-shimmer h-14 rounded-2xl" aria-hidden="true" />
    ))}
  </div>
);

/** The handoff's on/off switch: a 52×30 track and a 22px knob, in a 44px-tall tap target. */
export const AppSwitch: React.FC<{ checked: boolean; onChange: () => void; label: string; onColor: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  onColor,
  disabled = false
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    disabled={disabled}
    className="shrink-0 h-11 flex items-center rounded-full disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-500"
  >
    <span
      className="relative block w-[52px] h-[30px] rounded-full transition-all duration-200"
      style={{ background: checked ? onColor : 'var(--neu-inset-bg)', boxShadow: 'inset 2px 2px 5px var(--neu-shadow-dark)' }}
    >
      <span
        className="absolute top-1 w-[22px] h-[22px] rounded-full bg-[color:var(--app-tx2)]"
        style={{ left: checked ? 26 : 4, transition: 'left .2s' }}
        aria-hidden="true"
      />
    </span>
  </button>
);

/** A number that counts up as it appears (useCountUp); screen readers get only the final value. */
export const CountUp: React.FC<{ value: number; format?: (n: number) => string }> = ({ value, format = String }) => {
  const shown = useCountUp(value);
  return (
    <>
      <span aria-hidden="true" data-count-up>
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
};
