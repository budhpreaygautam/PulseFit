import React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { WorkoutAnalytics } from '../../types/index.js';
import { formatDate } from '../../lib/format.js';
import { useTheme } from '../../context/ThemeContext.js';
import { EmptyState, ErrorState, LoadingState } from '../common/States.js';
import { ApiResource } from './useApiResource.js';

const TIMELINE_POINTS = 20;
const shortDate = (d: string) => formatDate(d, { day: 'numeric', month: 'short' });
const kg = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;

interface ProgressSectionProps {
  analytics: ApiResource<WorkoutAnalytics>;
  onLogWorkout: () => void;
}

export const ProgressSection: React.FC<ProgressSectionProps> = ({ analytics, onLogWorkout }) => {
  const { isDark } = useTheme();
  const chart = {
    mark: isDark ? '#84cc16' : '#4d7c0f',
    tick: isDark ? '#94a3b8' : '#475569',
    grid: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(71,85,105,0.15)'
  };

  const data = analytics.data;
  let body: React.ReactNode;
  if (!data && analytics.error) {
    body = <ErrorState message={analytics.error} onRetry={analytics.reload} />;
  } else if (!data) {
    body = <LoadingState label="Loading your progress…" />;
  } else if (data.totalWorkouts === 0) {
    body = (
      <EmptyState
        title="No workouts logged yet"
        body="Log a workout to see your training volume, personal records and the muscle groups you train."
        action={
          <button type="button" onClick={onLogWorkout} className="neu-btn-lime px-5 py-2.5 rounded-xl text-xs font-extrabold">
            Log a workout
          </button>
        }
      />
    );
  } else {
    const timeline = data.volumeTimeline.slice(-TIMELINE_POINTS);
    const muscles = data.muscleDistribution.filter(m => m.count > 0).sort((a, b) => b.count - a.count);
    const records = data.personalRecords.slice(0, 8);

    body = (
      <div className="space-y-6">
        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: 'Workouts', value: data.totalWorkouts.toLocaleString('en-IN') },
            { label: 'Total volume', value: kg(data.totalVolumeKg) },
            { label: 'Avg. duration', value: `${data.avgDurationMinutes} min` }
          ].map(s => (
            <div key={s.label} className="neu-pressed-sm rounded-2xl p-3 sm:p-4 min-w-0">
              <dt className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">{s.label}</dt>
              <dd className="text-base sm:text-2xl font-black text-slate-100 font-['Outfit'] mt-1 break-words">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <figure className="neu-pressed-sm rounded-2xl p-4 min-w-0">
            <figcaption className="text-xs font-bold text-slate-300 mb-3">
              Volume per workout {data.volumeTimeline.length > TIMELINE_POINTS ? `(last ${TIMELINE_POINTS})` : ''}
              <span className="block font-medium text-slate-500 mt-0.5">Weight × reps of working sets, in kg</span>
            </figcaption>
            <div className="h-56" role="img" aria-label={`Training volume of your last ${timeline.length} workouts, from ${kg(timeline[0].volumeKg)} on ${shortDate(timeline[0].date)} to ${kg(timeline[timeline.length - 1].volumeKg)} on ${shortDate(timeline[timeline.length - 1].date)}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.mark} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chart.mark} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: chart.tick, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={{ fill: chart.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as WorkoutAnalytics['volumeTimeline'][number] | undefined;
                      return p ? `${p.title} · ${formatDate(p.date)}` : '';
                    }}
                    formatter={(value: number) => [kg(value), 'Volume']}
                  />
                  <Area type="linear" dataKey="volumeKg" stroke={chart.mark} strokeWidth={2} fill="url(#volumeFill)" dot={{ r: 3, fill: chart.mark }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <figure className="neu-pressed-sm rounded-2xl p-4 min-w-0">
            <figcaption className="text-xs font-bold text-slate-300 mb-3">
              Muscle groups trained
              <span className="block font-medium text-slate-500 mt-0.5">Working sets per muscle group, all time</span>
            </figcaption>
            {muscles.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">Only warm-up sets so far.</p>
            ) : (
              <div style={{ height: Math.max(120, muscles.length * 34) }} role="img" aria-label={muscles.map(m => `${m.category}: ${m.count} sets`).join(', ')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={muscles} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
                    <CartesianGrid stroke={chart.grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: chart.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="category" tick={{ fill: chart.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={72} />
                    <Tooltip cursor={{ fill: chart.grid }} formatter={(value: number) => [`${value} sets`, 'Working sets']} />
                    <Bar dataKey="count" fill={chart.mark} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </figure>
        </div>

        <div className="neu-pressed-sm rounded-2xl p-4">
          <h3 className="text-xs font-bold text-slate-300">Personal records</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-3">Best estimated one-rep max per exercise (Epley formula), from working sets.</p>
          {records.length === 0 ? (
            <p className="text-xs text-slate-400">No weighted working sets yet.</p>
          ) : (
            <div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th scope="col" className="py-2 px-1 font-bold">Exercise</th>
                    <th scope="col" className="py-2 px-1 font-bold text-right">Est. 1RM</th>
                    <th scope="col" className="py-2 px-1 font-bold text-right hidden sm:table-cell">Best set</th>
                    <th scope="col" className="py-2 px-1 font-bold text-right hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-500/20">
                  {records.map(r => (
                    <tr key={r.exerciseId}>
                      <th scope="row" className="py-2 px-1 text-left font-semibold text-slate-200">
                        {r.exerciseName}
                        <span className="block sm:hidden font-normal text-[11px] text-slate-400">
                          {r.weight} kg × {r.reps} · {shortDate(r.date)}
                        </span>
                      </th>
                      <td className="py-2 px-1 text-right font-mono font-bold text-lime-700 dark:text-lime-400 whitespace-nowrap align-top">{kg(r.e1rm)}</td>
                      <td className="py-2 px-1 text-right font-mono text-slate-300 hidden sm:table-cell">{r.weight} kg × {r.reps}</td>
                      <td className="py-2 px-1 text-right text-slate-400 whitespace-nowrap hidden sm:table-cell">{shortDate(r.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="progress-heading" className="neu-flat rounded-3xl p-5 sm:p-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="progress-heading" className="text-lg sm:text-xl font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> My progress
        </h2>
        <button type="button" onClick={onLogWorkout} className="neu-btn px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
          Log a workout
        </button>
      </div>
      {body}
    </section>
  );
};
