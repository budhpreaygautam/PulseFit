import React, { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { Trainer } from '../../types/index.js';
import { api, errorMessage } from '../../api/client.js';
import { Badge } from '../common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { Avatar, focusRing, inputClass } from '../admin/ui.js';

// An admin has no coach record of their own, so the coach dashboard asks which coach to show.
// The choice lives in the URL (?trainer=<id>), so links from Classes & coaches land on a coach.

function useCoaches() {
  const [coaches, setCoaches] = useState<Trainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setCoaches([...(await api.getTrainers())].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { coaches, error, load };
}

/** Every coach as a card with a button to open their dashboard. */
export const CoachList: React.FC<{ onChoose: (trainerId: string) => void }> = ({ onChoose }) => {
  const { coaches, error, load } = useCoaches();
  if (error) return <ErrorState message={`Could not load the coaches. ${error}`} onRetry={load} />;
  if (!coaches) return <LoadingState label="Loading coaches…" />;
  if (coaches.length === 0) return <EmptyState title="No coaches yet" body="Add coaches under Classes & coaches." />;
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {coaches.map(c => (
        <li key={c.id} className="neu-pressed-sm rounded-2xl p-4 flex items-center gap-3 min-w-0">
          <Avatar src={c.avatar_url} name={c.name} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-slate-100 break-words">{c.name}</p>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
              {c.classes_count ?? 0} {c.classes_count === 1 ? 'class' : 'classes'} a week
              {!c.user_id && <Badge size="sm" variant="slate">No login</Badge>}
            </p>
          </div>
          <button type="button" onClick={() => onChoose(c.id)} className={`px-3 py-2 neu-btn rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 ${focusRing}`} aria-label={`View ${c.name}'s dashboard`}>
            <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" /> Dashboard
          </button>
        </li>
      ))}
    </ul>
  );
};

/** A compact switcher for the page header while viewing one coach. */
export const CoachSelect: React.FC<{ value: string; onChoose: (trainerId: string) => void }> = ({ value, onChoose }) => {
  const { coaches } = useCoaches();
  if (!coaches || coaches.length < 2) return null;
  return (
    <div className="w-full sm:w-56">
      <label htmlFor="coach-switch" className="sr-only">Coach</label>
      <select id="coach-switch" value={value} onChange={e => onChoose(e.target.value)} className={inputClass}>
        {!coaches.some(c => c.id === value) && <option value={value}>Choose a coach</option>}
        {coaches.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
};
