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
  // Each tint gets a dark text shade in light theme (at least 4.5:1 on the light surfaces) and the
  // bright one in dark theme.
  const variantStyles = {
    lime: 'text-lime-800 dark:text-lime-400 bg-lime-500/10 border-lime-500/30 shadow-[inset_1px_1px_3px_var(--neu-shadow-dark),inset_-1px_-1px_3px_var(--neu-shadow-light)]',
    amber: 'text-amber-800 dark:text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[inset_1px_1px_3px_var(--neu-shadow-dark),inset_-1px_-1px_3px_var(--neu-shadow-light)]',
    crimson: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30 shadow-[inset_1px_1px_3px_var(--neu-shadow-dark),inset_-1px_-1px_3px_var(--neu-shadow-light)]',
    cyan: 'text-cyan-800 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30 shadow-[inset_1px_1px_3px_var(--neu-shadow-dark),inset_-1px_-1px_3px_var(--neu-shadow-light)]',
    slate: 'text-slate-300 bg-gym-900 border-slate-700/60 shadow-[2px_2px_5px_var(--neu-shadow-dark),-2px_-2px_5px_var(--neu-shadow-light)]',
    purple: 'text-purple-700 dark:text-purple-400 bg-purple-500/10 border-purple-500/30 shadow-[inset_1px_1px_3px_var(--neu-shadow-dark),inset_-1px_-1px_3px_var(--neu-shadow-light)]'
  };

  const sizeStyles = {
    sm: 'text-[10px] font-bold px-2 py-0.5 tracking-wider uppercase',
    md: 'text-xs font-bold px-3 py-1 tracking-wide',
    lg: 'text-sm font-bold px-3.5 py-1.5'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border backdrop-blur-sm transition-all ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
