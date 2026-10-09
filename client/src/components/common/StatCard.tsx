import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  accentColor?: 'lime' | 'amber' | 'crimson' | 'cyan';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor = 'lime',
  className = ''
}) => {
  const accentGlow = {
    lime: 'hover:border-lime-500/40 hover:shadow-[10px_10px_24px_var(--neu-shadow-dark),-10px_-10px_24px_var(--neu-shadow-light),0_0_20px_rgba(132,204,22,0.2)]',
    amber: 'hover:border-amber-500/40 hover:shadow-[10px_10px_24px_var(--neu-shadow-dark),-10px_-10px_24px_var(--neu-shadow-light),0_0_20px_rgba(245,158,11,0.2)]',
    crimson: 'hover:border-rose-500/40 hover:shadow-[10px_10px_24px_var(--neu-shadow-dark),-10px_-10px_24px_var(--neu-shadow-light),0_0_20px_rgba(239,68,68,0.2)]',
    cyan: 'hover:border-cyan-500/40 hover:shadow-[10px_10px_24px_var(--neu-shadow-dark),-10px_-10px_24px_var(--neu-shadow-light),0_0_20px_rgba(6,182,212,0.2)]'
  };

  const iconBg = {
    lime: 'text-lime-400 bg-lime-500/10 border-lime-500/20 shadow-[inset_2px_2px_5px_var(--neu-shadow-dark),inset_-2px_-2px_5px_var(--neu-shadow-light)]',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[inset_2px_2px_5px_var(--neu-shadow-dark),inset_-2px_-2px_5px_var(--neu-shadow-light)]',
    crimson: 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[inset_2px_2px_5px_var(--neu-shadow-dark),inset_-2px_-2px_5px_var(--neu-shadow-light)]',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20 shadow-[inset_2px_2px_5px_var(--neu-shadow-dark),inset_-2px_-2px_5px_var(--neu-shadow-light)]'
  };

  return (
    <div
      className={`neu-card p-6 rounded-3xl transition-all duration-300 ${accentGlow[accentColor]} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
          <div className="text-3xl font-black text-slate-100 mt-2 tracking-tight font-['Outfit']">{value}</div>
        </div>
        <div className={`glass-tint p-3.5 rounded-2xl border ${iconBg[accentColor]}`}>{icon}</div>
      </div>

      {(subtitle || trend) && (
        <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-800/80 text-xs">
          {trend && (
            <span
              className={`font-bold flex items-center gap-0.5 px-2 py-0.5 rounded-md neu-pressed-sm ${
                trend.isPositive ? 'text-lime-400' : 'text-rose-400'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </span>
          )}
          {subtitle && <span className="text-slate-400 font-medium">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
