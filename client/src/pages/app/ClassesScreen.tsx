import React, { useState } from 'react';
import { ArrowRight, Dumbbell, Music2, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, errorMessage } from '../../api/client.js';
import { ClassOccurrence, GymClass } from '../../types/index.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { ErrorState } from '../../components/common/States.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { planCovers } from '../../components/public/plans.js';
import { mondayOf, weekdayOf } from '../../components/public/gymInfo.js';
import { ShimmerList } from '../../components/app/ui.js';
import { addDays, DAY_NAMES, formatDate, gymToday } from '../../lib/format.js';

const LONG_DAY: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };

/** The open days of the coming week, today first (always inside the 14-day booking window). */
export function openDaysFrom(today: string, closedWeekdays: readonly number[]): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter(d => !closedWeekdays.includes(weekdayOf(d)));
}

/** A class's icon tile, as the handoff tints it: Zumba pink, the hardest (HIIT-like) classes amber, the rest lime. */
export function classLook(c: Pick<GymClass, 'category' | 'intensity'>): { tint: string; ink: string; icon: LucideIcon } {
  if (c.category === 'Zumba & Cardio') return { tint: 'rgba(236, 72, 153, 0.15)', ink: 'var(--app-pink-tx)', icon: Music2 };
  if (c.intensity === 'Extreme') return { tint: 'rgba(245, 158, 11, 0.15)', ink: 'var(--app-amber-tx)', icon: Zap };
  return { tint: 'rgba(132, 204, 22, 0.15)', ink: 'var(--app-lime)', icon: Dumbbell };
}

const occurrenceKey = (c: ClassOccurrence) => `${c.id}:${c.occurrence_date}`;
const stateBtn = 'app-press shrink-0 min-h-[44px] min-w-[44px] px-3.5 rounded-xl text-[11px] font-extrabold';

/**
 * The app's Classes tab (handoff 1a → Classes): the gym's open days this coming week and each day's
 * classes with Book, Booked, Full, Started or Not in plan. The month calendar, filters and the whole
 * booking window stay on the full timetable.
 */
