import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, Dumbbell, History, Pause, Play, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Exercise, NewWorkout, Workout, WorkoutSet } from '../../types/index.js';
import { api, isApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { addDays, formatDate, gymToday } from '../../lib/format.js';

interface WorkoutLoggerProps {
  setCurrentTab: (tab: string) => void;
}

// Server limits for POST /workouts (docs/API.md).
const LIMITS = { title: 100, notes: 1000, duration: 300, weight: 500, reps: 100, rpe: 10, setsTotal: 100, setsPerExercise: 50, daysBack: 365 };

interface DraftSet {
  key: string;
  weight: string;
  reps: string;
  rpe: string;
  warmup: boolean;
}

interface DraftExercise {
  key: string;
  exercise_id: string;
  exercise_name: string;
  sets: DraftSet[];
}

type FieldErrors = Record<string, string>;

const SERVER_SET_FIELDS: Record<string, string> = { weight_kg: 'weight', reps: 'reps', rpe: 'rpe' };

const TEMPLATES: { id: string; label: string; title: string; exerciseIds: string[] }[] = [
  { id: 'push', label: 'Push', title: 'Push day', exerciseIds: ['ex_bench_press', 'ex_incline_db_press', 'ex_overhead_press', 'ex_tricep_rope_pushdown'] },
  { id: 'pull', label: 'Pull', title: 'Pull day', exerciseIds: ['ex_deadlift', 'ex_pullup', 'ex_barbell_curl'] },
  { id: 'legs', label: 'Legs', title: 'Leg day', exerciseIds: ['ex_barbell_squat', 'ex_romanian_deadlift', 'ex_bulgarian_split_squat'] }
];

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;
const emptySet = (from?: DraftSet): DraftSet => ({ key: nextKey(), weight: from?.weight ?? '', reps: from?.reps ?? '', rpe: from?.rpe ?? '', warmup: false });

const kg = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;

/** Parse a decimal within [min, max]; null when blank or out of range. */
function inRange(value: string, min: number, max: number, integer = false): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return null;
  return n;
}

function groupSets(sets: WorkoutSet[] = []): { name: string; sets: WorkoutSet[] }[] {
  const groups = new Map<string, { name: string; sets: WorkoutSet[] }>();
  for (const s of sets) {
    const g = groups.get(s.exercise_id) ?? { name: s.exercise_name || s.exercise_id, sets: [] };
    g.sets.push(s);
    groups.set(s.exercise_id, g);
  }
  return [...groups.values()];
}

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="text-[11px] text-rose-600 dark:text-rose-300 mt-1">
      {message}
    </p>
  ) : null;

