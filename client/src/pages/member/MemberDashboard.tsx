import React, { useState, useEffect } from 'react';
import {
  Flame,
  Calendar,
  Dumbbell,
  QrCode,
  Trophy,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Activity,
  Plus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api } from '../../api/client.js';
import { Booking, Workout, WorkoutAnalytics } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { StatCard } from '../../components/common/StatCard.js';
import { DigitalQrPassModal } from '../../components/qr/DigitalQrPassModal.js';

interface MemberDashboardProps {
  setCurrentTab: (tab: string) => void;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({ setCurrentTab }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [analytics, setAnalytics] = useState<WorkoutAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [bData, wData, aData] = await Promise.all([
        api.getMyBookings(),
        api.getWorkouts(),
        api.getWorkoutAnalytics()
      ]);
      setBookings(bData);
      setWorkouts(wData);
      setAnalytics(aData);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCancelBooking = async (id: string, title?: string) => {
    try {
      await api.cancelBooking(id);
      showToast(`Cancelled reservation for "${title || 'class'}"`, 'info');
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-4">
        <h3 className="text-2xl font-bold text-white">Please sign in to view your dashboard.</h3>
      </div>
    );
  }

  const upcomingBookings = bookings.slice(0, 3);
  const recentWorkouts = workouts.slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* 1. Member Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-800 p-6 sm:p-8 bg-gradient-to-r from-gym-900 via-gym-950 to-slate-950">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <img
              src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
              alt={user.name}
              className="w-20 h-20 rounded-2xl object-cover bg-slate-800 border-2 border-lime-500/50 shadow-glow-lime"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black text-white">{user.name}</h1>
                <Badge variant={user.membership_tier === 'vip' ? 'amber' : 'lime'}>
                  {user.membership_tier.toUpperCase()} MEMBER
                </Badge>
                <span className="text-xs bg-lime-500/10 text-lime-400 font-bold px-2 py-0.5 rounded-full border border-lime-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse-dot" /> Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Member Pass ID: <strong className="text-slate-200 font-mono">{user.qr_code_token}</strong> • Valid through {user.membership_expiry}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-5 py-3 bg-gym-900 hover:bg-slate-800 border border-slate-700 hover:border-lime-500/40 text-slate-100 font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg"
            >
              <QrCode className="w-4 h-4 text-lime-400" />
              Digital Check-In Pass
            </button>

            <button
              onClick={() => setCurrentTab('workout-logger')}
              className="px-5 py-3 bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Log Workout Today
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Member Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Workout Streak"
          value={`${user.streak_days || 14} Days`}
          subtitle="Consistency on fire!"
          icon={<Flame className="w-6 h-6" />}
          accentColor="lime"
          trend={{ value: "+3 days this week", isPositive: true }}
        />

        <StatCard
          title="Total Workouts Logged"
          value={analytics?.totalWorkouts || workouts.length || 12}
          subtitle="Logged performance sets"
          icon={<Dumbbell className="w-6 h-6" />}
          accentColor="amber"
          trend={{ value: "Top 5% of members", isPositive: true }}
        />

        <StatCard
          title="Total Lifted Tonnage"
          value={`${((analytics?.totalVolumeKg || 29270) / 1000).toFixed(1)}k kg`}
          subtitle="Accumulated training volume"
          icon={<Trophy className="w-6 h-6" />}
          accentColor="cyan"
          trend={{ value: "+14% vs last month", isPositive: true }}
        />

        <StatCard
          title="Upcoming Classes"
          value={bookings.length}
          subtitle="Reserved spots this week"
          icon={<Calendar className="w-6 h-6" />}
          accentColor="crimson"
        />
      </div>

      {/* 3. Upcoming Booked Classes & Recent Workouts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Upcoming Class Bookings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-lime-400" />
                Your Class Schedule
              </h3>
              <p className="text-xs text-slate-400">Upcoming reserved spots in coach-led sessions.</p>
            </div>

            <button
              onClick={() => setCurrentTab('schedule')}
              className="text-xs font-bold text-lime-400 hover:text-lime-300 flex items-center gap-1"
            >
              Browse Timetable <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {upcomingBookings.length > 0 ? (
            <div className="space-y-3">
              {upcomingBookings.map(b => (
                <div
                  key={b.id}
                  className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-lime-500/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-lime-500/10 border border-lime-500/20 text-lime-400 flex flex-col items-center justify-center font-mono shrink-0">
                      <Clock className="w-4 h-4" />
                      <span className="text-[10px] font-extrabold mt-0.5">{b.start_time}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-white group-hover:text-lime-400 transition-colors">
                          {b.class_title}
                        </h4>
                        <Badge variant="slate" size="sm">
                          {b.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        Date: <strong className="text-slate-200">{b.booking_date}</strong> • Coach: {b.trainer_name} • {b.room}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    <span className="text-xs text-lime-400 font-bold bg-lime-500/10 px-2.5 py-1 rounded-lg border border-lime-500/20">
                      Confirmed
                    </span>
                    <button
                      onClick={() => handleCancelBooking(b.id, b.class_title)}
                      title="Cancel Reservation"
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel p-10 rounded-2xl border border-slate-800 text-center space-y-3">
              <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">You haven't reserved any upcoming classes yet.</p>
              <button
                onClick={() => setCurrentTab('schedule')}
                className="px-4 py-2 bg-lime-500 hover:bg-lime-400 text-black text-xs font-extrabold rounded-xl shadow-glow-lime transition-all"
              >
                Reserve Your First Class
              </button>
            </div>
          )}
        </div>

        {/* Right Col: Recent Workouts Log (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-amber-400" />
                Recent Workouts
              </h3>
              <p className="text-xs text-slate-400">Logged training tonnage and exercise sets.</p>
            </div>

            <button
              onClick={() => setCurrentTab('workout-logger')}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              Log New <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentWorkouts.length > 0 ? (
            <div className="space-y-3">
              {recentWorkouts.map(w => (
                <div
                  key={w.id}
                  className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2 hover:border-amber-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-sm text-slate-100">{w.title}</h4>
                    <span className="text-[11px] font-mono text-slate-400">{w.date}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{w.duration_minutes} Mins Duration</span>
                    <span className="font-bold text-lime-400 font-mono">
                      {w.total_volume_kg?.toLocaleString()} kg Volume
                    </span>
                  </div>

                  {w.sets && w.sets.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                      {Array.from(new Set(w.sets.map(s => s.exercise_name))).slice(0, 3).map((name, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md"
                        >
                          {name}
                        </span>
                      ))}
                      {w.sets.length > 3 && (
                        <span className="text-[10px] text-slate-500 py-0.5">
                          +{w.sets.length - 3} more sets
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel p-10 rounded-2xl border border-slate-800 text-center space-y-3">
              <Dumbbell className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">No workouts logged yet.</p>
              <button
                onClick={() => setCurrentTab('workout-logger')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold rounded-xl"
              >
                Log Today's Sets
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Digital QR Pass Modal */}
      <DigitalQrPassModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        user={user}
      />
    </div>
  );
};