export const ClassesScreen: React.FC = () => {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { navigate } = useNavigation();
  const { showToast } = useToast();

  const days = openDaysFrom(gymToday(), config.gym.hours.closedWeekdays);
  const [selected, setSelected] = useState(days[0]);
  // The config can arrive after the first render and close the day picked from the defaults.
  const day = days.includes(selected) ? selected : days[0];
  const dayLabel = formatDate(day, LONG_DAY);
  const weekStart = mondayOf(day);

  // New deps drop the old week, so the shimmer shows instead of the previous week's cards.
  const classes = useApiResource(() => api.getClasses({ week_start: weekStart }), [weekStart]);
  const plans = useApiResource(() => api.getPlans());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<ClassOccurrence | null>(null);

  if (!user) return null;

  const memberPlan = plans.data?.find(p => p.tier === user.membership_tier);
  const dayClasses = (classes.data ?? []).filter(c => c.occurrence_date === day).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const book = async (c: ClassOccurrence) => {
    setBusyKey(occurrenceKey(c));
    try {
      // occurrence_date comes from the server, which works in gym time; never derive it here.
      await api.createBooking({ class_id: c.id, booking_date: c.occurrence_date });
      showToast(`${c.title}, ${formatDate(c.occurrence_date, LONG_DAY)} at ${c.start_time}.`, 'success', 'Class booked');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      await classes.reload();
      setBusyKey(null);
    }
  };

  const cancel = async () => {
    const c = toCancel;
    if (!c?.my_booking_id) return;
    try {
      await api.cancelBooking(c.my_booking_id);
      showToast(`Your booking for ${c.title} on ${formatDate(c.occurrence_date, LONG_DAY)} is cancelled.`, 'info', 'Booking cancelled');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
    // Keep the dialog busy until the card shows the spot as free again.
    await classes.reload();
  };

  /** The card's button and spots line, from the first booking rule that applies. */
  const stateOf = (c: ClassOccurrence): { button: React.ReactNode; spots?: { text: string; color: string } } => {
    const started = new Date(c.starts_at).getTime() <= Date.now();
    if (c.my_booking_id) {
      return {
        button: (
          <button
            type="button"
            disabled={started}
            aria-haspopup="dialog"
            onClick={() => setToCancel(c)}
            className={`app-inset ${stateBtn} text-[color:var(--app-lime)]`}
          >
            Booked
          </button>
        ),
        spots: { text: 'You are booked', color: 'var(--app-lime)' }
      };
    }
    const muted = (label: string) => (
      <button type="button" disabled className={`app-inset ${stateBtn} text-[color:var(--app-mu)] cursor-not-allowed`}>
        {label}
      </button>
    );
    if (started) return { button: muted('Started') };
    if (memberPlan && !planCovers(memberPlan, c.category)) {
      return { button: muted('Not in plan'), spots: { text: `Your plan doesn't include ${c.category}`, color: 'var(--app-mu)' } };
    }
    if (c.is_full) {
      // The handoff's Waitlist look; there is no waitlist, so it only says the class is full.
      return {
        button: (
          <button type="button" disabled className={`app-glass ${stateBtn} text-[color:var(--app-amber-tx)] cursor-not-allowed`}>
            Full
          </button>
        ),
        spots: { text: 'Class full', color: 'var(--app-amber-tx)' }
      };
    }
    const busy = busyKey === occurrenceKey(c);
    return {
      button: (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          aria-label={`Book ${c.title} at ${c.start_time}`}
          onClick={() => book(c)}
          style={{ boxShadow: 'none' }}
          className={`app-lime-btn ${stateBtn} disabled:opacity-60`}
        >
          Book
        </button>
      ),
      spots: { text: `${c.spots_left} ${c.spots_left === 1 ? 'spot' : 'spots'} left`, color: 'var(--app-mu)' }
    };
  };

  return (
    <div className="app-screen flex flex-col gap-4">
      <h1 className="font-heading font-black text-[26px]">Timetable</h1>

      {/* Seven open days do not fit 44 px chips on a phone: the row scrolls sideways (its padding keeps the shadows). */}
      <div role="group" aria-label="Day" className="flex gap-2.5 overflow-x-auto -mx-5 px-5 -my-6 py-6 [scrollbar-width:none]">
        {days.map(d => {
          const isSelected = d === day;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSelected}
              aria-label={formatDate(d, LONG_DAY)}
              onClick={() => setSelected(d)}
              style={isSelected ? { boxShadow: 'none' } : undefined}
              className={`app-press flex-1 min-w-[44px] min-h-[44px] rounded-[14px] py-2.5 flex flex-col items-center gap-0.5 ${
                isSelected ? 'app-lime-btn' : 'app-glass text-[color:var(--app-tx2)]'
              }`}
            >
              <span className="text-[9px] font-bold opacity-80">{formatDate(d, { weekday: 'short' }).toUpperCase()}</span>
              <span className="font-heading font-extrabold text-base leading-tight">{Number(d.slice(8, 10))}</span>
            </button>
          );
        })}
      </div>

      {!classes.data && classes.error ? (
        <ErrorState message={classes.error} onRetry={classes.reload} />
      ) : !classes.data || (!plans.data && !plans.error) ? (
        // Held until the plan is known too, so a Book button never turns into "Not in plan".
        <ShimmerList rows={3} label="Loading classes" />
      ) : dayClasses.length === 0 ? (
        <p className="text-center text-xs py-3.5 text-[color:var(--app-mu)]">No classes on {DAY_NAMES[weekdayOf(day)]}.</p>
      ) : (
        <ul aria-label={`Classes on ${dayLabel}`} className="flex flex-col gap-4">
          {dayClasses.map((c, i) => {
            const { tint, ink, icon: Icon } = classLook(c);
            const { button, spots } = stateOf(c);
            return (
              <li key={occurrenceKey(c)} className="app-rise app-glass rounded-[22px] p-4 flex items-center gap-3.5" style={{ '--i': i } as React.CSSProperties}>
                <div className="w-[50px] h-[50px] shrink-0 rounded-[14px] flex items-center justify-center" style={{ background: tint, color: ink }}>
                  <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-extrabold text-[15px] break-words">{c.title}</p>
                  <p className="text-[11px] mt-0.5 text-[color:var(--app-mu)] truncate">
                    {c.start_time} · {c.trainer_name ?? 'Coach to be confirmed'}
                  </p>
                  {spots && (
                    <p className="text-[10px] font-bold mt-1" style={{ color: spots.color }}>
                      {spots.text}
                    </p>
                  )}
                </div>
                {button}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => navigate('schedule', { view: 'full' })}
        className="app-glass rounded-2xl min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-bold text-[color:var(--app-lime)]"
      >
        Full timetable <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      <ConfirmDialog
        isOpen={!!toCancel}
        title="Cancel this booking?"
        message={toCancel ? `${toCancel.title} on ${formatDate(toCancel.occurrence_date, LONG_DAY)}.` : null}
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
        tone="danger"
        onConfirm={cancel}
        onClose={() => setToCancel(null)}
      />
    </div>
  );
};
