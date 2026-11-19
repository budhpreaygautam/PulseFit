import React from 'react';
import { BadgeIndianRupee, Lock } from 'lucide-react';

/**
 * Shown to members without a plan (none chosen yet, or ended) in place of what a plan includes (the
 * full guide, the strength split): what they get with one, and the way to Memberships.
 */
export const PlanPrompt: React.FC<{
  title: string;
  body: string;
  onChoosePlan: () => void;
  /** The title's heading level, to fit the page's outline. */
  headingLevel?: 'h2' | 'h3';
  className?: string;
}> = ({ title, body, onChoosePlan, headingLevel: Heading = 'h2', className = '' }) => (
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
    <button
      type="button"
      onClick={onChoosePlan}
      className="px-6 py-3 neu-btn-lime font-extrabold text-sm rounded-xl inline-flex items-center justify-center gap-2 shrink-0"
    >
      <BadgeIndianRupee className="w-4 h-4" aria-hidden="true" /> Choose a plan
    </button>
  </div>
);
