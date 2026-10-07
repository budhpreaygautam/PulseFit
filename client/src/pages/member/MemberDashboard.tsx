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
  Plus,
  Timer,
  Play,
  Square,
  Music2,
  History,
  Zap,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api } from '../../api/client.js';
import { Booking, Workout, WorkoutAnalytics, UserTimeTrackingStats, TimeSessionCategory } from '../../types/index.js';
import { Badge } from '../../components/common/Badge.js';
import { StatCard } from '../../components/common/StatCard.js';
import { DigitalQrPassModal } from '../../components/qr/DigitalQrPassModal.js';

interface MemberDashboardProps {
  setCurrentTab: (tab: string) => void;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({ setCurrentTab }) => {
  const { user, triggerCelebration } = useAuth();
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [analytics, setAnalytics] = useState<WorkoutAnalytics | null>(null);
  const [timeStats, setTimeStats] = useState<UserTimeTrackingStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);

  // Time Tracking State
  const [selectedCategory, setSelectedCategory] = useState<TimeSessionCategory>('Workout & Strength');
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [isClocking, setIsClocking] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [bData, wData, aData, tData] = await Promise.all([
        api.getMyBookings(),
        api.getWorkouts(),
        api.getWorkoutAnalytics(),
        api.getMyTimeTrackingStats().catch(() => null)
      ]);
      setBookings(bData);
      setWorkouts(wData);
      setAnalytics(aData);
      if (tData) setTimeStats(tData);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Live Timer for active clock-in session
  useEffect(() => {
    if (!timeStats?.activeSession) {
      setElapsedTime('00:00:00');
      return;
    }

    const updateTimer = () => {
      const startTime = new Date(timeStats.activeSession!.clock_in_time).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - startTime);

      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      const pad = (n: number) => n.toString().padStart(2, '0');
      setElapsedTime(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    return () => clearInterval(timerInterval);
  }, [timeStats?.activeSession]);

  const handleClockIn = async () => {
    setIsClocking(true);
    try {
      const session = await api.clockIn(selectedCategory, sessionNotes);
      showToast(`Clocked in to ${session.category}! Timer is running.`, 'success', 'Session Started');
      triggerCelebration();
      setSessionNotes('');
      // Refresh time stats
      const updatedStats = await api.getMyTimeTrackingStats();
      setTimeStats(updatedStats);
    } catch (err: any) {
      showToast(err.message || 'Failed to clock in', 'error');
    } finally {
      setIsClocking(false);
    }
  };

  const handleClockOut = async () => {
    setIsClocking(true);
    try {
      const session = await api.clockOut(sessionNotes);
      showToast(
        `Great job! Clocked out after ${session.duration_minutes} minutes of ${session.category}.`,
        'success',
        'Workout Completed'
      );
      triggerCelebration();
      setSessionNotes('');
      // Refresh time stats & analytics
      const [updatedStats, updatedAnalytics] = await Promise.all([
        api.getMyTimeTrackingStats(),
        api.getWorkoutAnalytics()
      ]);
      setTimeStats(updatedStats);
      setAnalytics(updatedAnalytics);
    } catch (err: any) {
      showToast(err.message || 'Failed to clock out', 'error');
    } finally {
      setIsClocking(false);
    }
  };

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
  const isCurrentlyClockedIn = !!timeStats?.activeSession;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">
      {/* 1. Member Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden neu-flat p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <img
              src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
              alt={user.name}
              className="w-20 h-20 rounded-2xl object-cover bg-slate-800 border-2 border-lime-500/50 shadow-glow-lime"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">{user.name}</h1>
                <Badge variant={user.membership_tier === 'vip' ? 'amber' : user.membership_tier === 'pro' ? 'lime' : 'cyan'}>
                  {user.membership_tier.toUpperCase()} MEMBER
                </Badge>
                <span className="text-xs bg-lime-500/10 text-lime-400 font-bold px-2 py-0.5 rounded-full border border-lime-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse-dot" /> Active
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Member Pass ID: <strong className="text-slate-200 font-mono">{user.qr_code_token}</strong> • Valid through {user.membership_expiry}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-5 py-3 neu-btn text-slate-100 font-bold text-xs rounded-xl transition-all flex items-center gap-2"
            >
              <QrCode className="w-4 h-4 text-lime-400" />
              Digital Check-In Pass
            </button>

            <button
              onClick={() => setCurrentTab('workout-logger')}
              className="px-5 py-3 neu-btn-lime text-black font-extrabold text-xs rounded-xl shadow-glow-lime transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Log Workout Sets
            </button>
          </div>
        </div>
      </div>

      {/* 2. Clock-In / Clock-Out & Real-Time Floor Time Tracker Widget */}
      <div className="rounded-3xl neu-flat p-6 sm:p-8 relative overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-lime-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={isCurrentlyClockedIn ? 'lime' : 'slate'}>
                {isCurrentlyClockedIn ? 'SESSION IN PROGRESS' : 'GYM ATTENDANCE TRACKER'}
              </Badge>
              {isCurrentlyClockedIn && (
                <span className="flex items-center gap-1.5 text-xs text-lime-400 font-bold bg-lime-500/10 px-2.5 py-0.5 rounded-full border border-lime-500/30">
                  <span className="w-2 h-2 rounded-full bg-lime-400 animate-ping" />
                  Clocked In Now
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2 font-['Outfit']">
              <Timer className="w-6 h-6 text-lime-400" />
              GYM FLOOR CLOCK-IN & TIME TRACKING
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl font-medium">
              Clock in when you start training and clock out when you leave. Track your time in Strength vs. Zumba sessions accurately.
            </p>
          </div>

          {/* Running Live Timer Display */}
          <div className="flex items-center gap-4 neu-pressed-sm p-3.5 sm:p-4 rounded-2xl shrink-0">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400">Elapsed Time</div>
              <div className={`font-mono text-2xl sm:text-3xl font-black ${isCurrentlyClockedIn ? 'text-lime-400' : 'text-slate-500'}`}>
                {elapsedTime}
              </div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
              isCurrentlyClockedIn
                ? 'bg-lime-500/15 border-lime-500/40 text-lime-400 shadow-glow-lime animate-pulse'
                : 'bg-slate-900/50 border-slate-800 text-slate-600'
            }`}>
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Clock-In / Out Controls & Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
          {/* Action Form / Active Card (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {isCurrentlyClockedIn ? (
              <div className="p-5 sm:p-6 rounded-2xl neu-pressed-sm border border-lime-500/40 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Currently Active At</div>
                    <div className="flex items-center gap-2">
                      {timeStats?.activeSession?.category === 'Zumba & Cardio' ? (
                        <Music2 className="w-5 h-5 text-pink-400" />
                      ) : (
                        <Dumbbell className="w-5 h-5 text-lime-400" />
                      )}
                      <h3 className="text-lg font-black text-white font-['Outfit']">
                        {timeStats?.activeSession?.category}
                      </h3>
                    </div>
                    <div className="text-xs text-slate-400">
                      Started at: <span className="text-slate-200 font-mono font-bold">
                        {timeStats?.activeSession ? new Date(timeStats.activeSession.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </span>
                      {timeStats?.activeSession?.notes && ` • Notes: "${timeStats.activeSession.notes}"`}
                    </div>
                  </div>

                  <button
                    onClick={handleClockOut}
                    disabled={isClocking}
                    className="px-6 py-3.5 bg-rose-500 hover:bg-rose-400 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all shrink-0"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    {isClocking ? 'Clocking Out...' : 'Clock Out & Complete Session'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 rounded-2xl neu-pressed-sm space-y-4">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Select Workout Discipline to Clock In:
                </div>

                {/* Category Radio Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('Workout & Strength')}
                    className={`p-4 rounded-xl text-left flex items-start gap-3 transition-all ${
                      selectedCategory === 'Workout & Strength'
                        ? 'neu-pressed-sm border border-lime-500/60 shadow-glow-lime'
                        : 'neu-flat hover:border-slate-700'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${selectedCategory === 'Workout & Strength' ? 'bg-lime-500 text-black' : 'bg-slate-800 text-slate-400'}`}>
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-extrabold text-xs text-white">Workout & Strength</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Free weights, barbells & machines</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory('Zumba & Cardio')}
                    className={`p-4 rounded-xl text-left flex items-start gap-3 transition-all ${
                      selectedCategory === 'Zumba & Cardio'
                        ? 'neu-pressed-sm border border-pink-500/60 shadow-glow-pink'
                        : 'neu-flat hover:border-slate-700'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${selectedCategory === 'Zumba & Cardio' ? 'bg-pink-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      <Music2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-extrabold text-xs text-white">Zumba & Cardio</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-medium">Dance studio, steps & aerobic cardio</div>
                    </div>
                  </button>
                </div>

                {/* Optional Note & Clock In Button */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <input
                    type="text"
                    value={sessionNotes}
                    onChange={e => setSessionNotes(e.target.value)}
                    placeholder="Optional: e.g. Leg Day / Evening Zumba with Priya"
                    className="flex-1 w-full px-4 py-3 text-xs text-slate-100 placeholder-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleClockIn}
                    disabled={isClocking}
                    className="w-full sm:w-auto px-6 py-3 neu-btn-lime text-black font-black text-xs rounded-xl shadow-glow-lime transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0"
                  >
                    <Play className="w-4 h-4 fill-black" />
                    {isClocking ? 'Clocking In...' : 'Clock In Now'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Time Tracking Stats Cards (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl neu-pressed-sm flex flex-col justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This Week</div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-lime-400 font-['Outfit']">
                  {Math.round((timeStats?.totalTimeMinutesThisWeek || 0) / 60 * 10) / 10} <span className="text-xs text-slate-400 font-normal">hrs</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                  {timeStats?.totalTimeMinutesThisWeek || 0} total minutes
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl neu-pressed-sm flex flex-col justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">This Month</div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-['Outfit']">
                  {Math.round((timeStats?.totalTimeMinutesThisMonth || 0) / 60 * 10) / 10} <span className="text-xs text-slate-400 font-normal">hrs</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                  {timeStats?.totalTimeMinutesThisMonth || 0} total minutes
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl neu-pressed-sm col-span-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completed Sessions</div>
                <div className="text-xl font-black text-white mt-1 font-['Outfit']">
                  {timeStats?.totalSessionsCompleted || 0} Gym Visits Logged
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Trophy className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Clock-in History List */}
        {timeStats?.recentSessions && timeStats.recentSessions.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-lime-400" /> Recent Clock-In Sessions
              </h4>
              <span className="text-[10px] text-slate-500">Last {timeStats.recentSessions.length} recorded</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {timeStats.recentSessions.slice(0, 3).map(s => (
                <div key={s.id} className="p-3 neu-pressed-sm rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg ${s.category === 'Zumba & Cardio' ? 'bg-pink-500/10 text-pink-400' : 'bg-lime-500/10 text-lime-400'}`}>
                      {s.category === 'Zumba & Cardio' ? <Music2 className="w-3.5 h-3.5" /> : <Dumbbell className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-200">{s.category}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(s.clock_in_time).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(s.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-lime-400 text-xs">
                    {s.duration_minutes} mins
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Key Member Stat Tiles */}
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

      {/* 4. Upcoming Booked Classes & Recent Workouts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Upcoming Class Bookings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-white flex items-center gap-2 font-['Outfit']">
                <Calendar className="w-5 h-5 text-lime-400" />
                Your Class Schedule
              </h3>
              <p className="text-xs text-slate-400 font-medium">Upcoming reserved spots in coach-led sessions.</p>
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
                  className="neu-flat p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-lime-500/40 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl neu-pressed-sm text-lime-400 flex flex-col items-center justify-center font-mono shrink-0">
                      <Clock className="w-4 h-4" />
                      <span className="text-[10px] font-extrabold mt-0.5">{b.start_time}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-white group-hover:text-lime-400 transition-colors font-['Outfit']">
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
            <div className="neu-flat p-10 rounded-2xl text-center space-y-3">
              <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">You haven't reserved any upcoming classes yet.</p>
              <button
                onClick={() => setCurrentTab('schedule')}
                className="px-4 py-2 neu-btn-lime text-black text-xs font-extrabold rounded-xl shadow-glow-lime transition-all"
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
              <h3 className="text-lg font-black text-white flex items-center gap-2 font-['Outfit']">
                <Dumbbell className="w-5 h-5 text-amber-400" />
                Recent Workouts
              </h3>
              <p className="text-xs text-slate-400 font-medium">Logged training tonnage and exercise sets.</p>
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
                  className="neu-flat p-4 rounded-2xl space-y-2 hover:border-amber-500/40 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-sm text-slate-100 font-['Outfit']">{w.title}</h4>
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
                          className="text-[10px] neu-pressed-sm text-slate-300 px-2 py-0.5 rounded-md"
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
            <div className="neu-flat p-10 rounded-2xl text-center space-y-3">
              <Dumbbell className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">No workouts logged yet.</p>
              <button
                onClick={() => setCurrentTab('workout-logger')}
                className="px-4 py-2 neu-btn text-amber-400 text-xs font-extrabold rounded-xl"
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
