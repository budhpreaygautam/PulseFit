import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, errorMessage } from '../../api/client.js';
import { NewWorkout, WorkoutAnalytics } from '../../types/index.js';
import { ErrorState } from '../../components/common/States.js';
import { TabLink } from '../../components/public/TabLink.js';
import { mondayOf, weekdayOf } from '../../components/public/gymInfo.js';
import { FloorClockCard } from '../../components/member/FloorClockCard.js';
import { ProgressSection } from '../../components/member/ProgressSection.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { WORKOUT_LIMITS, inRange } from '../../components/member/workoutLimits.js';
import { clearDraft, loadDraft, saveDraft, type TrainDraft } from '../../components/app/trainDraft.js';
import { ShimmerList } from '../../components/app/ui.js';
import { addDays, formatDate, gymToday } from '../../lib/format.js';
import { riseOrder } from '../../lib/appMotion.js';

type Records = WorkoutAnalytics['personalRecords'];

const EMPTY_DRAFT: TrainDraft = { title: '', startedAt: 0, exercises: [] };
const kg = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

/**
 * The request body for a finished draft, sets numbered per exercise: logged for the gym day of its first
 * set and timed from there to now. A draft left from an earlier day ends at its last set, so it is never
 * saved as today's workout (which would credit today's streak and points) nor stretched to the cap.
 */
export function toNewWorkout(draft: TrainDraft, today: string, now: number): NewWorkout {
  const date = gymToday(new Date(draft.startedAt));
  const end = date === today ? now : (draft.lastSetAt ?? draft.startedAt);
  const minutes = Math.round((end - draft.startedAt) / 60_000);
  return {
    title: draft.title.trim() || 'Workout',
    date,
    duration_minutes: Math.min(Math.max(minutes, 1), WORKOUT_LIMITS.duration),
    sets: draft.exercises.flatMap(e => e.sets.map((s, i) => ({ exercise_id: e.exercise_id, set_number: i + 1, weight_kg: s.weight_kg, reps: s.reps, is_warmup: false })))
  };
}

/** Volume per day of today's week (Mon–Sun), and the change on last week's total (null when that was 0). */
export function weekVolumes(timeline: WorkoutAnalytics['volumeTimeline'], today: string): { days: number[]; changePct: number | null } {
  const monday = mondayOf(today);
  const days = [0, 0, 0, 0, 0, 0, 0];
  let lastWeek = 0;
  for (const p of timeline) {
    if (mondayOf(p.date) === monday) days[(weekdayOf(p.date) + 6) % 7] += p.volumeKg;
    else if (mondayOf(p.date) === addDays(monday, -7)) lastWeek += p.volumeKg;
  }
  const thisWeek = days.reduce((sum, v) => sum + v, 0);
  return { days, changePct: lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100) };
}

/** Records beaten: exercises whose best got higher. A first record for an exercise is not counted. */
export function newRecords(before: Records, after: Records): number {
  const best = new Map(before.map(r => [r.exerciseId, r.e1rm]));
  return after.filter(r => r.e1rm > (best.get(r.exerciseId) ?? Infinity)).length;
}

/**
 * The app's Train tab (handoff 1a → Train): this week's volume and a quick logger kept on the phone
 * until Finish, in the handoff's order, then the floor clock and progress. Back-dating, RPE,
 * templates, the rest timer and the history stay on the full logger.
 */
