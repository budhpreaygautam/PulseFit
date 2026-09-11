import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'lime' | 'amber' | 'crimson' | 'cyan' | 'slate' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  className = '',
  icon
}) => {
  const variantStyles = {
    lime: 'bg-lime-500/10 text-lime-400 border-lime-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    crimson: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    slate: 'bg-slate-800/60 text-slate-300 border-slate-700/60',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
  };

  const sizeStyles = {
    sm: 'text-[10px] font-semibold px-2 py-0.5 tracking-wider uppercase',
    md: 'text-xs font-semibold px-2.5 py-1 tracking-wide',
    lg: 'text-sm font-semibold px-3 py-1.5'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
