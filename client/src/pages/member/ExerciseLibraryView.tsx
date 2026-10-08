import React, { useMemo, useState } from 'react';
import { ChevronRight, Dumbbell, Search } from 'lucide-react';
import { Exercise } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Modal } from '../../components/common/Modal.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';

interface ExerciseLibraryViewProps {
  setCurrentTab: (tab: string) => void;
}

const CATEGORIES: Exercise['category'][] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Full Body'];
const EQUIPMENT: Exercise['equipment'][] = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Cardio'];
const DIFFICULTIES: Exercise['difficulty'][] = ['Beginner', 'Intermediate', 'Advanced'];

const Thumbnail: React.FC<{ exercise: Exercise; className: string }> = ({ exercise, className }) => {
  const [failed, setFailed] = useState(false);
  if (!exercise.thumbnail_url || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-800`} aria-hidden="true">
        <Dumbbell className="w-10 h-10 text-slate-500" />
      </div>
    );
  }
  return <img src={exercise.thumbnail_url} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover`} />;
};

const Chip: React.FC<{ pressed: boolean; onClick: () => void; children: React.ReactNode }> = ({ pressed, onClick, children }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${pressed ? 'neu-btn-lime font-extrabold' : 'neu-btn font-semibold'}`}
  >
    {children}
  </button>
);

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({ setCurrentTab }) => {
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const exercises = useApiResource(() => api.getExercises());
  const [category, setCategory] = useState<string>('All');
  const [equipment, setEquipment] = useState<string>('All');
  const [difficulty, setDifficulty] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercises.data ?? []).filter(
      ex =>
        (category === 'All' || ex.category === category) &&
        (equipment === 'All' || ex.equipment === equipment) &&
        (difficulty === 'All' || ex.difficulty === difficulty) &&
        (!q || ex.name.toLowerCase().includes(q) || ex.target_muscles.some(m => m.toLowerCase().includes(q)))
    );
  }, [exercises.data, category, equipment, difficulty, search]);

  // Only offer filter values that the catalogue actually contains.
  const present = <K extends keyof Exercise>(key: K, all: readonly Exercise[K][]) =>
    exercises.data ? all.filter(v => exercises.data!.some(ex => ex[key] === v)) : all;
  const categories = present('category', CATEGORIES);
  const equipmentList = present('equipment', EQUIPMENT);

  const isFiltered = category !== 'All' || equipment !== 'All' || difficulty !== 'All' || search.trim() !== '';
  const clearFilters = () => {
    setCategory('All');
    setEquipment('All');
    setDifficulty('All');
    setSearch('');
  };

  const logExercise = (ex: Exercise) => {
    setSelected(null);
    navigate('workout-logger', { exercise: ex.id });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-100 tracking-tight font-['Outfit']">Exercise library</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">How to perform each movement on our floor, and which muscles it works.</p>
        </div>
        <div className="w-full md:w-72">
          <label htmlFor="exercise-search" className="sr-only">Search exercises</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input
              id="exercise-search"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or muscle"
              className="w-full pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500"
            />
          </div>
        </div>
      </header>

      <div className="neu-flat p-4 rounded-2xl space-y-3">
        <div role="group" aria-label="Muscle group" className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 mr-1 shrink-0">Muscle</span>
          {['All', ...categories].map(c => (
            <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="exercise-equipment" className="text-xs font-bold text-slate-400 w-20 sm:w-auto">Equipment</label>
            <select id="exercise-equipment" value={equipment} onChange={e => setEquipment(e.target.value)} className="flex-1 sm:flex-none text-xs text-slate-200 px-3 py-2">
              {['All', ...equipmentList].map(eq => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="exercise-difficulty" className="text-xs font-bold text-slate-400 w-20 sm:w-auto">Level</label>
            <select id="exercise-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)} className="flex-1 sm:flex-none text-xs text-slate-200 px-3 py-2">
              {['All', ...DIFFICULTIES].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          {isFiltered && (
            <button type="button" onClick={clearFilters} className="neu-btn px-3 py-2 rounded-xl text-xs font-bold sm:ml-auto">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!exercises.data && exercises.error ? (
        <ErrorState message={exercises.error} onRetry={exercises.reload} />
      ) : !exercises.data ? (
        <LoadingState label="Loading exercises…" />
      ) : exercises.data.length === 0 ? (
        <EmptyState title="No exercises yet" body="The gym has not added any exercises to the library." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No exercises match these filters"
          action={
            <button type="button" onClick={clearFilters} className="neu-btn px-4 py-2 rounded-xl text-xs font-bold">
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-slate-400" aria-live="polite">
            {filtered.length} of {exercises.data.length} exercises
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(ex => (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => setSelected(ex)}
                  className="w-full h-full text-left neu-flat rounded-3xl overflow-hidden flex flex-col group hover:border-lime-500/50 transition-all"
                >
                  <Thumbnail exercise={ex} className="w-full h-40" />
                  <div className="p-5 space-y-3 flex-1 flex flex-col">
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                      <span className="px-2 py-0.5 rounded-full bg-lime-500/10 border border-lime-500/40 text-lime-700 dark:text-lime-400">{ex.category}</span>
                      <span className="px-2 py-0.5 rounded-full border border-slate-700/60 text-slate-300">{ex.equipment}</span>
                      <span className="px-2 py-0.5 rounded-full border border-slate-700/60 text-slate-400">{ex.difficulty}</span>
                    </div>
                    <h2 className="text-base font-extrabold text-slate-100 font-['Outfit']">{ex.name}</h2>
                    <p className="text-xs text-slate-400 flex-1">{ex.target_muscles.join(', ')}</p>
                    <span className="text-xs font-bold text-lime-700 dark:text-lime-400 inline-flex items-center gap-1">
                      How to do it <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name}
        description={selected ? `${selected.category} · ${selected.equipment} · ${selected.difficulty}` : undefined}
        maxWidth="lg"
      >
        {selected && (
          <div className="space-y-6">
            <Thumbnail exercise={selected} className="w-full h-48 rounded-2xl" />
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Muscles worked</h3>
              <ul className="flex flex-wrap gap-2">
                {selected.target_muscles.map(m => (
                  <li key={m} className="px-3 py-1 rounded-xl text-xs font-bold bg-lime-500/10 border border-lime-500/30 text-lime-700 dark:text-lime-400">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Steps</h3>
              <ol className="space-y-2">
                {selected.instructions.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300 neu-pressed-sm p-3 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-lime-700 dark:text-lime-400 font-bold text-xs flex items-center justify-center shrink-0" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <button type="button" onClick={() => setSelected(null)} className="flex-1 neu-btn py-3 rounded-xl text-xs font-bold">
                Close
              </button>
              {user ? (
                <button type="button" onClick={() => logExercise(selected)} className="flex-1 neu-btn-lime py-3 rounded-xl text-xs font-extrabold">
                  Log this exercise
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setCurrentTab('pricing');
                  }}
                  className="flex-1 neu-btn-lime py-3 rounded-xl text-xs font-extrabold"
                >
                  See memberships
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
