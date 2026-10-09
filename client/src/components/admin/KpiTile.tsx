import React, { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { focusRing } from './ui.js';

const ACCENTS = {
  lime: 'text-lime-400 bg-lime-500/10 border-lime-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  slate: 'text-slate-300 bg-slate-500/10 border-slate-500/20'
};

interface KpiTileProps {
  title: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: React.ReactNode;
  accent?: keyof typeof ACCENTS;
  /** How the figure is worked out, revealed on demand. */
  definition?: string;
}

export const KpiTile: React.FC<KpiTileProps> = ({ title, value, detail, icon, accent = 'lime', definition }) => {
  const [showDefinition, setShowDefinition] = useState(false);
  const definitionId = useId();

  return (
    <div className="neu-card p-5 rounded-3xl min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            {title}
            {definition && (
              <button
                type="button"
                onClick={() => setShowDefinition(v => !v)}
                aria-expanded={showDefinition}
                aria-controls={definitionId}
                aria-label={`How ${title.toLowerCase()} is calculated`}
                className={`neu-icon-btn w-6 h-6 shrink-0 ${focusRing}`}
              >
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </p>
          <div className="text-2xl sm:text-3xl font-black text-slate-100 mt-2 tracking-tight font-['Outfit'] break-words">{value}</div>
        </div>
        <div className={`glass-tint p-3 rounded-2xl border shrink-0 ${ACCENTS[accent]}`} aria-hidden="true">
          {icon}
        </div>
      </div>
      {detail && <p className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-400 font-medium">{detail}</p>}
      {definition && (
        <p id={definitionId} hidden={!showDefinition} className="mt-3 text-xs text-slate-300 leading-relaxed neu-pressed-sm rounded-xl p-3">
          {definition}
        </p>
      )}
    </div>
  );
};
