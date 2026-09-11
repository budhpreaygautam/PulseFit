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
    lime: 'hover:border-lime-500/30 hover:shadow-glow-lime',
    amber: 'hover:border-amber-500/30 hover:shadow-glow-amber',
    crimson: 'hover:border-rose-500/30 hover:shadow-glow-crimson',
    cyan: 'hover:border-cyan-500/30'
  };

  const iconBg = {
    lime: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    crimson: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
  };

  return (
    <div
      className={`glass-panel p-6 rounded-2xl border transition-all duration-300 ${accentGlow[accentColor]} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <div className="text-3xl font-extrabold text-slate-100 mt-2 tracking-tight">{value}</div>
        </div>
        <div className={`p-3 rounded-xl border ${iconBg[accentColor]}`}>{icon}</div>
      </div>

      {(subtitle || trend) && (
        <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-800/80 text-xs">
          {trend && (
            <span
              className={`font-semibold flex items-center gap-0.5 ${
                trend.isPositive ? 'text-lime-400' : 'text-rose-400'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </span>
          )}
          {subtitle && <span className="text-slate-400">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
