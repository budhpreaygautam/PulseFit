import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Flame,
  Search,
  Users,
  Filter,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  Sparkles,
  Info
} from 'lucide-react';
import { GymClass, Trainer } from '../../types/index.js';
import { api } from '../../api/client.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';

interface SchedulePageProps {
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ onOpenAuthModal }) => {
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(1); // Mon default
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedIntensity, setSelectedIntensity] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeClassDetail, setActiveClassDetail] = useState<GymClass | null>(null);

  const { isAuthenticated, user, triggerCelebration } = useAuth();
  const { showToast } = useToast();

  const fetchClasses = async () => {
    setIsLoading(true);
    try {
      const data = await api.getClasses();
      setClasses(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load timetable', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const days = [
    { label: 'Monday', short: 'Mon', value: 1 },
    { label: 'Tuesday', short: 'Tue', value: 2 },
    { label: 'Wednesday', short: 'Wed', value: 3 },
    { label: 'Thursday', short: 'Thu', value: 4 },
    { label: 'Friday', short: 'Fri', value: 5 },
    { label: 'Saturday', short: 'Sat', value: 6 },
    { label: 'Sunday', short: 'Sun', value: 0 }
  ];

  const categories = ['All', 'HIIT', 'Strength', 'Yoga', 'CrossFit', 'Boxing', 'Cycling', 'Pilates'];
  const intensities = ['All', 'Low', 'Medium', 'High', 'Extreme'];

  const filteredClasses = classes.filter(c => {
    const matchesDay = c.day_of_week === selectedDay;
    const matchesCategory = selectedCategory === 'All' || c.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesIntensity = selectedIntensity === 'All' || c.intensity.toLowerCase() === selectedIntensity.toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.trainer_name && c.trainer_name.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesDay && matchesCategory && matchesIntensity && matchesSearch;
  });

  const handleBookClass = async (gymClass: GymClass) => {
    if (!isAuthenticated) {
      showToast('Please sign in or use a demo account to reserve a spot!', 'info');
      onOpenAuthModal('login');
      return;
    }

    if (user?.membership_status !== 'active') {
      showToast('Your membership is currently inactive. Please renew to book classes.', 'error');
      return;
    }

    if (gymClass.booked_count >= gymClass.capacity) {
      showToast('This class is completely full.', 'warning');
      return;
    }

    try {
      // Create reservation for upcoming matching weekday date
      const today = new Date();
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + ((gymClass.day_of_week + 7 - today.getDay()) % 7 || 7));
      const dateStr = targetDate.toISOString().split('T')[0];

      await api.createBooking({
        class_id: gymClass.id,
        booking_date: dateStr
      });

      triggerCelebration();
      showToast(`Reserved your spot for "${gymClass.title}" on ${dateStr}!`, 'success', 'Class Confirmed');
      fetchClasses();
    } catch (err: any) {
      showToast(err.message || 'Could not reserve class', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <Badge variant="lime">LIVE TIMETABLE</Badge>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-2 font-['Outfit']">
            INTERACTIVE CLASS SCHEDULE
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Filter by workout discipline, target intensity, and coach. Real-time spot allocation and instant reservation.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search classes or coaches..."
            className="w-full pl-10 pr-4 py-2.5 bg-gym-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-lime-500"
          />
        </div>
      </div>

      {/* Day Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {days.map(d => {
          const count = classes.filter(c => c.day_of_week === d.value).length;
          const isSelected = selectedDay === d.value;
          return (
            <button
              key={d.value}
              onClick={() => setSelectedDay(d.value)}
              className={`flex-1 min-w-[120px] p-3.5 rounded-2xl border text-center transition-all ${
                isSelected
                  ? 'bg-lime-500/10 border-lime-500 text-lime-400 shadow-glow-lime'
                  : 'bg-gym-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              <div className="text-xs font-bold uppercase tracking-wider">{d.short}</div>
              <div className="text-base font-extrabold text-white mt-0.5">{d.label}</div>
              <div className="text-[10px] mt-1 opacity-75 font-medium">{count} Classes</div>
            </button>
          );
        })}
      </div>

      {/* Category & Intensity Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gym-900/60 p-4 rounded-2xl border border-slate-800">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Category:
          </span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-lime-500 text-black font-bold'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Intensity Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Intensity:</span>
          <select
            value={selectedIntensity}
            onChange={e => setSelectedIntensity(e.target.value)}
            className="bg-gym-950 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-lime-500"
          >
            {intensities.map(lvl => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Classes List Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 text-sm">Loading pulse schedule...</div>
      ) : filteredClasses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map(cls => {
            const spotsLeft = cls.capacity - cls.booked_count;
            const occupancyPct = Math.round((cls.booked_count / cls.capacity) * 100);

            return (
              <div
                key={cls.id}
                className="glass-panel glass-panel-hover rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  {/* Top Image Banner */}
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={cls.image_url}
                      alt={cls.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 brightness-85"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gym-950 via-transparent to-transparent" />

                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <Badge
                        variant={cls.intensity === 'Extreme' ? 'crimson' : cls.intensity === 'High' ? 'amber' : 'lime'}
                        size="sm"
                      >
                        {cls.intensity}
                      </Badge>
                      <Badge variant="slate" size="sm">
                        {cls.category}
                      </Badge>
                    </div>

                    <div className="absolute top-3 right-3">
                      <span className="font-mono text-xs font-black bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-lime-400 border border-lime-500/30">
                        {cls.start_time}
                      </span>
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-slate-200">
                      <span className="flex items-center gap-1 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> {cls.duration_minutes} Mins
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-rose-400">
                        <Flame className="w-3.5 h-3.5" /> ~{cls.calories_burn_est} kcal
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-4">
                    <div>
                      <h3 className="text-lg font-black text-white group-hover:text-lime-400 transition-colors">
                        {cls.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {cls.description}
                      </p>
                    </div>

                    {/* Coach & Room */}
                    <div className="flex items-center justify-between pt-2 text-xs border-t border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <img
                          src={cls.trainer_avatar || 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200'}
                          alt={cls.trainer_name}
                          className="w-7 h-7 rounded-full object-cover border border-slate-700"
                        />
                        <div>
                          <div className="font-bold text-slate-200">{cls.trainer_name}</div>
                          <div className="text-[10px] text-slate-500">{cls.room}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveClassDetail(cls)}
                        className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 text-xs flex items-center gap-1 transition-colors"
                        title="View Class Info"
                      >
                        <Info className="w-4 h-4" /> Details
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer / Booking Action */}
                <div className="p-5 pt-0">
                  {/* Capacity Bar */}
                  <div className="mb-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        Occupancy: <strong className="text-slate-200">{cls.booked_count}/{cls.capacity}</strong>
                      </span>
                      <span className={`font-bold ${spotsLeft <= 3 ? 'text-rose-400' : 'text-lime-400'}`}>
                        {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Class Full'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          occupancyPct >= 90 ? 'bg-rose-500' : occupancyPct >= 60 ? 'bg-amber-400' : 'bg-lime-400'
                        }`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleBookClass(cls)}
                    disabled={spotsLeft <= 0}
                    className={`w-full py-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                      spotsLeft > 0
                        ? 'bg-gradient-to-r from-lime-500 to-lime-400 hover:from-lime-400 text-black shadow-glow-lime active:scale-[0.98]'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {spotsLeft > 0 ? (isAuthenticated ? 'Reserve Spot' : 'Sign In & Book') : 'Waitlist Only'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel p-16 rounded-3xl text-center border border-slate-800 space-y-3">
          <Dumbbell className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-lg font-bold text-slate-200">No matching classes found</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try resetting your category/intensity filters or choose another day of the week.
          </p>
          <button
            onClick={() => {
              setSelectedCategory('All');
              setSelectedIntensity('All');
              setSearchQuery('');
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-xl"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Class Details Modal */}
      {activeClassDetail && (
        <Modal
          isOpen={!!activeClassDetail}
          onClose={() => setActiveClassDetail(null)}
          title={activeClassDetail.title}
          description={`${activeClassDetail.category} • ${activeClassDetail.room} • ${activeClassDetail.duration_minutes} Mins`}
          maxWidth="lg"
        >
          <div className="space-y-6">
            <img
              src={activeClassDetail.image_url}
              alt={activeClassDetail.title}
              className="w-full h-48 object-cover rounded-2xl border border-slate-800"
            />

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Class Overview</h4>
              <p className="text-sm text-slate-300 leading-relaxed">{activeClassDetail.description}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-gym-950 border border-slate-800 text-center">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Intensity</div>
                <div className="text-sm font-extrabold text-lime-400 mt-1">{activeClassDetail.intensity}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Est. Calories</div>
                <div className="text-sm font-extrabold text-rose-400 mt-1">~{activeClassDetail.calories_burn_est} kcal</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Room Arena</div>
                <div className="text-sm font-extrabold text-slate-200 mt-1">{activeClassDetail.room}</div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src={activeClassDetail.trainer_avatar || 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200'}
                  alt={activeClassDetail.trainer_name}
                  className="w-10 h-10 rounded-full object-cover border border-slate-700"
                />
                <div>
                  <div className="text-xs font-bold text-white">Coach {activeClassDetail.trainer_name}</div>
                  <div className="text-[10px] text-lime-400">Head Instructor</div>
                </div>
              </div>

              <button
                onClick={() => {
                  handleBookClass(activeClassDetail);
                  setActiveClassDetail(null);
                }}
                className="px-6 py-2.5 bg-lime-500 hover:bg-lime-400 text-black font-extrabold text-xs rounded-xl shadow-glow-lime"
              >
                Confirm Booking
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
