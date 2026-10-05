import React, { useState, useEffect } from 'react';
import { Star, Award, Calendar, Phone, Mail, Dumbbell, ShieldCheck, AtSign } from 'lucide-react';
import { Trainer } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { useToast } from '../../context/ToastContext.js';

interface TrainersPageProps {
  setCurrentTab: (tab: string) => void;
}

export const TrainersPage: React.FC<TrainersPageProps> = ({ setCurrentTab }) => {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    api.getTrainers()
      .then(setTrainers)
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <Badge variant="lime">CERTIFIED COACHES</Badge>
        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight font-['Outfit']">
          EXPERT STRENGTH & ZUMBA INSTRUCTORS
        </h1>
        <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-medium">
          Dedicated coaching staff specializing in barbell biomechanics, hypertrophy, and licensed high-energy Zumba dance choreography in Cyber Hub, Gurugram.
        </p>
      </div>

      {/* Trainers Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 text-sm font-medium">Loading coaching roster...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {trainers.map(trainer => (
            <div
              key={trainer.id}
              className="neu-flat rounded-3xl overflow-hidden border border-slate-800/80 flex flex-col justify-between group hover:border-lime-500/50 transition-all"
            >
              <div>
                {/* Photo & Overlays */}
                <div className="relative h-80 overflow-hidden bg-slate-900">
                  <img
                    src={trainer.avatar_url}
                    alt={trainer.name}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700 brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-gym-950/30 to-transparent" />

                  <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-amber-400 font-extrabold text-xs flex items-center gap-1.5 shadow-lg">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{trainer.rating}</span>
                    <span className="text-slate-400 font-normal">({trainer.reviews_count} reviews)</span>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-2xl font-black text-white font-['Outfit']">{trainer.name}</h3>
                    <div className="text-xs font-bold text-lime-400 flex items-center gap-1 mt-0.5">
                      <AtSign className="w-3.5 h-3.5" />
                      <span>{trainer.instagram.replace('@', '')}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-300">{trainer.experience_years} Years Coaching</span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">{trainer.bio}</p>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Specialties:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {trainer.specialties.map((spec, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg neu-pressed-sm text-[11px] font-semibold text-slate-200"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Class Action */}
              <div className="p-6 pt-0">
                <button
                  onClick={() => setCurrentTab('schedule')}
                  className="w-full py-3 neu-btn hover:neu-btn-lime hover:text-black text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  View Scheduled Classes ({trainer.classes_count || 3})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
