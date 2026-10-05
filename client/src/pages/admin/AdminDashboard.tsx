import React, { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  Activity,
  Calendar,
  Clock,
  ShieldCheck,
  QrCode,
  ArrowRight,
  Flame,
  Award
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { AdminDashboardKPIs } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { StatCard } from '../../components/common/StatCard.js';
import { useToast } from '../../context/ToastContext.js';

interface AdminDashboardProps {
  setCurrentTab: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ setCurrentTab }) => {
  const [data, setData] = useState<AdminDashboardKPIs | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    api.getDashboardKPIs()
      .then(setData)
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-slate-400 text-sm">
        Loading executive analytics dashboard...
      </div>
    );
  }

  const { kpis, weeklyAttendanceChart, hourlyPeakCurve, tierDistribution, topClasses } = data;

  const COLORS = ['#38bdf8', '#84cc16', '#f59e0b', '#ec4899'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <Badge variant="cyan">ADMIN EXECUTIVE SUITE</Badge>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-2 font-['Outfit']">
            GYM PERFORMANCE ANALYTICS
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl font-medium">
            Real-time revenue metrics, hourly member flow distribution, and class capacity utilization for Cyber Hub Gurugram.
          </p>
        </div>

        {/* Quick Turnstile Scanner Shortcut */}
        <button
          onClick={() => setCurrentTab('admin-scanner')}
          className="px-5 py-3 sm:px-6 sm:py-3.5 neu-btn-lime text-black font-black text-xs rounded-2xl shadow-glow-lime flex items-center gap-2 shrink-0 transition-all active:scale-95"
        >
          <QrCode className="w-4 h-4" /> Open Turnstile Scanner
        </button>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        <StatCard
          title="Active Members"
          value={`${kpis.activeMembers} / ${kpis.totalMembers}`}
          subtitle="94.6% membership retention"
          icon={<Users className="w-6 h-6" />}
          accentColor="cyan"
          trend={{ value: "+12 this month", isPositive: true }}
        />

        <StatCard
          title="Monthly Recurring Revenue"
          value={`₹${kpis.monthlyRevenue.toLocaleString('en-IN')}`}
          subtitle="Active member subscriptions"
          icon={<span className="text-2xl font-bold font-mono">₹</span>}
          accentColor="lime"
          trend={{ value: "+18.4% YoY", isPositive: true }}
        />

        <StatCard
          title="Today's Check-Ins"
          value={kpis.todayCheckIns}
          subtitle="Turnstile scans recorded"
          icon={<Activity className="w-6 h-6" />}
          accentColor="amber"
          trend={{ value: "Peak at 6:00 PM", isPositive: true }}
        />

        <StatCard
          title="Class Fill Rate"
          value={`${kpis.avgFillRate}%`}
          subtitle="Capacity utilization"
          icon={<Calendar className="w-6 h-6" />}
          accentColor="crimson"
          trend={{ value: "40+ scheduled sessions", isPositive: true }}
        />
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Weekly Attendance Bar Chart (8 cols) */}
        <div className="lg:col-span-8 neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-['Outfit']">
                <Activity className="w-4 h-4 text-lime-400" />
                Weekly Attendance Visits
              </h3>
              <p className="text-xs text-slate-400 font-medium">Total member visits distributed Mon–Sun</p>
            </div>
            <Badge variant="lime" size="sm">7-DAY TIMELINE</Badge>
          </div>

          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyAttendanceChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0c1017', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 600 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 700 }}
                  cursor={{ fill: 'rgba(132, 204, 22, 0.05)' }}
                />
                <Bar dataKey="visits" fill="#84cc16" radius={[6, 6, 0, 0]} barSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Tier Donut Chart (4 cols) */}
        <div className="lg:col-span-4 neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-['Outfit']">
                <span className="text-amber-400 font-bold font-mono text-base">₹</span>
                Revenue by Tier
              </h3>
              <Badge variant="amber" size="sm">MRR BREAKDOWN</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Tier contribution to monthly revenue</p>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tierDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="revenue"
                >
                  {tierDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0c1017', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 600 }}
                  labelStyle={{ color: '#ffffff', fontWeight: 700 }}
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}/mo`, 'Revenue']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs font-medium">
            {tierDistribution.map((t, i) => (
              <div key={t.tier} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {t.name}
                </span>
                <strong className="text-white font-mono">₹{t.revenue.toLocaleString('en-IN')}/mo</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly Peak Hours Heatmap Curve */}
      <div className="neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-['Outfit']">
              <Clock className="w-4 h-4 text-cyan-400" />
              Hourly Facility Traffic Curve (06:00 – 21:00)
            </h3>
            <p className="text-xs text-slate-400 font-medium">Identify peak gym floor rush hours and staff accordingly.</p>
          </div>
          <Badge variant="cyan" size="sm">HOURLY DISTRIBUTION</Badge>
        </div>

        <div className="h-64 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyPeakCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" vertical={false} />
              <XAxis dataKey="hour" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0c1017', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                itemStyle={{ color: '#ffffff', fontWeight: 600 }}
                labelStyle={{ color: '#ffffff', fontWeight: 700 }}
              />
              <Line
                type="monotone"
                dataKey="checkIns"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ fill: '#38bdf8', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 7, fill: '#84cc16' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Popular Classes Leaderboard */}
      <div className="neu-flat p-6 sm:p-8 rounded-3xl border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-['Outfit']">
              <Award className="w-4 h-4 text-amber-400" />
              Highest Demand Group Classes
            </h3>
            <p className="text-xs text-slate-400 font-medium">Leaderboard by booked capacity percentage.</p>
          </div>
          <button
            onClick={() => setCurrentTab('schedule')}
            className="text-xs font-bold text-lime-400 hover:text-lime-300 flex items-center gap-1"
          >
            Manage Timetable <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topClasses.map((cls, idx) => (
            <div key={cls.id} className="p-4 rounded-2xl neu-pressed-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center border border-amber-500/30">
                  #{idx + 1}
                </span>
                <span className="text-xs font-bold text-lime-400 font-mono">{cls.occupancy}% Booked</span>
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-white truncate font-['Outfit']">{cls.title}</h4>
                <p className="text-xs text-slate-400 font-medium">Coach: {cls.trainer} • {cls.category}</p>
              </div>
              <div className="w-full h-1.5 neu-pressed-sm rounded-full overflow-hidden mt-2 p-0">
                <div
                  className="h-full bg-lime-400 rounded-full"
                  style={{ width: `${cls.occupancy}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

