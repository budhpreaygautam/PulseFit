import React, { useState, useEffect } from 'react';
import {
  Dumbbell,
  Plus,
  Trash2,
  Save,
  Clock,
  Flame,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Layers,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Trophy
} from 'lucide-react';
import { Exercise, WorkoutSet } from '../../types/index.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { Badge } from '../../components/common/Badge.js';

interface WorkoutLoggerProps {
  setCurrentTab: (tab: string) => void;
}

export const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({ setCurrentTab }) => {
  const { user, triggerCelebration } = useAuth();
  const { showToast } = useToast();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [title, setTitle] = useState<string>('Upper Body Strength & Hypertrophy');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState<string>('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active workout sets state
  const [sets, setSets] = useState<WorkoutSet[]>([
    { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 1, weight_kg: 60, reps: 10, rpe: 6, is_warmup: true },
    { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 2, weight_kg: 80, reps: 8, rpe: 7.5, is_warmup: false },
    { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 3, weight_kg: 95, reps: 6, rpe: 8.5, is_warmup: false },
    { exercise_id: 'ex_incline_db_press', exercise_name: 'Incline Dumbbell Press', set_number: 1, weight_kg: 32, reps: 10, rpe: 8, is_warmup: false },
    { exercise_id: 'ex_incline_db_press', exercise_name: 'Incline Dumbbell Press', set_number: 2, weight_kg: 34, reps: 8, rpe: 8.5, is_warmup: false }
  ]);

  // --- Rest Stopwatch Timer State ---
  const [timerDuration, setTimerDuration] = useState<number>(90);
  const [timeLeft, setTimeLeft] = useState<number>(90);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  useEffect(() => {
    api.getExercises().then(data => {
      setExercises(data);
      if (data.length > 0 && !selectedExerciseId) {
        setSelectedExerciseId(data[0].id);
      }
    }).catch(console.error);
  }, []);

  // Timer Tick Hook
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      showToast('⏰ Rest period complete! Time for the next set.', 'success', 'Rest Timer');
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft, showToast]);

  const startTimer = (seconds: number) => {
    setTimerDuration(seconds);
    setTimeLeft(seconds);
    setIsTimerRunning(true);
  };

  // Routine Presets
  const applyPreset = (presetName: string) => {
    if (presetName === 'push') {
      setTitle('Push Day: Chest, Shoulders & Triceps');
      setSets([
        { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 1, weight_kg: 60, reps: 10, rpe: 6, is_warmup: true },
        { exercise_id: 'ex_bench_press', exercise_name: 'Barbell Flat Bench Press', set_number: 2, weight_kg: 85, reps: 6, rpe: 8, is_warmup: false },
        { exercise_id: 'ex_incline_db_press', exercise_name: 'Incline Dumbbell Press', set_number: 1, weight_kg: 30, reps: 10, rpe: 8, is_warmup: false },
        { exercise_id: 'ex_overhead_press', exercise_name: 'Barbell Overhead Military Press', set_number: 1, weight_kg: 50, reps: 8, rpe: 8, is_warmup: false },
        { exercise_id: 'ex_tricep_rope_pushdown', exercise_name: 'Tricep Rope Pushdown', set_number: 1, weight_kg: 25, reps: 15, rpe: 8, is_warmup: false }
      ]);
    } else if (presetName === 'pull') {
      setTitle('Pull Day: Back, Rear Delts & Biceps');
      setSets([
        { exercise_id: 'ex_deadlift', exercise_name: 'Conventional Barbell Deadlift', set_number: 1, weight_kg: 100, reps: 8, rpe: 6, is_warmup: true },
        { exercise_id: 'ex_deadlift', exercise_name: 'Conventional Barbell Deadlift', set_number: 2, weight_kg: 150, reps: 5, rpe: 8.5, is_warmup: false },
        { exercise_id: 'ex_pullup', exercise_name: 'Weighted / Bodyweight Pull-Up', set_number: 1, weight_kg: 0, reps: 10, rpe: 8, is_warmup: false },
        { exercise_id: 'ex_barbell_curl', exercise_name: 'EZ-Bar Bicep Curl', set_number: 1, weight_kg: 35, reps: 12, rpe: 8.5, is_warmup: false }
      ]);
    } else if (presetName === 'legs') {
      setTitle('Leg Day: Quad, Hamstring & Glute Focus');
      setSets([
        { exercise_id: 'ex_barbell_squat', exercise_name: 'Barbell Back Squat', set_number: 1, weight_kg: 80, reps: 10, rpe: 6, is_warmup: true },
        { exercise_id: 'ex_barbell_squat', exercise_name: 'Barbell Back Squat', set_number: 2, weight_kg: 120, reps: 6, rpe: 8.5, is_warmup: false },
        { exercise_id: 'ex_romanian_deadlift', exercise_name: 'Romanian Deadlift (RDL)', set_number: 1, weight_kg: 90, reps: 10, rpe: 8, is_warmup: false },
        { exercise_id: 'ex_bulgarian_split_squat', exercise_name: 'Bulgarian Split Squat', set_number: 1, weight_kg: 20, reps: 12, rpe: 8.5, is_warmup: false }
      ]);
    }
    showToast(`Loaded "${presetName.toUpperCase()}" template!`, 'info');
  };

  const addSetForExercise = (exerciseId: string) => {
    const ex = exercises.find(e => e.id === exerciseId);
    const exName = ex ? ex.name : 'Exercise';
    const exerciseSets = sets.filter(s => s.exercise_id === exerciseId);
    const lastSet = exerciseSets[exerciseSets.length - 1];

    const newSet: WorkoutSet = {
      exercise_id: exerciseId,
      exercise_name: exName,
      set_number: exerciseSets.length + 1,
      weight_kg: lastSet ? lastSet.weight_kg : 50,
      reps: lastSet ? lastSet.reps : 10,
      rpe: 8,
      is_warmup: false
    };

    setSets(prev => [...prev, newSet]);
  };

  const updateSet = (index: number, fields: Partial<WorkoutSet>) => {
    setSets(prev => prev.map((s, idx) => (idx === index ? { ...s, ...fields } : s)));
  };

  const removeSet = (index: number) => {
    setSets(prev => prev.filter((_, idx) => idx !== index));
  };

  // Compute live volume
  const totalVolume = sets.reduce((sum, s) => {
    if (!s.is_warmup && s.weight_kg > 0 && s.reps > 0) {
      return sum + s.weight_kg * s.reps;
    }
    return sum;
  }, 0);

  const handleSubmitWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sets.length === 0) {
      showToast('Please add at least 1 exercise set before saving', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createWorkout({
        title,
        date,
        duration_minutes: Number(durationMinutes),
        notes,
        sets
      });

      triggerCelebration();
      showToast('Workout successfully recorded & streak updated!', 'success', 'Session Saved');
      setCurrentTab('member-dashboard');
    } catch (err: any) {
      showToast(err.message || 'Failed to save workout', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10 pb-28 lg:pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <Badge variant="amber">PERFORMANCE TRACKER</Badge>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-2 font-['Outfit']">
            LIVE WORKOUT LOGGER
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Log set-by-set weights, reps, and RPE. Real-time tonnage calculation and integrated rest interval timer.
          </p>
        </div>

        {/* Live Volume Counter Pill */}
        <div className="bg-gym-900 border border-lime-500/30 p-3.5 sm:p-4 rounded-2xl flex items-center gap-3.5 shadow-glow-lime shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center font-black shrink-0">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Lifted Volume</div>
            <div className="text-xl sm:text-2xl font-black text-lime-400 font-mono">
              {totalVolume.toLocaleString()} <span className="text-xs text-slate-300 font-sans">kg</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Col: Main Workout Form & Sets (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Routine Presets Bar */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-lime-400" /> Quick Split Templates:
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyPreset('push')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
              >
                PPL — Push
              </button>
              <button
                type="button"
                onClick={() => applyPreset('pull')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
              >
                PPL — Pull
              </button>
              <button
                type="button"
                onClick={() => applyPreset('legs')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
              >
                PPL — Legs
              </button>
            </div>
          </div>

          {/* Session Metadata Inputs */}
          <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Workout Session Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Chest & Shoulder Hypertrophy"
                  className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-lime-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-lime-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Session Notes / Cues
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Focused on slow eccentric tempo."
                  className="w-full px-3.5 py-2.5 bg-gym-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
                />
              </div>
            </div>
          </div>

          {/* Add Exercise Bar */}
          <div className="p-4 rounded-2xl bg-gym-900 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1">
              <label className="block text-[11px] sm:text-xs font-bold text-slate-300 mb-1">
                Select Exercise:
              </label>
              <select
                value={selectedExerciseId}
                onChange={e => setSelectedExerciseId(e.target.value)}
                className="w-full bg-gym-950 border border-slate-700 text-xs sm:text-sm text-slate-100 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-lime-500"
              >
                {exercises.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.category} • {ex.equipment})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedExerciseId) {
                  addSetForExercise(selectedExerciseId);
                  showToast('Set added to workout!', 'info');
                }
              }}
              className="px-5 py-2.5 bg-lime-500 hover:bg-lime-400 text-black font-extrabold text-xs rounded-xl shadow-glow-lime flex items-center justify-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Set
            </button>
          </div>

          {/* Sets Table */}
          <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <Dumbbell className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400" />
                Sets ({sets.length})
              </h3>
              <span className="text-[10px] sm:text-xs text-slate-400">Warmups excluded from volume</span>
            </div>

            {sets.length > 0 ? (
              <div className="space-y-3">
                {sets.map((set, index) => (
                  <div
                    key={index}
                    className={`p-3.5 sm:p-4 rounded-xl border flex flex-col gap-3 transition-all ${
                      set.is_warmup
                        ? 'bg-slate-900/40 border-slate-800/80 text-slate-400'
                        : 'bg-gym-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-mono flex items-center justify-center text-slate-300 shrink-0">
                          {set.set_number}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[200px] sm:max-w-none">
                          {set.exercise_name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {set.is_warmup ? '(Warmup)' : '(Working)'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeSet(index)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                        title="Remove Set"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Inputs Row */}
                    <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">Weight:</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={set.weight_kg}
                          onChange={e => updateSet(index, { weight_kg: Number(e.target.value) })}
                          className="w-16 sm:w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-center font-bold text-white focus:outline-none focus:border-lime-500 font-mono"
                        />
                        <span className="text-[11px] text-slate-400">kg</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">Reps:</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={set.reps}
                          onChange={e => updateSet(index, { reps: Number(e.target.value) })}
                          className="w-14 sm:w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-center font-bold text-white focus:outline-none focus:border-lime-500 font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">RPE:</span>
                        <select
                          value={set.rpe || 8}
                          onChange={e => updateSet(index, { rpe: Number(e.target.value) })}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                        >
                          {[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(v => (
                            <option key={v} value={v}>
                              @{v}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Warmup Checkbox */}
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none ml-auto">
                        <input
                          type="checkbox"
                          checked={set.is_warmup || false}
                          onChange={e => updateSet(index, { is_warmup: e.target.checked })}
                          className="rounded text-lime-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span className="text-[11px]">Warmup</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-xs">
                No sets in this session. Choose an exercise above to begin.
              </div>
            )}
          </div>

          {/* Submit Workout Button */}
          <button
            type="button"
            onClick={handleSubmitWorkout}
            disabled={isSubmitting || sets.length === 0}
            className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black font-black text-xs sm:text-sm rounded-2xl shadow-glow-lime transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {isSubmitting ? 'Saving Session...' : 'Complete & Save Workout'}
          </button>
        </div>

        {/* Right Col: Interactive Rest Timer Widget & Tools (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Rest Stopwatch Widget */}
          <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-5 sm:space-y-6 bg-gradient-to-b from-gym-900 to-gym-950">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-lime-400" />
                Inter-Set Rest Timer
              </h3>
              <Badge variant={isTimerRunning ? 'lime' : 'slate'} size="sm">
                {isTimerRunning ? 'RUNNING' : 'IDLE'}
              </Badge>
            </div>

            {/* Circular Countdown Display */}
            <div className="text-center py-2 space-y-2">
              <div className="text-5xl sm:text-6xl font-black font-mono text-lime-400 tracking-tight">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
              <p className="text-xs text-slate-400">Target Rest: {timerDuration}s</p>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-lime-400 transition-all duration-1000"
                  style={{ width: `${(timeLeft / timerDuration) * 100}%` }}
                />
              </div>
            </div>

            {/* Timer Control Buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                  isTimerRunning
                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-glow-amber'
                    : 'bg-lime-500 hover:bg-lime-400 text-black shadow-glow-lime'
                }`}
              >
                {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isTimerRunning ? 'Pause' : 'Start'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimeLeft(timerDuration);
                }}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
                title="Reset Timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Preset Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Rest Presets:
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[45, 60, 90, 180].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => startTimer(s)}
                    className="py-1.5 bg-slate-900 border border-slate-800 hover:border-lime-500/40 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition-all"
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Muscle Target Breakdown Card */}
          <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-slate-800 space-y-3">
            <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Session Muscle Hits
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Working Sets:</span>
                <strong className="text-white">{sets.filter(s => !s.is_warmup).length} sets</strong>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Warmup Sets:</span>
                <strong className="text-slate-400">{sets.filter(s => s.is_warmup).length} sets</strong>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Unique Movements:</span>
                <strong className="text-lime-400">
                  {new Set(sets.map(s => s.exercise_id)).size} exercises
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