export const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({ setCurrentTab }) => {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { params } = useNavigation();

  const catalogue = useApiResource(() => api.getExercises());
  const history = useApiResource(() => api.getWorkouts());

  const today = gymToday();
  const earliest = addDays(today, -LIMITS.daysBack);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  // `fromFields`: the banner only sums up the field errors, so it goes once they are all fixed.
  const [formError, setFormError] = useState<{ message: string; fromFields: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState<Workout | null>(null);
  const [toDelete, setToDelete] = useState<Workout | null>(null);

  const catalogueById = useMemo(() => new Map((catalogue.data ?? []).map(e => [e.id, e])), [catalogue.data]);
  const totalSets = exercises.reduce((sum, e) => sum + e.sets.length, 0);

  useEffect(() => {
    if (catalogue.data?.length && !selectedExerciseId) setSelectedExerciseId(catalogue.data[0].id);
  }, [catalogue.data, selectedExerciseId]);

  // /log-workout?exercise=<id> (from the exercise library) starts with that exercise.
  const appliedParam = useRef(false);
  useEffect(() => {
    const wanted = params.get('exercise');
    if (appliedParam.current || !wanted || !catalogue.data) return;
    appliedParam.current = true;
    const ex = catalogueById.get(wanted);
    if (ex) {
      addExercise(ex);
      setSelectedExerciseId(ex.id);
    }
  }, [catalogue.data]);

  const clearError = (key: string) => {
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  /** Drop the errors of sets that are no longer on the form. */
  const forgetErrorsOf = (setKeys: string[]) =>
    setErrors(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => !setKeys.some(k => key.startsWith(`${k}.`)))));

  useEffect(() => {
    if (formError?.fromFields && !Object.values(errors).some(Boolean)) setFormError(null);
  }, [errors, formError]);

  function addExercise(ex: Exercise) {
    setExercises(prev => {
      if (prev.reduce((sum, e) => sum + e.sets.length, 0) >= LIMITS.setsTotal) return prev;
      const existing = prev.find(e => e.exercise_id === ex.id);
      if (existing) {
        if (existing.sets.length >= LIMITS.setsPerExercise) return prev;
        const last = existing.sets[existing.sets.length - 1];
        return prev.map(e => (e === existing ? { ...e, sets: [...e.sets, emptySet(last)] } : e));
      }
      return [...prev, { key: nextKey(), exercise_id: ex.id, exercise_name: ex.name, sets: [emptySet()] }];
    });
    clearError('sets');
  }

  const addSet = (group: DraftExercise) => {
    const ex = catalogueById.get(group.exercise_id);
    if (ex) addExercise(ex);
  };

  const updateSet = (groupKey: string, setKey: string, fields: Partial<DraftSet>) => {
    clearError(`${setKey}.row`);
    setExercises(prev => prev.map(g => (g.key === groupKey ? { ...g, sets: g.sets.map(s => (s.key === setKey ? { ...s, ...fields } : s)) } : g)));
  };

  const removeSet = (groupKey: string, setKey: string) => {
    forgetErrorsOf([setKey]);
    setExercises(prev =>
      prev.map(g => (g.key === groupKey ? { ...g, sets: g.sets.filter(s => s.key !== setKey) } : g)).filter(g => g.sets.length > 0)
    );
  };

  const removeExercise = (groupKey: string) => {
    forgetErrorsOf(exercises.find(g => g.key === groupKey)?.sets.map(s => s.key) ?? []);
    setExercises(prev => prev.filter(g => g.key !== groupKey));
  };

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    const available = template.exerciseIds.map(id => catalogueById.get(id)).filter((e): e is Exercise => Boolean(e));
    available.forEach(addExercise);
    if (!title.trim()) setTitle(template.title);
  };

  const resetForm = () => {
    setTitle('');
    setDate(gymToday());
    setDuration('');
    setNotes('');
    setExercises([]);
    setErrors({});
    setFormError(null);
  };

  const liveVolume = exercises.reduce(
    (sum, g) => sum + g.sets.reduce((s, set) => (set.warmup ? s : s + (inRange(set.weight, 0, LIMITS.weight) ?? 0) * (inRange(set.reps, 1, LIMITS.reps, true) ?? 0)), 0),
    0
  );

  /** Validate the form and build the request body; null (with errors set) when something is wrong. */
  const buildPayload = (): NewWorkout | null => {
    const next: FieldErrors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) next.title = 'Give the workout a title.';
    else if (trimmedTitle.length > LIMITS.title) next.title = `Use at most ${LIMITS.title} characters.`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = 'Choose a date.';
    else if (date > today) next.date = 'A workout cannot be logged for a future date.';
    else if (date < earliest) next.date = `A workout cannot be logged more than ${LIMITS.daysBack} days back.`;

    const minutes = inRange(duration, 1, LIMITS.duration, true);
    if (minutes === null) next.duration = `Enter whole minutes from 1 to ${LIMITS.duration}.`;
    if (notes.trim().length > LIMITS.notes) next.notes = `Use at most ${LIMITS.notes} characters.`;

    if (totalSets === 0) next.sets = 'Add at least one set.';
    else if (totalSets > LIMITS.setsTotal) next.sets = `A workout can have at most ${LIMITS.setsTotal} sets.`;

    const sets: NewWorkout['sets'] = [];
    for (const g of exercises) {
      g.sets.forEach((s, i) => {
        const weight = inRange(s.weight, 0, LIMITS.weight);
        const reps = inRange(s.reps, 1, LIMITS.reps, true);
        const rpe = s.rpe.trim() === '' ? undefined : inRange(s.rpe, 1, LIMITS.rpe);
        if (weight === null) next[`${s.key}.weight`] = `0–${LIMITS.weight} kg`;
        if (reps === null) next[`${s.key}.reps`] = `Whole number 1–${LIMITS.reps}`;
        if (rpe === null) next[`${s.key}.rpe`] = `1–${LIMITS.rpe}`;
        sets.push({ exercise_id: g.exercise_id, set_number: i + 1, weight_kg: weight ?? 0, reps: reps ?? 0, ...(rpe != null ? { rpe } : {}), is_warmup: s.warmup });
      });
    }

    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      setFormError({ message: 'Some fields need fixing before the workout can be saved.', fromFields: true });
      return null;
    }
    setFormError(null);
    return { title: trimmedTitle, date, duration_minutes: minutes!, ...(notes.trim() ? { notes: notes.trim() } : {}), sets };
  };

  /** Map server-side issue paths (title, sets.3.reps…) back onto the form fields; false when none of them matched a field. */
  const applyServerIssues = (issues: { path: string; message: string }[]): boolean => {
    const flat = exercises.flatMap(g => g.sets);
    const next: FieldErrors = {};
    for (const issue of issues) {
      const [head, index, field] = issue.path.split('.');
      if (head === 'sets' && index !== undefined && flat[Number(index)]) {
        // exercise_id / set_number / whole-set issues belong to the set, not to one of its inputs.
        const key = flat[Number(index)].key;
        next[`${key}.${SERVER_SET_FIELDS[field] ?? 'row'}`] = issue.message;
      } else if (head === 'duration_minutes') next.duration = issue.message;
      else if (head === 'title' || head === 'date' || head === 'notes' || head === 'sets') next[head] = issue.message;
    }
    setErrors(next);
    return Object.values(next).some(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setIsSubmitting(true);
    try {
      const workout = await api.createWorkout(payload);
      setSaved(workout);
      resetForm();
      showToast(`"${workout.title}" saved.`, 'success', 'Workout logged');
      history.reload();
      refreshUser();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
        const issues = (err.data as { issues?: { path: string; message: string }[] } | undefined)?.issues ?? [];
        setFormError({ message: err.message, fromFields: applyServerIssues(issues) });
      } else {
        setFormError({ message: isApiError(err) ? err.message : 'The workout could not be saved. Please try again.', fromFields: false });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteWorkout = async () => {
    if (!toDelete) return;
    try {
      await api.deleteWorkout(toDelete.id);
      showToast('Workout deleted.', 'info');
      if (saved?.id === toDelete.id) setSaved(null);
    } catch (err) {
      showToast(isApiError(err) ? err.message : 'The workout could not be deleted.', 'error');
    }
    history.reload();
  };

  // --- Rest timer ---
  // A running timer keeps its end time on the wall clock and works out what is left from it.
  // Phones pause timers while the screen is locked and browsers slow them in background tabs,
  // so counting ticks would fall behind.
  const [timerDuration, setTimerDuration] = useState(90);
  const [timeLeft, setTimeLeft] = useState(90);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const isTimerRunning = endsAt !== null;
  const secondsUntil = (end: number) => Math.max(0, Math.ceil((end - Date.now()) / 1000));

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setTimeLeft(secondsUntil(endsAt));
    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [endsAt]);

  useEffect(() => {
    if (endsAt !== null && timeLeft === 0) {
      setEndsAt(null);
      showToast('Rest is over. Time for your next set.', 'success', 'Rest timer');
    }
  }, [endsAt, timeLeft, showToast]);

  const toggleTimer = () => {
    if (endsAt !== null) {
      setTimeLeft(secondsUntil(endsAt));
      setEndsAt(null);
      return;
    }
    const seconds = timeLeft === 0 ? timerDuration : timeLeft;
    setTimeLeft(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  };

  const startPreset = (seconds: number) => {
    setTimerDuration(seconds);
    setTimeLeft(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  };

  const inputErr = (key: string) => (errors[key] ? 'outline outline-2 outline-rose-500/80' : '');
  const describedBy = (key: string) => (errors[key] ? `${key}-error` : undefined);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight font-['Outfit']">Log a workout</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">Record each set's weight, reps and effort. Volume counts working sets only (weight × reps).</p>
        </div>
        <div className="neu-flat px-4 py-3 rounded-2xl shrink-0 self-start md:self-auto">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Volume so far</div>
          <div className="text-xl font-black text-lime-700 dark:text-lime-400 font-mono">{kg(liveVolume)}</div>
        </div>
      </header>

      {saved && (
        <section aria-labelledby="saved-heading" className="neu-flat rounded-3xl p-5 sm:p-6 border border-lime-500/40 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="saved-heading" className="text-lg font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Saved: {saved.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {formatDate(saved.date)} · {saved.duration_minutes} min · {kg(saved.total_volume_kg ?? 0)} volume
              </p>
            </div>
            <button type="button" onClick={() => setSaved(null)} aria-label="Dismiss saved workout" className="neu-btn p-2 rounded-xl">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {groupSets(saved.sets).map(g => (
              <li key={g.name} className="neu-pressed-sm rounded-xl p-3">
                <p className="font-bold text-slate-200">{g.name}</p>
                <p className="text-slate-400 mt-0.5">
                  {g.sets.map(s => `${s.weight_kg} kg × ${s.reps}${s.is_warmup ? ' (warm-up)' : ''}`).join(', ')}
                </p>
              </li>
            ))}
          </ul>
          {saved.notes && <p className="text-xs text-slate-400 whitespace-pre-line">{saved.notes}</p>}
          {/* Progress charts live on the member dashboard; coaches and admins see their workouts under Recent workouts here. */}
          {user?.role === 'member' && (
            <button type="button" onClick={() => setCurrentTab('member-dashboard')} className="neu-btn px-4 py-2 rounded-xl text-xs font-bold">
              See my progress
            </button>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <form onSubmit={handleSubmit} noValidate className="lg:col-span-8 space-y-6" aria-label="New workout">
          <div className="neu-flat p-4 sm:p-6 rounded-2xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="wk-title" className="block text-xs font-bold text-slate-300 mb-1.5">Title</label>
                <input
                  id="wk-title"
                  type="text"
                  value={title}
                  maxLength={LIMITS.title}
                  onChange={e => {
                    setTitle(e.target.value);
                    clearError('title');
                  }}
                  placeholder="e.g. Upper body"
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={describedBy('title')}
                  className={`w-full px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 ${inputErr('title')}`}
                />
                <FieldError id="title-error" message={errors.title} />
              </div>
              <div>
                <label htmlFor="wk-date" className="block text-xs font-bold text-slate-300 mb-1.5">Date</label>
                <input
                  id="wk-date"
                  type="date"
                  value={date}
                  min={earliest}
                  max={today}
                  onChange={e => {
                    setDate(e.target.value);
                    clearError('date');
                  }}
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={describedBy('date')}
                  className={`w-full px-3.5 py-2.5 text-sm text-slate-100 ${inputErr('date')}`}
                />
                <FieldError id="date-error" message={errors.date} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="wk-duration" className="block text-xs font-bold text-slate-300 mb-1.5">Duration (minutes)</label>
                <input
                  id="wk-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LIMITS.duration}
                  step={1}
                  value={duration}
                  onChange={e => {
                    setDuration(e.target.value);
                    clearError('duration');
                  }}
                  aria-invalid={Boolean(errors.duration)}
                  aria-describedby={describedBy('duration')}
                  className={`w-full px-3.5 py-2.5 text-sm text-slate-100 ${inputErr('duration')}`}
                />
                <FieldError id="duration-error" message={errors.duration} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="wk-notes" className="block text-xs font-bold text-slate-300 mb-1.5">Notes (optional)</label>
                <textarea
                  id="wk-notes"
                  rows={1}
                  value={notes}
                  maxLength={LIMITS.notes}
                  onChange={e => {
                    setNotes(e.target.value);
                    clearError('notes');
                  }}
                  aria-invalid={Boolean(errors.notes)}
                  aria-describedby={describedBy('notes')}
                  className={`w-full px-3.5 py-2.5 text-sm text-slate-100 resize-y ${inputErr('notes')}`}
                />
                <FieldError id="notes-error" message={errors.notes} />
              </div>
            </div>
          </div>

          <div className="neu-flat p-4 sm:p-6 rounded-2xl space-y-4">
            {!catalogue.data && catalogue.error ? (
              <ErrorState message={`The exercise list could not be loaded. ${catalogue.error}`} onRetry={catalogue.reload} />
            ) : !catalogue.data ? (
              <LoadingState label="Loading exercises…" className="py-6" />
            ) : catalogue.data.length === 0 ? (
              <EmptyState title="No exercises available" body="The gym has not added any exercises yet." />
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="wk-exercise" className="block text-xs font-bold text-slate-300 mb-1.5">Exercise</label>
                    <select id="wk-exercise" value={selectedExerciseId} onChange={e => setSelectedExerciseId(e.target.value)} className="w-full text-sm text-slate-100 px-3.5 py-2.5">
                      {catalogue.data.map(ex => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} ({ex.category}, {ex.equipment})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const ex = catalogueById.get(selectedExerciseId);
                      if (ex) addExercise(ex);
                    }}
                    disabled={!selectedExerciseId || totalSets >= LIMITS.setsTotal}
                    className="neu-btn-lime px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" /> Add set
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400">Quick start:</span>
                  {TEMPLATES.map(t => (
                    <button key={t.id} type="button" onClick={() => applyTemplate(t)} className="neu-btn px-3 py-1.5 rounded-xl text-xs font-bold">
                      {t.label}
                    </button>
                  ))}
                  <span className="text-[11px] text-slate-500">adds the exercises; you fill in the numbers</span>
                </div>
              </>
            )}
          </div>

          <section aria-labelledby="sets-heading" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="sets-heading" className="text-base font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Sets ({totalSets}/{LIMITS.setsTotal})
              </h2>
              <span className="text-[11px] text-slate-400">Warm-ups are not counted in volume</span>
            </div>
            {errors.sets && (
              <p className="text-xs text-rose-600 dark:text-rose-300" role="alert">
                {errors.sets}
              </p>
            )}

            {exercises.length === 0 ? (
              <div className="neu-pressed-sm rounded-2xl p-8 text-center text-xs text-slate-400">No sets yet. Choose an exercise above and add your first set.</div>
            ) : (
              exercises.map(group => (
                <div key={group.key} className="neu-flat rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-sm text-slate-100 min-w-0 break-words">{group.exercise_name}</h3>
                    <button
                      type="button"
                      onClick={() => removeExercise(group.key)}
                      aria-label={`Remove ${group.exercise_name} and its sets`}
                      className="neu-icon-btn neu-icon-btn-danger w-8 h-8 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <ol className="space-y-2">
                    {group.sets.map((s, i) => {
                      const id = `set-${s.key}`;
                      const setLabel = `${group.exercise_name}, set ${i + 1}`;
                      return (
                        <li key={s.key} className="neu-pressed-sm rounded-xl p-3">
                          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                            <span className="w-full sm:w-12 text-xs font-bold text-slate-300 sm:pt-6">Set {i + 1}</span>
                            <div className="w-[calc(33%-0.5rem)] sm:w-24">
                              <label htmlFor={`${id}-w`} className="block text-[11px] text-slate-400 mb-1">Weight (kg)</label>
                              <input
                                id={`${id}-w`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={LIMITS.weight}
                                step={0.5}
                                value={s.weight}
                                onChange={e => {
                                  updateSet(group.key, s.key, { weight: e.target.value });
                                  clearError(`${s.key}.weight`);
                                }}
                                aria-invalid={Boolean(errors[`${s.key}.weight`])}
                                aria-describedby={describedBy(`${s.key}.weight`)}
                                aria-label={`${setLabel}: weight in kg`}
                                className={`w-full px-2 py-1.5 text-sm text-center font-bold text-slate-100 font-mono ${inputErr(`${s.key}.weight`)}`}
                              />
                              <FieldError id={`${s.key}.weight-error`} message={errors[`${s.key}.weight`]} />
                            </div>
                            <div className="w-[calc(33%-0.5rem)] sm:w-20">
                              <label htmlFor={`${id}-r`} className="block text-[11px] text-slate-400 mb-1">Reps</label>
                              <input
                                id={`${id}-r`}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={LIMITS.reps}
                                step={1}
                                value={s.reps}
                                onChange={e => {
                                  updateSet(group.key, s.key, { reps: e.target.value });
                                  clearError(`${s.key}.reps`);
                                }}
                                aria-invalid={Boolean(errors[`${s.key}.reps`])}
                                aria-describedby={describedBy(`${s.key}.reps`)}
                                aria-label={`${setLabel}: reps`}
                                className={`w-full px-2 py-1.5 text-sm text-center font-bold text-slate-100 font-mono ${inputErr(`${s.key}.reps`)}`}
                              />
                              <FieldError id={`${s.key}.reps-error`} message={errors[`${s.key}.reps`]} />
                            </div>
                            <div className="w-[calc(33%-0.5rem)] sm:w-20">
                              <label htmlFor={`${id}-rpe`} className="block text-[11px] text-slate-400 mb-1">RPE (opt.)</label>
                              <input
                                id={`${id}-rpe`}
                                type="number"
                                inputMode="decimal"
                                min={1}
                                max={LIMITS.rpe}
                                step={0.5}
                                value={s.rpe}
                                onChange={e => {
                                  updateSet(group.key, s.key, { rpe: e.target.value });
                                  clearError(`${s.key}.rpe`);
                                }}
                                aria-invalid={Boolean(errors[`${s.key}.rpe`])}
                                aria-describedby={describedBy(`${s.key}.rpe`)}
                                aria-label={`${setLabel}: effort, RPE 1 to 10`}
                                className={`w-full px-2 py-1.5 text-sm text-center font-bold text-slate-100 font-mono ${inputErr(`${s.key}.rpe`)}`}
                              />
                              <FieldError id={`${s.key}.rpe-error`} message={errors[`${s.key}.rpe`]} />
                            </div>
                            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none sm:pt-6">
                              <input type="checkbox" checked={s.warmup} onChange={e => updateSet(group.key, s.key, { warmup: e.target.checked })} className="w-4 h-4 accent-lime-500" />
                              Warm-up
                            </label>
                            <button
                              type="button"
                              onClick={() => removeSet(group.key, s.key)}
                              aria-label={`Remove ${setLabel}`}
                              className="neu-icon-btn neu-icon-btn-danger ml-auto w-8 h-8 shrink-0 sm:mt-5"
                            >
                              <X className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                          {errors[`${s.key}.row`] && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-300 mt-2" role="alert">
                              {setLabel}: {errors[`${s.key}.row`]}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    type="button"
                    onClick={() => addSet(group)}
                    disabled={group.sets.length >= LIMITS.setsPerExercise || totalSets >= LIMITS.setsTotal}
                    className="neu-btn px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add set {group.sets.length + 1}
                  </button>
                </div>
              ))
            )}
          </section>

          {formError && (
            <p role="alert" className="rounded-xl p-3 text-sm border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200">
              {formError.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 neu-btn-lime rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" aria-hidden="true" /> {isSubmitting ? 'Saving…' : 'Save workout'}
          </button>
        </form>

        <aside className="lg:col-span-4 space-y-6">
          <section aria-labelledby="timer-heading" className="neu-flat p-5 sm:p-6 rounded-3xl space-y-4">
            <h2 id="timer-heading" className="text-sm font-extrabold text-slate-100 flex items-center gap-2 font-['Outfit']">
              <Clock className="w-4 h-4 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Rest timer
            </h2>
            <div className="text-center">
              <div role="timer" aria-live="off" className="text-5xl font-black font-mono text-lime-700 dark:text-lime-400 tracking-tight">
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </div>
              <div className="w-full h-2 neu-pressed-sm rounded-full overflow-hidden mt-3" aria-hidden="true">
                <div className="h-full bg-lime-500 transition-all duration-1000 rounded-full" style={{ width: `${(timeLeft / timerDuration) * 100}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={toggleTimer} className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${isTimerRunning ? 'neu-btn' : 'neu-btn-lime'}`}>
                {isTimerRunning ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
                {isTimerRunning ? 'Pause' : 'Start'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEndsAt(null);
                  setTimeLeft(timerDuration);
                }}
                aria-label="Reset timer"
                className="neu-btn p-2.5 rounded-xl"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Rest length">
              {[45, 60, 90, 180].map(sec => (
                <button key={sec} type="button" aria-pressed={timerDuration === sec} onClick={() => startPreset(sec)} className={`py-1.5 rounded-lg text-xs font-bold ${timerDuration === sec ? 'neu-btn-lime' : 'neu-btn'}`}>
                  {sec}s
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="history-heading" className="neu-flat p-5 sm:p-6 rounded-3xl space-y-3">
            <h2 id="history-heading" className="text-sm font-extrabold text-slate-100 flex items-center gap-2 font-['Outfit']">
              <History className="w-4 h-4 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Recent workouts
            </h2>
            {!history.data && history.error ? (
              <ErrorState message={history.error} onRetry={history.reload} />
            ) : !history.data ? (
              <LoadingState className="py-6" />
            ) : history.data.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.data.slice(0, 5).map(w => {
                  const groups = groupSets(w.sets);
                  return (
                    <li key={w.id} className="neu-pressed-sm rounded-xl p-3 text-xs flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200 break-words">{w.title}</p>
                        <p className="text-slate-400 mt-0.5">
                          {formatDate(w.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {w.duration_minutes} min · {kg(w.total_volume_kg ?? 0)}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          {groups.length} {groups.length === 1 ? 'exercise' : 'exercises'}, {w.sets?.length ?? 0} sets
                        </p>
                      </div>
                      <button type="button" onClick={() => setToDelete(w)} aria-label={`Delete workout ${w.title}`} className="neu-icon-btn neu-icon-btn-danger w-8 h-8 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={toDelete !== null}
        title="Delete this workout?"
        message={toDelete ? `"${toDelete.title}" from ${formatDate(toDelete.date)} and all its sets will be removed. This cannot be undone.` : null}
        confirmLabel="Delete workout"
        tone="danger"
        onConfirm={deleteWorkout}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
};
