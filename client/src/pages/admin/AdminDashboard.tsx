import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Award, CalendarDays, Clock, Dumbbell, IndianRupee, QrCode, RefreshCw, Repeat, UserPlus, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AdminDashboardKPIs } from '../../types/index.js';
import { api, errorMessage } from '../../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { AdminNav, PageHeader, SectionCard, focusRing } from '../../components/admin/ui.js';
import { KpiTile } from '../../components/admin/KpiTile.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { formatDate, formatDateTime, formatINR } from '../../lib/format.js';

interface AdminDashboardProps {
  setCurrentTab: (tab: string) => void;
}

function useChartColors() {
  const { isDark } = useTheme();
  return {
    grid: isDark ? '#1f293d' : '#cbd5e1',
    axis: isDark ? '#94a3b8' : '#475569',
    bar: '#84cc16',
    line: '#0ea5e9',
    cursor: isDark ? 'rgba(132, 204, 22, 0.08)' : 'rgba(77, 124, 15, 0.08)'
  };
}

const monthLabel = (month: string) => formatDate(`${month}-01`, { month: 'short', year: '2-digit' });

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ setCurrentTab }) => {
  const [data, setData] = useState<AdminDashboardKPIs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const colors = useChartColors();
  const { navigate } = useNavigation();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await api.getDashboardKPIs());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <PageHeader
      eyebrow="Admin"
      title="Gym overview"
      description={data ? `Worked out from the gym's records at ${formatDateTime(data.generatedAt)}.` : 'Members, revenue, attendance and classes at a glance.'}
      actions={
        <>
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className={`px-4 py-2.5 neu-btn rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60 ${focusRing}`}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('admin-scanner')}
            className={`px-4 py-2.5 neu-btn-lime rounded-xl text-xs font-black flex items-center gap-2 ${focusRing}`}
          >
            <QrCode className="w-4 h-4" aria-hidden="true" /> Open check-in
          </button>
        </>
      }
    />
  );

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {header}
        <AdminNav />
        {error ? <ErrorState message={`Could not load the dashboard. ${error}`} onRetry={load} /> : <LoadingState label="Loading the dashboard…" />}
      </div>
    );
  }

  const { kpis, weeklyAttendanceChart, hourlyPeakCurve, tierDistribution, topClasses, revenueByMonth, definitions } = data;
  const hasWeekly = weeklyAttendanceChart.some(d => d.visits > 0);
  const hasHourly = hourlyPeakCurve.some(d => d.checkIns > 0);
  const hasRevenue = revenueByMonth.some(d => d.revenue > 0);
  const tierTotal = tierDistribution.reduce((sum, t) => sum + t.count, 0);
  const tooltipStyle = { contentStyle: { borderRadius: '12px', fontSize: '12px' } };

  const statusTiles = [
    { status: 'active', label: 'Active', count: kpis.activeMembers, tone: 'text-lime-400' },
    { status: 'frozen', label: 'Frozen', count: kpis.frozenMembers, tone: 'text-cyan-400' },
    { status: 'expired', label: 'Expired', count: kpis.expiredMembers, tone: 'text-rose-400' },
    { status: 'pending', label: 'No plan yet', count: kpis.pendingMembers, tone: 'text-amber-400' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      {header}
      <AdminNav />
      {error && <ErrorState message={`Could not refresh the dashboard. ${error}`} onRetry={load} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <KpiTile
          title="Active members"
          value={kpis.activeMembers}
          detail={`of ${kpis.totalMembers} member accounts`}
          icon={<Users className="w-5 h-5" />}
          accent="cyan"
        />
        <KpiTile
          title="Monthly recurring revenue"
          value={formatINR(kpis.monthlyRevenue)}
          detail="Monthly value of active memberships"
          icon={<IndianRupee className="w-5 h-5" />}
          definition={definitions.monthlyRevenue}
        />
        <KpiTile title="Check-ins today" value={kpis.todayCheckIns} detail="Front-desk and turnstile check-ins" icon={<Activity className="w-5 h-5" />} accent="amber" />
        <KpiTile
          title="Class fill rate"
          value={`${kpis.avgFillRate}%`}
          detail={`${kpis.classesScheduled} weekly classes · ${kpis.totalTrainers} coaches`}
          icon={<CalendarDays className="w-5 h-5" />}
          accent="rose"
          definition={definitions.avgFillRate}
        />
        <KpiTile
          title="Retention (90 days)"
          value={kpis.retentionRate === null ? 'Not enough data' : `${kpis.retentionRate}%`}
          detail={kpis.retentionRate === null ? 'No membership period ended in the last 90 days.' : 'Membership periods renewed'}
          icon={<Repeat className="w-5 h-5" />}
          accent="slate"
          definition={definitions.retentionRate}
        />
        <KpiTile title="Revenue this month" value={formatINR(kpis.revenueThisMonth)} detail="Payments received since the 1st" icon={<IndianRupee className="w-5 h-5" />} accent="amber" />
        <KpiTile
          title="Free trials this month"
          value={kpis.trialsThisMonth}
          detail={
            <button type="button" onClick={() => setCurrentTab('admin-trials')} className={`neu-btn px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center ${focusRing}`}>
              View trial leads
            </button>
          }
          icon={<UserPlus className="w-5 h-5" />}
          accent="cyan"
        />
        <section aria-labelledby="status-heading" className="neu-card p-5 rounded-3xl min-w-0">
          <h2 id="status-heading" className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Members by status
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {statusTiles.map(s => (
              <li key={s.status}>
                <button
                  type="button"
                  onClick={() => navigate('admin-members', { status: s.status })}
                  className={`w-full neu-pressed-sm rounded-xl px-3 py-2 text-left ${focusRing}`}
                  aria-label={`${s.count} ${s.label.toLowerCase()}: show these members`}
                >
                  <span className={`block text-lg font-black font-['Outfit'] ${s.tone}`}>{s.count}</span>
                  <span className="block text-[11px] font-semibold text-slate-400">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SectionCard
          id="weekly-heading"
          className="lg:col-span-7"
          title="Check-ins by weekday"
          icon={<Activity className="w-4 h-4 text-lime-400" aria-hidden="true" />}
          description="All check-ins in the last 28 days, by day of the week."
        >
          {hasWeekly ? (
            <div className="h-64 w-full" role="img" aria-label={`Check-ins by weekday: ${weeklyAttendanceChart.map(d => `${d.day} ${d.visits}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAttendanceChart} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} />
                  <YAxis allowDecimals={false} stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: colors.cursor }} formatter={(v: number) => [v, 'Check-ins']} />
                  <Bar dataKey="visits" fill={colors.bar} radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No check-ins in the last 28 days" />
          )}
        </SectionCard>

        <SectionCard
          id="tiers-heading"
          className="lg:col-span-5"
          title="Active members by plan"
          icon={<Dumbbell className="w-4 h-4 text-amber-400" aria-hidden="true" />}
          description="Each plan's active members and their monthly recurring revenue."
        >
          {tierTotal > 0 && (
            <div className="h-44 w-full" role="img" aria-label={`Active members by plan: ${tierDistribution.map(t => `${t.name} ${t.count}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tierDistribution} dataKey="count" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {tierDistribution.map(t => (
                      <Cell key={t.tier} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Active members']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="space-y-2 text-xs font-medium">
            {tierDistribution.map(t => (
              <li key={t.tier} className="flex items-center justify-between gap-3 neu-pressed-sm rounded-xl px-3 py-2">
                <span className="flex items-center gap-2 text-slate-300 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} aria-hidden="true" />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="text-right shrink-0">
                  <strong className="text-slate-100">{t.count}</strong>
                  <span className="text-slate-400"> · {formatINR(t.revenue)}/mo</span>
                </span>
              </li>
            ))}
          </ul>
          {tierTotal === 0 && <p className="text-xs text-slate-400">No member has an active plan right now.</p>}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          id="hourly-heading"
          title="Check-ins by hour"
          icon={<Clock className="w-4 h-4 text-cyan-400" aria-hidden="true" />}
          description="All check-ins in the last 30 days, by hour of arrival (gym time)."
        >
          {hasHourly ? (
            <div className="h-60 w-full" role="img" aria-label="Check-ins by hour of the day over the last 30 days">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyPeakCurve} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="hour" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Check-ins']} />
                  <Line type="monotone" dataKey="checkIns" stroke={colors.line} strokeWidth={3} dot={{ r: 3, fill: colors.line }} activeDot={{ r: 6, fill: colors.bar }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No check-ins in the last 30 days" />
          )}
        </SectionCard>

        <SectionCard
          id="revenue-heading"
          title="Revenue by month"
          icon={<IndianRupee className="w-4 h-4 text-lime-400" aria-hidden="true" />}
          description="Payments received in each of the last six months."
        >
          {hasRevenue ? (
            <div className="h-60 w-full" role="img" aria-label={`Revenue by month: ${revenueByMonth.map(r => `${monthLabel(r.month)} ${formatINR(r.revenue)}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis
                    stroke={colors.axis}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
                    width={48}
                  />
                  <Tooltip {...tooltipStyle} cursor={{ fill: colors.cursor }} labelFormatter={monthLabel} formatter={(v: number) => [formatINR(v), 'Revenue']} />
                  <Bar dataKey="revenue" fill={colors.bar} radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No payments in the last six months" />
          )}
        </SectionCard>
      </div>

      <SectionCard
        id="classes-heading"
        title="Busiest classes this week"
        icon={<Award className="w-4 h-4 text-amber-400" aria-hidden="true" />}
        description="This week's sessions with the most bookings."
        actions={
          <button type="button" onClick={() => setCurrentTab('admin-classes')} className={`neu-btn px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center shrink-0 ${focusRing}`}>
            Manage classes
          </button>
        }
      >
        {topClasses.length > 0 ? (
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topClasses.map((cls, idx) => (
              <li key={cls.id} className="p-4 rounded-2xl neu-pressed-sm space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-amber-400 font-mono">#{idx + 1}</span>
                  <span className="text-xs font-bold text-slate-300">
                    {cls.booked}/{cls.capacity} booked · {cls.occupancy}%
                  </span>
                </div>
                <h3 className="font-extrabold text-sm text-slate-100 truncate font-['Outfit']">{cls.title}</h3>
                <p className="text-xs text-slate-400">
                  {cls.trainer ?? 'No coach assigned'} · {cls.category}
                </p>
                <div className="w-full h-1.5 neu-pressed-sm rounded-full overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-lime-500 rounded-full" style={{ width: `${Math.min(100, cls.occupancy)}%` }} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No classes on the timetable" action={
            <button type="button" onClick={() => setCurrentTab('admin-classes')} className={`neu-btn px-4 py-2 rounded-xl text-xs font-bold ${focusRing}`}>
              Add a class
            </button>
          } />
        )}
      </SectionCard>
    </div>
  );
};