export const TrainScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { navigate } = useNavigation();
  const { showToast } = useToast();
  const userId = user?.id ?? '';

  const catalogue = useApiResource(() => api.getExercises());
  const analytics = useApiResource(() => api.getWorkoutAnalytics());
  const timeStats = useApiResource(() => api.getMyTimeTrackingStats());
  const plans = useApiResource(() => api.getPlans());

  const [draft, setDraft] = useState<TrainDraft>(() => loadDraft(userId) ?? EMPTY_DRAFT);
  // What is typed per exercise; until then the inputs repeat the exercise's last set.
  const [inputs, setInputs] = useState<Record<string, { weight: string; reps: string }>>({});
  const [chosen, setChosen] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [saved, setSaved] = useState<{ prs: number } | null>(null);
  // The records before the next save: null while unknown, so a Finish never claims records it cannot compare.
  const [records, setRecords] = useState<Records | null>(null);
  const [now, setNow] = useState(Date.now);

  const totalSets = draft.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const hasSets = totalSets > 0;

  useEffect(() => {
    if (analytics.data) setRecords(analytics.data.personalRecords);
  }, [analytics.data]);

  // The header's minutes move on while sets are being logged.
  useEffect(() => {
    if (!hasSets) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [hasSets]);

  if (!user) return null;

  /** Every change is kept on the phone straight away, and starts a new workout after a save. */
  const update = (next: TrainDraft) => {
    setDraft(next);
    saveDraft(user.id, next);
    setSaved(null);
  };

  const addExercise = () => {
    const ex = catalogue.data?.find(e => e.id === chosen);
    if (!ex) return;
    update({ ...draft, exercises: [...draft.exercises, { exercise_id: ex.id, exercise_name: ex.name, sets: [] }] });
    setChosen('');
  };

  const addSet = (exerciseId: string, set: { weight_kg: number; reps: number }) =>
    update({
      ...draft,
      startedAt: hasSets ? draft.startedAt : Date.now(),
      lastSetAt: Date.now(),
      exercises: draft.exercises.map(e => (e.exercise_id === exerciseId ? { ...e, sets: [...e.sets, set] } : e))
    });

  // As on the full logger, an exercise goes with its last set.
  const removeSet = (exerciseId: string, index: number) =>
    update({
      ...draft,
      exercises: draft.exercises.map(e => (e.exercise_id === exerciseId ? { ...e, sets: e.sets.filter((_, i) => i !== index) } : e)).filter(e => e.sets.length > 0)
    });

  const finish = async () => {
    const before = records;
    setFinishing(true);
    try {
      await api.createWorkout(toNewWorkout(draft, gymToday(), Date.now()));
    } catch (err) {
      // The draft stays, so nothing logged is lost.
      showToast(errorMessage(err), 'error');
      setFinishing(false);
      return;
    }
    let after: Records | null = null;
    try {
      after = (await api.getWorkoutAnalytics()).personalRecords;
      setRecords(after);
    } catch {
      /* saved all the same; only the record count is unknown */
    }
    clearDraft(user.id);
    setDraft(EMPTY_DRAFT);
    setInputs({});
    setSaved({ prs: before && after ? newRecords(before, after) : 0 });
    setFinishing(false);
    refreshUser();
    analytics.reload();
  };

  const week = analytics.data ? weekVolumes(analytics.data.volumeTimeline, gymToday()) : null;
  const weekMax = week ? Math.max(...week.days) : 0;
  const todayIndex = (weekdayOf(gymToday()) + 6) % 7;
  const draftDay = gymToday(new Date(draft.startedAt));
  const savedLabel = saved && `Saved · nice work${saved.prs > 0 ? `, ${saved.prs} PR${saved.prs === 1 ? '' : 's'}` : ''}`;
  const inDraft = new Set(draft.exercises.map(e => e.exercise_id));
  const rise = riseOrder();

  return (
    <div className="app-screen flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-heading font-black text-[26px]">Workout</h1>
        {hasSets && (
          <span className="text-[11px] font-semibold text-[color:var(--app-mu)] truncate pb-1">
            {draft.title.trim() || 'Workout'} ·{' '}
            {/* A draft from an earlier day says which day Finish logs it for. */}
            {draftDay === gymToday() ? `${Math.max(0, Math.round((now - draft.startedAt) / 60_000))} min` : formatDate(draftDay, { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {week ? (
        <div role="img" aria-label={`Volume this week: ${kg(week.days.reduce((sum, v) => sum + v, 0))} kg`} className="app-rise app-glass rounded-[22px] p-4" style={rise()}>
          <div className="flex justify-between text-[11px] font-bold mb-2.5 text-[color:var(--app-mu)]">
            <span>Volume this week</span>
            {week.changePct !== null && (
              <span style={{ color: week.changePct >= 0 ? 'var(--app-lime)' : 'var(--app-amber-tx)' }}>
                {week.changePct >= 0 ? '+' : '−'}
                {Math.abs(week.changePct)}%
              </span>
            )}
          </div>
          {/* 70 px with the day letters, as in the handoff's markup. */}
          <div className="flex gap-2 h-[70px]">
            {week.days.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex-1 w-full flex items-end">
                  <div
                    data-today={i === todayIndex || undefined}
                    className="app-fill-y w-full rounded-md"
                    style={{ height: `${Math.max(weekMax ? (v / weekMax) * 100 : 0, 4)}%`, background: i === todayIndex ? '#84cc16' : 'var(--gym-700)' }}
                  />
                </div>
                <span className="text-[9px] font-bold text-[color:var(--app-mu)]">{'MTWTFSS'[i]}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        !analytics.error && <ShimmerList rows={1} label="Loading this week's volume" className="app-rise" style={rise()} />
      )}

      <input
        type="text"
        aria-label="Workout name"
        placeholder="Workout name (optional)"
        maxLength={WORKOUT_LIMITS.title}
        value={draft.title}
        onChange={e => update({ ...draft, title: e.target.value })}
        className="w-full min-h-[44px] px-3.5 rounded-xl text-sm"
      />

      {draft.exercises.map(e => {
        const last = e.sets[e.sets.length - 1];
        const typed = inputs[e.exercise_id] ?? { weight: last ? String(last.weight_kg) : '', reps: last ? String(last.reps) : '' };
        const weight = inRange(typed.weight, 0, WORKOUT_LIMITS.weight);
        const reps = inRange(typed.reps, 1, WORKOUT_LIMITS.reps, true);
        const full = e.sets.length >= WORKOUT_LIMITS.setsPerExercise || totalSets >= WORKOUT_LIMITS.setsTotal;
        const type = (field: 'weight' | 'reps', value: string) => setInputs(prev => ({ ...prev, [e.exercise_id]: { ...typed, [field]: value } }));
        return (
          <section key={e.exercise_id} aria-label={e.exercise_name} className="app-rise app-glass rounded-[22px] p-4" style={rise()}>
            <div className="flex justify-between items-center gap-3">
              <h2 className="font-heading font-extrabold text-[15px] break-words min-w-0">{e.exercise_name}</h2>
              <span className="text-[10px] font-bold shrink-0 text-[color:var(--app-mu)]">
                {e.sets.length} {e.sets.length === 1 ? 'set' : 'sets'}
              </span>
            </div>
            {e.sets.length > 0 && (
              <ul className="flex flex-wrap gap-2 mt-3">
                {e.sets.map((s, i) => (
                  <li key={i} className="app-inset rounded-[10px] pl-[11px] flex items-center text-xs font-bold">
                    <span>
                      {s.weight_kg}×{s.reps}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove set ${i + 1} of ${e.exercise_name}`}
                      onClick={() => removeSet(e.exercise_id, i)}
                      className="w-11 h-11 -my-1 flex items-center justify-center text-[color:var(--app-mu)]"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <input
                type="number"
                inputMode="decimal"
                aria-label="Weight (kg)"
                placeholder="kg"
                min={0}
                max={WORKOUT_LIMITS.weight}
                step={0.5}
                value={typed.weight}
                onChange={ev => type('weight', ev.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl text-sm"
              />
              <input
                type="number"
                inputMode="numeric"
                aria-label="Reps"
                placeholder="reps"
                min={1}
                max={WORKOUT_LIMITS.reps}
                step={1}
                value={typed.reps}
                onChange={ev => type('reps', ev.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl text-sm"
              />
            </div>
            <button
              type="button"
              disabled={weight === null || reps === null || full}
              onClick={() => addSet(e.exercise_id, { weight_kg: weight!, reps: reps! })}
              className="app-press mt-3 w-full min-h-[44px] rounded-xl border border-[rgba(132,204,22,0.4)] text-[11px] font-extrabold flex items-center justify-center gap-1.5 text-[color:var(--app-lime)] disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {e.sets.length ? 'Add set (repeat last)' : 'Add set'}
            </button>
          </section>
        );
      })}

      {!catalogue.data && catalogue.error ? (
        <ErrorState message={catalogue.error} onRetry={catalogue.reload} />
      ) : (
        <div className="flex gap-2">
          <select
            id="train-exercise"
            aria-label="Exercise"
            value={chosen}
            onChange={e => setChosen(e.target.value)}
            className="flex-1 min-w-0 px-3.5 py-3 rounded-xl text-sm"
          >
            <option value="">Choose an exercise</option>
            {catalogue.data
              ?.filter(ex => !inDraft.has(ex.id))
              .map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
          </select>
          <button type="button" disabled={!chosen} onClick={addExercise} className="app-press app-glass shrink-0 min-h-[44px] px-4 rounded-xl text-xs font-bold text-[color:var(--app-tx2)] disabled:opacity-50">
            Add exercise
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={!hasSets || finishing}
        onClick={finish}
        style={saved ? { background: 'var(--gym-700)', color: 'var(--app-tx)' } : undefined}
        className={`app-press w-full min-h-[44px] rounded-2xl p-[15px] text-sm font-extrabold ${saved ? '' : 'app-lime-btn disabled:opacity-50'}`}
      >
        {savedLabel || 'Finish workout'}
      </button>
      {/* The button's new label is read out here; a disabled button's own text change is not. */}
      <p role="status" className="sr-only">
        {savedLabel}
      </p>

      <div className="app-rise" style={rise()}>
        <FloorClockCard
          user={user}
          stats={timeStats}
          plans={plans.data}
          onSessionChange={() => {
            refreshUser();
            analytics.reload();
          }}
          onOpenPricing={() => navigate('pricing')}
          onOpenProfile={() => navigate('profile', { tab: 'membership' })}
        />
      </div>

      <ProgressSection analytics={analytics} onLogWorkout={() => document.getElementById('train-exercise')?.focus()} />

      <TabLink
        tab="workout-logger"
        params={{ view: 'full' }}
        navigate={navigate}
        className="app-glass rounded-2xl min-h-[44px] flex items-center justify-center text-xs font-bold text-[color:var(--app-lime)]"
      >
        Workout log &amp; history
      </TabLink>
    </div>
  );
};
