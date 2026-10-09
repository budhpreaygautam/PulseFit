import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dumbbell, Music2, Play, RotateCcw, Square, Timer } from 'lucide-react';
import { api, isApiError } from '../../api/client.js';
import { ClassCategory, MembershipPlan, User, UserTimeTrackingStats } from '../../types/index.js';
import { formatDateTime, formatTime } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.js';
import { ErrorState, LoadingState } from '../common/States.js';
import { ApiResource } from './useApiResource.js';

const CATEGORIES: { id: ClassCategory; hint: string; icon: React.ReactNode }[] = [
  { id: 'Workout & Strength', hint: 'Free weights, racks & machines', icon: <Dumbbell className="w-4 h-4" aria-hidden="true" /> },
  { id: 'Zumba & Cardio', hint: 'Dance studio & cardio floor', icon: <Music2 className="w-4 h-4" aria-hidden="true" /> }
];

const hours = (minutes: number) => `${(Math.round((minutes / 60) * 10) / 10).toLocaleString('en-IN')} h`;

const MINUTE = 60_000;
/** The server closes a session left open at clock-in + 4 hours (server/src/lib/floor.ts). */
const MAX_SESSION_MINUTES = 4 * 60;

/** HH:MM:SS for a duration in milliseconds. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * How far the device clock is behind the server's, in ms, for an open session that just arrived.
 * The server sends its own elapsed time (duration_minutes, rounded to the minute), so the session
 * is really between duration - 0.5 and duration + 0.5 minutes old. A device clock that puts it
 * outside that window is wrong (a phone set a few minutes off); move it to the nearest edge.
 */
function clockOffsetFor(session: { clock_in_time: string; duration_minutes: number }): number {
  const deviceElapsed = Date.now() - Date.parse(session.clock_in_time);
  const earliest = Math.max(0, (session.duration_minutes - 0.5) * MINUTE);
  const latest = Math.min(MAX_SESSION_MINUTES, session.duration_minutes + 0.5) * MINUTE;
  if (!Number.isFinite(deviceElapsed) || earliest > latest) return 0;
  return Math.min(Math.max(deviceElapsed, earliest), latest) - deviceElapsed;
}

interface FloorClockCardProps {
  user: User;
  stats: ApiResource<UserTimeTrackingStats>;
  plans: MembershipPlan[] | null;
  /** Clocking out can extend the streak; the parent refreshes whatever depends on it. */
  onSessionChange: () => void;
  onOpenPricing: () => void;
  onOpenProfile: () => void;
}

