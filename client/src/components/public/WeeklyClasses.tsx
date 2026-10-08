import React from 'react';
import { CalendarDays, Clock, Users } from 'lucide-react';
import { ClassOccurrence } from '../../types/index.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { DAY_NAMES, formatClock, formatDate } from '../../lib/format.js';
import { mondayOf } from './gymInfo.js';

interface WeeklyClassesProps {
  classes: ClassOccurrence[] | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (week: string, day: number) => void;
  emptyTitle: string;
}

/** A category's weekly classes from the API, each with its next session's real occupancy. */
export const WeeklyClasses: React.FC<WeeklyClassesProps> = ({ classes, isLoading, error, onRetry, onOpen, emptyTitle }) => {
  if (isLoading) return <LoadingState label="Loading this week's classes…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!classes || classes.length === 0) return <EmptyState title={emptyTitle} body="Check the full timetable for other classes." />;

  const ordered = [...classes].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) || a.start_time.localeCompare(b.start_time));

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ordered.map(c => (
        <li key={c.id} className="p-5 rounded-2xl neu-flat border border-slate-800/80 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-lime-400 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                {DAY_NAMES[c.day_of_week]}s · {formatClock(c.start_time)}
              </span>
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {c.duration_minutes} min
              </span>
            </div>
            <h3 className="text-base font-black text-slate-100 font-['Outfit']">{c.title}</h3>
            <p className="text-xs text-slate-400">
              {c.trainer_name ?? 'Coach to be confirmed'} · {c.intensity} intensity · {c.room}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              {formatDate(c.occurrence_date, { weekday: 'short', day: 'numeric', month: 'short' })}: {c.is_full ? 'full' : `${c.spots_left} of ${c.capacity} spots left`}
            </span>
            <button
              type="button"
              onClick={() => onOpen(mondayOf(c.occurrence_date), c.day_of_week)}
              className="px-3 py-1.5 neu-btn rounded-xl text-xs font-bold text-slate-200 shrink-0"
            >
              Book<span className="sr-only"> {c.title}</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
};
