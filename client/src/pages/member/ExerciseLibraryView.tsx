import React, { useState, useEffect } from 'react';
import { Search, Filter, Dumbbell, Info, CheckCircle2, ChevronRight, Layers, ArrowLeft } from 'lucide-react';
import { Exercise } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { useToast } from '../../context/ToastContext.js';

interface ExerciseLibraryViewProps {
  setCurrentTab: (tab: string) => void;
}

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({ setCurrentTab }) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    api.getExercises()
      .then(setExercises)
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setIsLoading(false));
  }, []);

  const categories = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
  const equipments = ['All', 'Barbell', 'Dumbbell', 'Cable', 'Bodyweight'];

  const filteredExercises = exercises.filter(ex => {
    const matchesCategory = selectedCategory === 'All' || ex.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesEquipment = selectedEquipment === 'All' || ex.equipment.toLowerCase() === selectedEquipment.toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.target_muscles.some(m => m.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesEquipment && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <Badge variant="cyan">EXERCISE DATABASE</Badge>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-2 font-['Outfit']">
            COMPREHENSIVE EXERCISE CATALOG
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl font-medium">
            Explore execution cues, anatomy targeting, and proper biomechanics for 30+ fundamental compound & isolation movements.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by muscle or exercise..."
            className="w-full pl-10 pr-4 py-2.5 neu-pressed-sm rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium"
          />
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 neu-flat p-4 rounded-2xl border border-slate-800/80">
        {/* Muscle Group Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-lime-400" /> Muscle:
          </span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs transition-all ${
                selectedCategory === cat
                  ? 'neu-btn-lime text-black font-extrabold shadow-glow-lime'
                  : 'neu-btn text-slate-400 hover:text-slate-200 font-semibold'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Equipment Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Equipment:</span>
          <select
            value={selectedEquipment}
            onChange={e => setSelectedEquipment(e.target.value)}
            className="neu-pressed-sm text-xs text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-lime-500 font-medium cursor-pointer"
          >
            {equipments.map(eq => (
              <option key={eq} value={eq} className="bg-slate-900 text-slate-200">
                {eq}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Exercise Cards Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 text-sm font-medium">Loading movement library...</div>
      ) : filteredExercises.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExercises.map(ex => (
            <div
              key={ex.id}
              onClick={() => setSelectedExercise(ex)}
              className="neu-flat rounded-3xl border border-slate-800/80 overflow-hidden flex flex-col justify-between cursor-pointer group hover:border-lime-500/50 transition-all"
            >
              <div>
                <div className="relative h-44 overflow-hidden bg-slate-900">
                  <img
                    src={ex.thumbnail_url || 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400'}
                    alt={ex.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-85"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-transparent to-transparent opacity-90" />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <Badge variant="lime" size="sm">{ex.category}</Badge>
                    <Badge variant="slate" size="sm">{ex.equipment}</Badge>
                  </div>
                  <div className="absolute top-3 right-3">
                    <Badge variant="amber" size="sm">{ex.difficulty}</Badge>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <h3 className="text-base font-extrabold text-white group-hover:text-lime-400 transition-colors font-['Outfit']">
                    {ex.name}
                  </h3>

                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Primary Targets:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.target_muscles.map((muscle, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-bold bg-slate-800/80 text-slate-300 px-2.5 py-0.5 rounded-lg border border-slate-700/60"
                        >
                          {muscle}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 pt-0 border-t border-slate-800/60 flex items-center justify-between text-xs text-lime-400 font-bold group-hover:translate-x-0.5 transition-transform">
                <span>View Execution Steps</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="neu-flat p-16 rounded-3xl text-center border border-slate-800/80 space-y-3">
          <Dumbbell className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-lg font-bold text-slate-200 font-['Outfit']">No movements matched your filters</h4>
          <p className="text-xs text-slate-400 font-medium">Try selecting "All" or clearing the search keyword.</p>
        </div>
      )}

      {/* Exercise Detail Modal */}
      {selectedExercise && (
        <Modal
          isOpen={!!selectedExercise}
          onClose={() => setSelectedExercise(null)}
          title={selectedExercise.name}
          description={`${selectedExercise.category} • ${selectedExercise.equipment} • ${selectedExercise.difficulty} Level`}
          maxWidth="lg"
        >
          <div className="space-y-6">
            <img
              src={selectedExercise.thumbnail_url || 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500'}
              alt={selectedExercise.name}
              className="w-full h-52 object-cover rounded-2xl border border-slate-800/80 shadow-md"
            />

            {/* Target Muscles */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Targeted Muscle Anatomy</h4>
              <div className="flex flex-wrap gap-2">
                {selectedExercise.target_muscles.map((muscle, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-lime-500/10 border border-lime-500/30 text-lime-400 text-xs font-bold rounded-xl"
                  >
                    {muscle}
                  </span>
                ))}
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Execution Instructions & Form Cues</h4>
              <div className="space-y-2.5">
                {selectedExercise.instructions.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs text-slate-300 leading-relaxed neu-pressed-sm p-3.5 rounded-xl">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-lime-400 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-slate-700">
                      {idx + 1}
                    </span>
                    <span className="font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-800/80">
              <button
                onClick={() => setSelectedExercise(null)}
                className="flex-1 py-3 neu-btn text-slate-200 font-bold text-xs rounded-xl transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedExercise(null);
                  setCurrentTab('workout-logger');
                }}
                className="flex-1 py-3 neu-btn-lime text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all"
              >
                Add to Workout Session
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
