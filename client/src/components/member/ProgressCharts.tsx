import React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WorkoutAnalytics } from '../../types/index.js';
import { formatDate } from '../../lib/format.js';

// The progress charts, in a module of their own so the charting library loads after the member
// dashboard has painted instead of holding it back. ProgressSection loads this file on demand and
// keeps the boxes the charts draw into, so nothing moves when they arrive.

export interface ChartColors {
  mark: string;
  tick: string;
  grid: string;
}

const shortDate = (d: string) => formatDate(d, { day: 'numeric', month: 'short' });
const kg = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;

export const VolumeChart: React.FC<{ timeline: WorkoutAnalytics['volumeTimeline']; chart: ChartColors }> = ({ timeline, chart }) => (
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
);

export const MuscleChart: React.FC<{ muscles: WorkoutAnalytics['muscleDistribution']; chart: ChartColors }> = ({ muscles, chart }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={muscles} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
      <CartesianGrid stroke={chart.grid} horizontal={false} />
      <XAxis type="number" allowDecimals={false} tick={{ fill: chart.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis type="category" dataKey="category" tick={{ fill: chart.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={72} />
      <Tooltip cursor={{ fill: chart.grid }} formatter={(value: number) => [`${value} sets`, 'Working sets']} />
      <Bar dataKey="count" fill={chart.mark} radius={[0, 4, 4, 0]} maxBarSize={18} />
    </BarChart>
  </ResponsiveContainer>
);