export const FloorClockCard: React.FC<FloorClockCardProps> = ({ user, stats, plans, onSessionChange, onOpenPricing, onOpenProfile }) => {
  const { showToast } = useToast();
  const [category, setCategory] = useState<ClassCategory | null>(null);
  const [notes, setNotes] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [formError, setFormError] = useState<{ message: string; action?: 'pricing' | 'profile' } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const active = stats.data?.activeSession ?? null;

  // Categories this member's plan covers. Unknown (plans failed to load) lets the server decide.
  const allowed = useMemo<ClassCategory[]>(() => {
    if (user.role !== 'member') return CATEGORIES.map(c => c.id);
    if (user.membership_tier === 'none') return [];
    const plan = plans?.find(p => p.tier === user.membership_tier);
    if (!plan || plan.categories.length === 0) return CATEGORIES.map(c => c.id);
    return plan.categories;
  }, [plans, user.membership_tier, user.role]);

  useEffect(() => {
    if (!category || !allowed.includes(category)) setCategory(allowed[0] ?? null);
  }, [allowed, category]);

  // Worked out once per stats load: the session's age by the server's clock, not the device's.
  const clockOffset = useMemo(() => (active ? clockOffsetFor(active) : 0), [active]);
  const elapsedMs = active ? Math.max(0, now + clockOffset - Date.parse(active.clock_in_time)) : 0;
  // The server closes a forgotten session at exactly 4 hours; the timer stops there too.
  const autoClosed = elapsedMs >= MAX_SESSION_MINUTES * MINUTE;

  useEffect(() => {
    if (!active || autoClosed) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, autoClosed]);

  // Once the 4 hours are up, fetch the closed session (it counts towards the streak). The server
  // closes a session when it next reads it, so a card that gets there a few seconds early (a device
  // clock inside the +/-30 s the offset allows, or a request just before the deadline) still gets
  // it back open. Keep asking, at most every 10 s, until it comes back closed.
  const lastAutoCloseReload = useRef(0);
  const awaitingAutoClose = useRef(false);
  useEffect(() => {
    if (!autoClosed || stats.isLoading) return;
    awaitingAutoClose.current = true;
    const timer = setTimeout(() => {
      lastAutoCloseReload.current = Date.now();
      stats.reload();
    }, Math.max(0, lastAutoCloseReload.current + 10_000 - Date.now()));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClosed, active, stats.isLoading]);

  // The closed session has arrived: refresh what depends on it (streak, progress).
  useEffect(() => {
    if (active || !awaitingAutoClose.current) return;
    awaitingAutoClose.current = false;
    onSessionChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const explain = (err: unknown) => {
    if (!isApiError(err)) {
      setFormError({ message: 'Something went wrong. Please try again.' });
      return;
    }
    switch (err.code) {
      case 'MEMBERSHIP_INACTIVE': {
        const status = (err.data as { status?: string } | undefined)?.status;
        setFormError(
          status === 'frozen'
            ? { message: 'Your membership is frozen. Unfreeze it on your account page to use the floor.', action: 'profile' }
            : { message: 'You need an active membership to use the gym floor.', action: 'pricing' }
        );
        onSessionChange();
        break;
      }
      case 'PLAN_EXCLUDES_CATEGORY':
        setFormError({ message: `Your plan does not include the ${category} floor.`, action: 'pricing' });
        break;
      case 'ALREADY_CLOCKED_IN':
        setFormError({ message: 'You are already clocked in. Clock out of that session first.' });
        stats.reload();
        break;
      case 'NO_ACTIVE_SESSION':
        setFormError({ message: 'You are not clocked in. Sessions close automatically after 4 hours.' });
        stats.reload();
        break;
      default:
        setFormError({ message: err.message });
    }
  };

  const clockIn = async () => {
    if (!category) return;
    setIsWorking(true);
    setFormError(null);
    try {
      const session = await api.clockIn(category, notes.trim() || undefined);
      showToast(`Clocked in to the ${session.category} floor.`, 'success');
      setNotes('');
      await stats.reload();
    } catch (err) {
      explain(err);
    } finally {
      setIsWorking(false);
    }
  };

  const clockOut = async () => {
    setIsWorking(true);
    setFormError(null);
    try {
      const session = await api.clockOut(notes.trim() || undefined);
      showToast(`Clocked out after ${session.duration_minutes} min on the ${session.category} floor.`, 'success', 'Session saved');
      setNotes('');
      await stats.reload();
      onSessionChange();
    } catch (err) {
      explain(err);
    } finally {
      setIsWorking(false);
    }
  };

  const status = user.membership_status;
  const canClockIn = user.role !== 'member' || (status === 'active' && allowed.length > 0);

  let control: React.ReactNode;
  if (!stats.data && stats.error) {
    control = <ErrorState message={stats.error} onRetry={stats.reload} />;
  } else if (!stats.data) {
    control = <LoadingState label="Loading floor time…" className="py-8" />;
  } else if (active) {
    control = (
      <div className="neu-pressed-sm rounded-2xl p-4 sm:p-5 border border-lime-500/40 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {autoClosed ? 'Closed automatically' : 'Clocked in'} · {active.category}
            </p>
            <p className="font-mono text-3xl font-black text-lime-700 dark:text-lime-400" aria-live="off" data-testid="floor-timer">
              {formatElapsed(Math.min(elapsedMs, MAX_SESSION_MINUTES * MINUTE))}
            </p>
            <p className="text-xs text-slate-400">Since {formatTime(active.clock_in_time)}{active.notes ? ` · ${active.notes}` : ''}</p>
          </div>
          {autoClosed ? (
            <button
              type="button"
              onClick={() => {
                lastAutoCloseReload.current = Date.now();
                stats.reload();
              }}
              disabled={stats.isLoading}
              className="neu-btn px-5 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> {stats.isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : (
            <button
              type="button"
              onClick={clockOut}
              disabled={isWorking}
              className="neu-btn-danger px-5 py-3 font-black text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Square className="w-4 h-4 fill-current" aria-hidden="true" /> {isWorking ? 'Clocking out…' : 'Clock out'}
            </button>
          )}
        </div>
        {autoClosed ? (
          <p role="status" className="text-xs text-slate-300">
            Sessions close automatically after 4 hours, so this one was saved as 4 hours. Clock out when you leave next time.
          </p>
        ) : (
          <div>
            <label htmlFor="floor-notes-out" className="block text-[11px] font-bold text-slate-400 mb-1">Note for this session (optional)</label>
            <input id="floor-notes-out" type="text" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3.5 py-2.5 text-sm text-slate-100" />
          </div>
        )}
      </div>
    );
  } else if (!canClockIn) {
    const message =
      status === 'frozen'
        ? 'Your membership is frozen, so you cannot clock in until you unfreeze it.'
        : status === 'expired'
          ? 'Your membership has expired. Renew it to use the gym floor.'
          : status === 'pending'
            ? 'Choose a plan to start using the gym floor.'
            : 'Your plan does not include either floor.';
    control = (
      <div className="neu-pressed-sm rounded-2xl p-5 text-sm text-slate-300 space-y-3">
        <p>{message}</p>
        <button type="button" onClick={status === 'frozen' ? onOpenProfile : onOpenPricing} className="neu-btn-lime px-4 py-2 rounded-xl text-xs font-extrabold">
          {status === 'frozen' ? 'Manage membership' : status === 'expired' ? 'Renew membership' : 'Choose a plan'}
        </button>
      </div>
    );
  } else {
    control = (
      <div className="neu-pressed-sm rounded-2xl p-4 sm:p-5 space-y-4">
        <fieldset>
          <legend className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Which floor?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CATEGORIES.filter(c => allowed.includes(c.id)).map(c => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`p-3.5 rounded-xl text-left flex items-start gap-3 border transition-all ${
                  category === c.id ? 'neu-flat border-lime-500/60' : 'neu-btn border-transparent'
                }`}
              >
                <span className={`p-2 rounded-lg ${category === c.id ? 'bg-lime-500 text-black' : 'bg-slate-800 text-slate-400'}`}>{c.icon}</span>
                <span>
                  <span className="block font-extrabold text-xs text-slate-100">{c.id}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">{c.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="floor-notes-in" className="block text-[11px] font-bold text-slate-400 mb-1">Note (optional)</label>
            <input
              id="floor-notes-in"
              type="text"
              maxLength={500}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Leg day"
              className="w-full px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500"
            />
          </div>
          <button
            type="button"
            onClick={clockIn}
            disabled={isWorking || !category}
            className="neu-btn-lime px-6 py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" /> {isWorking ? 'Clocking in…' : 'Clock in'}
          </button>
        </div>
      </div>
    );
  }

  const s = stats.data;

  return (
    <section aria-labelledby="floor-heading" className="neu-flat rounded-3xl p-5 sm:p-8 space-y-5">
      <div>
        <h2 id="floor-heading" className="text-lg sm:text-xl font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
          <Timer className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Floor time
        </h2>
        <p className="text-xs text-slate-400 mt-1">Clock in when you start training and out when you leave. A completed session counts towards your streak.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-3">
          {control}
          {formError && (
            <div role="alert" className="glass-tint rounded-xl p-3 text-xs border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200 flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-[12rem]">{formError.message}</span>
              {formError.action && (
                <button type="button" onClick={formError.action === 'profile' ? onOpenProfile : onOpenPricing} className="neu-btn px-3 py-1.5 rounded-lg font-bold">
                  {formError.action === 'profile' ? 'Manage membership' : 'See plans'}
                </button>
              )}
            </div>
          )}
        </div>

        <dl className="lg:col-span-5 grid grid-cols-3 lg:grid-cols-2 gap-3 content-start">
          <div className="neu-pressed-sm rounded-2xl p-3 sm:p-4">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This week</dt>
            <dd className="text-lg sm:text-2xl font-black text-slate-100 font-['Outfit'] mt-1">{s ? hours(s.totalTimeMinutesThisWeek) : '—'}</dd>
          </div>
          <div className="neu-pressed-sm rounded-2xl p-3 sm:p-4">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This month</dt>
            <dd className="text-lg sm:text-2xl font-black text-slate-100 font-['Outfit'] mt-1">{s ? hours(s.totalTimeMinutesThisMonth) : '—'}</dd>
          </div>
          <div className="neu-pressed-sm rounded-2xl p-3 sm:p-4 lg:col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sessions</dt>
            <dd className="text-lg sm:text-2xl font-black text-slate-100 font-['Outfit'] mt-1">{s ? s.totalSessionsCompleted.toLocaleString('en-IN') : '—'}</dd>
          </div>
        </dl>
      </div>

      {s && s.recentSessions.length > 0 && (
        <div className="pt-4 border-t border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recent sessions</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {s.recentSessions.slice(0, 3).map(r => (
              <li key={r.id} className="neu-pressed-sm rounded-xl p-3 text-xs flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-bold text-slate-200 truncate">{r.category}</span>
                  <span className="block text-[11px] text-slate-500">
                    {formatDateTime(r.clock_in_time)}
                    {r.auto_closed ? ' · closed automatically' : ''}
                  </span>
                </span>
                <span className="font-mono font-bold text-slate-200 shrink-0">{r.duration_minutes} min</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
