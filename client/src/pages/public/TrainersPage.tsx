import React from 'react';
import { AtSign, Calendar, Star } from 'lucide-react';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiData } from '../../components/public/useApiData.js';
import { useNavigation } from '../../context/NavigationContext.js';

interface TrainersPageProps {
  setCurrentTab: (tab: string) => void;
}

export const TrainersPage: React.FC<TrainersPageProps> = () => {
  const { navigate } = useNavigation();
  const { data: trainers, error, isLoading, reload } = useApiData(() => api.getTrainers());

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <Badge variant="lime">OUR COACHES</Badge>
        <h1 className="text-4xl sm:text-6xl font-black text-slate-100 tracking-tight font-['Outfit']">MEET THE COACHES</h1>
        <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-medium">
          The people who run every Workout & Strength and Zumba & Cardio class on the timetable.
        </p>
      </div>

      {isLoading ? (
        <LoadingState label="Loading coaches…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} className="max-w-xl mx-auto" />
      ) : !trainers || trainers.length === 0 ? (
        <EmptyState title="No coaches listed yet" body="Check back soon, or ask at the front desk." className="max-w-xl mx-auto" />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {trainers.map(trainer => {
            const classesCount = trainer.classes_count ?? 0;
            return (
              <li key={trainer.id} className="neu-flat rounded-3xl overflow-hidden border border-slate-800/80 flex flex-col justify-between">
                <div>
                  <div className="relative h-72 sm:h-80 overflow-hidden bg-slate-900">
                    {trainer.avatar_url && <img src={trainer.avatar_url} alt={`Portrait of ${trainer.name}`} className="w-full h-full object-cover object-top" loading="lazy" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                    {trainer.reviews_count > 0 && (
                      <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-amber-300 font-extrabold text-xs flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                        <span>
                          {trainer.rating}
                          <span className="sr-only"> out of 5</span>
                        </span>
                        <span className="text-zinc-300 font-normal">({trainer.reviews_count} reviews)</span>
                      </div>
                    )}

                    <div className="absolute bottom-4 left-4 right-4">
                      <h2 className="text-2xl font-black text-zinc-50 font-['Outfit']">{trainer.name}</h2>
                      <div className="text-xs font-bold flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        {trainer.instagram && (
                          <span className="text-lime-300 flex items-center gap-1">
                            <AtSign className="w-3.5 h-3.5" aria-hidden="true" />
                            {trainer.instagram.replace(/^@/, '')}
                          </span>
                        )}
                        <span className="text-zinc-200">
                          {trainer.experience_years} {trainer.experience_years === 1 ? 'year' : 'years'} coaching
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-300 leading-relaxed">{trainer.bio}</p>
                    {trainer.specialties.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Specialties</h3>
                        <ul className="flex flex-wrap gap-1.5">
                          {trainer.specialties.map(spec => (
                            <li key={spec} className="px-2.5 py-1 rounded-lg neu-pressed-sm text-[11px] font-semibold text-slate-200">
                              {spec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 pt-0">
                  {classesCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => navigate('schedule', { trainer: trainer.id })}
                      className="w-full py-3 neu-btn text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                    >
                      <Calendar className="w-4 h-4" aria-hidden="true" />
                      View classes ({classesCount} a week)
                      <span className="sr-only"> with {trainer.name}</span>
                    </button>
                  ) : (
                    <p className="w-full py-3 neu-pressed-sm text-slate-400 font-semibold text-xs rounded-xl text-center">No classes on the timetable right now</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
