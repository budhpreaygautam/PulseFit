import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Filter, Flame, Info, Loader2, Moon, Search, Sparkles, Users } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiData } from '../../components/public/useApiData.js';
import { cheapestPlanFor } from '../../components/public/plans.js';
import { CATEGORIES, HOURS_DAYS, HOURS_TIME, mondayOf, weekdayOf } from '../../components/public/gymInfo.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, errorMessage, isApiError } from '../../api/client.js';
import { addDays, formatClock, formatDate, formatINR, gymToday, STATUS_LABELS } from '../../lib/format.js';
import { ClassOccurrence, MembershipPlan } from '../../types/index.js';

interface SchedulePageProps {
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

const BOOKING_WINDOW_DAYS = 14;
const INTENSITY_ORDER = ['Low', 'Medium', 'High', 'Extreme'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CardIssue {
  message: string;
  action?: { label: string; tab: string; params?: Record<string, string> };
}

const occurrenceKey = (c: ClassOccurrence) => `${c.id}:${c.occurrence_date}`;

/** Initial week (a Monday) and day index (0 = Monday) from ?week= and ?day=, clamped to what can be shown. */
function initialView(params: URLSearchParams): { weekStart: string; dayIndex: number } {
  const today = gymToday();
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, BOOKING_WINDOW_DAYS);
  const requestedWeek = params.get('week');
  const requestedDay = params.get('day');

  let weekStart = thisMonday;
  let dayIndex = (weekdayOf(today) + 6) % 7;
  // On a Sunday the rest of this week is over, so open on next week's Monday.
  if (weekdayOf(today) === 0) {
    weekStart = addDays(thisMonday, 7);
    dayIndex = 0;
  }
  if (requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) && mondayOf(requestedWeek) === requestedWeek && requestedWeek >= thisMonday && requestedWeek <= lastMonday) {
    weekStart = requestedWeek;
    if (requestedWeek !== thisMonday) dayIndex = 0;
  }
  if (requestedDay !== null && /^[0-6]$/.test(requestedDay)) dayIndex = (Number(requestedDay) + 6) % 7;
  return { weekStart, dayIndex };
}

function categoryFrom(params: URLSearchParams): string {
  const requested = params.get('category');
  return requested && (CATEGORIES as string[]).includes(requested) ? requested : 'All';
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ onOpenAuthModal }) => {
  const { params, navigate } = useNavigation();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState(() => initialView(params));
  const [trainerId, setTrainerId] = useState(() => params.get('trainer') ?? '');
  const [category, setCategory] = useState(() => categoryFrom(params));
  const [intensity, setIntensity] = useState('All');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ClassOccurrence | null>(null);
  const [toCancel, setToCancel] = useState<ClassOccurrence | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, CardIssue>>({});
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);

  // A new navigation to the timetable (e.g. "View classes" on a coach) re-reads the query string.
  useEffect(() => {
    setView(initialView(params));
    setTrainerId(params.get('trainer') ?? '');
    setCategory(categoryFrom(params));
  }, [params]);

  const today = gymToday();
  const thisMonday = mondayOf(today);
  const lastBookable = addDays(today, BOOKING_WINDOW_DAYS);
  const { weekStart, dayIndex } = view;

  const classesState = useApiData(() => api.getClasses({ week_start: weekStart, trainerId: trainerId || undefined }), [weekStart, trainerId, user?.id]);
  const trainersState = useApiData(() => api.getTrainers());
  const classes = classesState.data ?? [];

  const coachOptions = useMemo(() => {
    const list = trainersState.data?.map(t => ({ id: t.id, name: t.name })) ?? [];
    if (trainerId && !list.some(t => t.id === trainerId)) {
      const fromClasses = classes.find(c => c.trainer_id === trainerId);
      list.push({ id: trainerId, name: fromClasses?.trainer_name ?? 'Selected coach' });
    }
    return list;
  }, [trainersState.data, trainerId, classes]);

  const intensityOptions = useMemo(
    () => INTENSITY_ORDER.filter(level => classes.some(c => c.intensity === level)),
    [classes]
  );

  // A new week or coach can drop the chosen intensity from the list; keep the filter in step with what the select shows.
  useEffect(() => {
    if (classesState.data && intensity !== 'All' && !intensityOptions.includes(intensity)) setIntensity('All');
  }, [classesState.data, intensityOptions, intensity]);

  const matchesFilters = (c: ClassOccurrence) => {
    const q = search.trim().toLowerCase();
    return (
      (category === 'All' || c.category === category) &&
      (intensity === 'All' || c.intensity === intensity) &&
      (!q || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || (c.trainer_name ?? '').toLowerCase().includes(q))
    );
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { index: i, date, label: DAY_LABELS[i], count: classes.filter(c => c.occurrence_date === date && matchesFilters(c)).length };
  });
  const selectedDate = days[dayIndex].date;
  const dayClasses = classes.filter(c => c.occurrence_date === selectedDate && matchesFilters(c));
  const filtersActive = category !== 'All' || intensity !== 'All' || search.trim() !== '' || trainerId !== '';

  const weekLabel = weekStart === thisMonday ? 'This week' : weekStart === addDays(thisMonday, 7) ? 'Next week' : `Week of ${formatDate(weekStart, { day: 'numeric', month: 'short' })}`;
  const weekRange = `${formatDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatDate(addDays(weekStart, 5), { day: 'numeric', month: 'short' })}`;

  const changeWeek = (delta: number) => {
    setView(v => ({ weekStart: addDays(v.weekStart, delta * 7), dayIndex: v.dayIndex }));
    setIssues({});
  };

  const clearFilters = () => {
    setCategory('All');
    setIntensity('All');
    setSearch('');
    setTrainerId('');
  };

  const setIssue = (c: ClassOccurrence, issue: CardIssue | null) =>
    setIssues(prev => {
      const next = { ...prev };
      if (issue) next[occurrenceKey(c)] = issue;
      else delete next[occurrenceKey(c)];
      return next;
    });

  const loadPlans = async (): Promise<MembershipPlan[] | null> => {
    if (plans) return plans;
    try {
      const loaded = await api.getPlans();
      setPlans(loaded);
      return loaded;
    } catch {
      return null;
    }
  };

  const explainBookingError = async (c: ClassOccurrence, err: unknown): Promise<CardIssue | null> => {
    const code = isApiError(err) ? err.code : undefined;
    switch (code) {
      case 'ALREADY_BOOKED':
        showToast(`You're already booked into ${c.title}.`, 'info');
        return null;
      case 'PLAN_EXCLUDES_CATEGORY': {
        const all = await loadPlans();
        const current = all?.find(p => p.tier === user?.membership_tier);
        const cover = all ? cheapestPlanFor(all, c.category, current) : undefined;
        return {
          message: cover
            ? `${current ? `Your ${current.name}` : 'Your plan'} doesn't include ${c.category} classes. The ${cover.name} covers them${current ? ' as well as everything your plan has now' : ''}, from ${formatINR(cover.price_monthly)} a month.`
            : errorMessage(err),
          action: { label: cover ? `See the ${cover.name}` : 'See plans', tab: 'pricing', params: cover ? { plan: cover.tier } : undefined }
        };
      }
      case 'MEMBERSHIP_INACTIVE': {
        const status = (isApiError(err) && (err.data as { status?: string } | undefined)?.status) || user?.membership_status;
        if (status === 'frozen') {
          return { message: 'Your membership is frozen. Unfreeze it on your account page to book classes.', action: { label: 'Go to my account', tab: 'profile' } };
        }
        return {
          message: status === 'expired' ? 'Your membership has ended. Renew it to book classes.' : 'You need an active membership to book classes.',
          action: { label: status === 'expired' ? 'Renew my plan' : 'Choose a plan', tab: 'pricing' }
        };
      }
      case 'MEMBERS_ONLY':
        return { message: 'Only member accounts can book classes. Staff accounts can view the timetable.' };
      case 'CLASS_FULL':
        return { message: 'This class just filled up. Try another session.' };
      case 'CLASS_STARTED':
        return { message: 'This class has already started, so it can no longer be booked.' };
      case 'TOO_FAR_AHEAD':
        return { message: `Classes can be booked up to ${BOOKING_WINDOW_DAYS} days ahead. Booking for this one opens on ${formatDate(addDays(c.occurrence_date, -BOOKING_WINDOW_DAYS))}.` };
      case 'DATE_MISMATCH':
        return { message: 'This class has moved to another day. The timetable has been refreshed.' };
      default:
        return { message: errorMessage(err) };
    }
  };

  const handleBook = async (c: ClassOccurrence) => {
    if (!user) {
      showToast('Sign in to book a class.', 'info');
      onOpenAuthModal('login');
      return;
    }
    setIssue(c, null);
    setBusyKey(occurrenceKey(c));
    try {
      // occurrence_date comes from the server, which works in gym time; never derive it here.
      await api.createBooking({ class_id: c.id, booking_date: c.occurrence_date });
      showToast(`${c.title}, ${formatDate(c.occurrence_date)} at ${formatClock(c.start_time)}.`, 'success', 'Class booked');
    } catch (err) {
      setIssue(c, await explainBookingError(c, err));
    } finally {
      setBusyKey(null);
      classesState.reload();
    }
  };

  const handleCancel = async () => {
    const c = toCancel;
    if (!c?.my_booking_id) return;
    try {
      await api.cancelBooking(c.my_booking_id);
      showToast(`Your booking for ${c.title} on ${formatDate(c.occurrence_date)} is cancelled.`, 'info', 'Booking cancelled');
      setIssue(c, null);
    } catch (err) {
      const code = isApiError(err) ? err.code : undefined;
      setIssue(c, {
        message:
          code === 'CLASS_STARTED'
            ? 'This class has already started, so the booking can no longer be cancelled.'
            : code === 'ALREADY_CANCELLED'
              ? 'This booking was already cancelled.'
              : errorMessage(err)
      });
    } finally {
      classesState.reload();
    }
  };

  const renderAction = (c: ClassOccurrence, onDone?: () => void) => {
    const key = occurrenceKey(c);
    const started = new Date(c.starts_at).getTime() <= Date.now();
    const isBusy = busyKey === key;

    if (c.my_booking_id) {
      return (
        <div className="flex items-center gap-2">
          <span className="flex-1 py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 neu-pressed-sm text-lime-400 border border-lime-500/30">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Booked
          </span>
          {!started && (
            <button
              type="button"
              onClick={() => {
                onDone?.();
                setToCancel(c);
              }}
              className="px-4 py-3 rounded-xl text-xs font-bold neu-btn text-rose-400"
            >
              Cancel
            </button>
          )}
        </div>
      );
    }

    let disabledLabel: string | null = null;
    if (started) disabledLabel = 'Already started';
    else if (c.is_full) disabledLabel = 'Class full';
    else if (c.occurrence_date > lastBookable) disabledLabel = `Booking opens ${formatDate(addDays(c.occurrence_date, -BOOKING_WINDOW_DAYS), { day: 'numeric', month: 'short' })}`;
    else if (user && user.role !== 'member') disabledLabel = 'Only members can book';

    if (disabledLabel) {
      return (
        <p className="w-full py-3 rounded-xl text-xs font-bold text-center neu-pressed-sm text-slate-400" aria-live="polite">
          {disabledLabel}
        </p>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          onDone?.();
          handleBook(c);
        }}
        disabled={isBusy}
        className="w-full py-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 neu-btn-lime disabled:opacity-60"
      >
        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
        {isBusy ? 'Booking…' : user ? 'Book this class' : 'Sign in to book'}
        <span className="sr-only">
          {' '}
          {c.title}, {formatDate(c.occurrence_date)} at {formatClock(c.start_time)}
        </span>
      </button>
    );
  };

  const membershipNotice =
    user?.role === 'member' && user.membership_status !== 'active'
      ? user.membership_status === 'frozen'
        ? { text: 'Your membership is frozen, so you cannot book classes until you unfreeze it.', label: 'Go to my account', tab: 'profile' }
        : { text: `Your membership status is "${STATUS_LABELS[user.membership_status]}". You need an active plan to book classes.`, label: 'See plans', tab: 'pricing' }
      : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <Badge variant="lime">CLASS TIMETABLE</Badge>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-100 tracking-tight mt-2 font-['Outfit']">BOOK A CLASS</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl font-medium">
            Classes run {HOURS_DAYS}. Members can book up to {BOOKING_WINDOW_DAYS} days ahead; spots are counted for each date.
          </p>
        </div>

        <div className="w-full md:w-72">
          <label htmlFor="schedule-search" className="sr-only">
            Search classes or coaches
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input
              id="schedule-search"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search classes or coaches…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-100 placeholder-slate-500"
            />
          </div>
        </div>
      </div>

      {membershipNotice && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-slate-200">
          <p className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            {membershipNotice.text}
          </p>
          <button type="button" onClick={() => navigate(membershipNotice.tab)} className="neu-btn px-4 py-2 rounded-xl text-xs font-bold text-slate-200 shrink-0">
            {membershipNotice.label}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => changeWeek(-1)}
          disabled={weekStart <= thisMonday}
          className="neu-btn p-2.5 rounded-xl text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="text-center" aria-live="polite">
          <div className="text-sm font-black text-slate-100 font-['Outfit']">{weekLabel}</div>
          <div className="text-xs text-slate-400">{weekRange}</div>
        </div>
        <button
          type="button"
          onClick={() => changeWeek(1)}
          disabled={weekStart >= addDays(thisMonday, BOOKING_WINDOW_DAYS)}
          className="neu-btn p-2.5 rounded-xl text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2" role="tablist" aria-label="Day of the week">
        {days.map(d => {
          const isSelected = dayIndex === d.index;
          const isPast = d.date < today;
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              id={`day-tab-${d.index}`}
              aria-selected={isSelected}
              aria-controls="day-panel"
              onClick={() => setView(v => ({ ...v, dayIndex: d.index }))}
              className={`p-2.5 sm:p-3 rounded-2xl text-center transition-all ${
                isSelected ? 'neu-pressed-sm border border-lime-500/50 text-lime-400' : 'neu-flat text-slate-400 border border-slate-800/80'
              } ${isPast && !isSelected ? 'opacity-60' : ''}`}
            >
              <div className="text-xs font-bold uppercase tracking-wider">{d.label}</div>
              <div className="text-sm sm:text-base font-extrabold text-slate-100 mt-0.5 font-['Outfit']">{formatDate(d.date, { day: 'numeric', month: 'short' })}</div>
              <div className="text-[10px] mt-1 font-medium">{d.index === 6 ? 'Closed' : classesState.isLoading ? '…' : `${d.count} ${d.count === 1 ? 'class' : 'classes'}`}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 neu-flat p-4 rounded-2xl border border-slate-800/80">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Category">
          <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-lime-400" aria-hidden="true" /> Category:
          </span>
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              type="button"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs transition-all ${category === cat ? 'neu-btn-lime font-extrabold' : 'neu-btn text-slate-300 font-semibold'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="schedule-intensity" className="text-xs font-bold text-slate-400">
              Intensity
            </label>
            <select
              id="schedule-intensity"
              value={intensity}
              onChange={e => setIntensity(e.target.value)}
              className="text-xs text-slate-200 rounded-xl px-3 py-1.5 font-medium cursor-pointer"
            >
              <option value="All">All</option>
              {intensityOptions.map(level => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="schedule-coach" className="text-xs font-bold text-slate-400">
              Coach
            </label>
            <select
              id="schedule-coach"
              value={trainerId}
              onChange={e => setTrainerId(e.target.value)}
              className="text-xs text-slate-200 rounded-xl px-3 py-1.5 font-medium cursor-pointer max-w-[12rem]"
            >
              <option value="">All coaches</option>
              {coachOptions.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="text-xs font-bold text-lime-400 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${dayIndex}`}>
        {dayIndex === 6 ? (
          <div className="neu-flat p-10 sm:p-14 rounded-3xl text-center border border-slate-800/80 space-y-4 max-w-2xl mx-auto">
            <Moon className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" aria-hidden="true" />
            <h2 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">Closed on Sundays</h2>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              The gym is open {HOURS_DAYS}, {HOURS_TIME}. There are no classes on Sundays.
            </p>
            <button
              type="button"
              onClick={() => (weekStart < addDays(thisMonday, BOOKING_WINDOW_DAYS) ? setView({ weekStart: addDays(weekStart, 7), dayIndex: 0 }) : setView(v => ({ ...v, dayIndex: 0 })))}
              className="px-6 py-3 neu-btn-lime font-extrabold text-xs rounded-xl"
            >
              {weekStart < addDays(thisMonday, BOOKING_WINDOW_DAYS) ? "See next Monday's classes" : "See Monday's classes"}
            </button>
          </div>
        ) : classesState.isLoading && !classesState.data ? (
          <LoadingState label="Loading the timetable…" />
        ) : classesState.error ? (
          <ErrorState message={classesState.error} onRetry={classesState.reload} />
        ) : dayClasses.length === 0 ? (
          <EmptyState
            title={filtersActive ? 'No classes match your filters on this day' : 'No classes on this day'}
            body={filtersActive ? 'Try another day, or clear the filters.' : 'Pick another day to see what is on.'}
            action={
              filtersActive ? (
                <button type="button" onClick={clearFilters} className="px-4 py-2 neu-btn text-xs font-bold text-slate-200 rounded-xl">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dayClasses.map(c => {
              const occupancy = c.capacity > 0 ? Math.min(100, Math.round((c.booked_count / c.capacity) * 100)) : 0;
              const issue = issues[occurrenceKey(c)];
              return (
                <li key={occurrenceKey(c)} className="neu-flat rounded-3xl border border-slate-800/80 overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="relative h-40 overflow-hidden bg-slate-900">
                      <img src={c.image_url} alt="" className="w-full h-full object-cover brightness-[.85]" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-black/70 text-[10px] font-bold uppercase tracking-wider text-zinc-100">{c.intensity}</span>
                        <span className="px-2 py-0.5 rounded-md bg-black/70 text-[10px] font-bold uppercase tracking-wider text-zinc-100">{c.category}</span>
                      </div>
                      <span className="absolute top-3 right-3 font-mono text-xs font-black bg-black/80 px-2.5 py-1 rounded-lg text-lime-300 border border-lime-400/30">
                        {formatClock(c.start_time)}
                      </span>
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-zinc-100 font-semibold">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {c.duration_minutes} min
                        </span>
                        {c.calories_burn_est > 0 && (
                          <span className="flex items-center gap-1 text-rose-300">
                            <Flame className="w-3.5 h-3.5" aria-hidden="true" /> ~{c.calories_burn_est} kcal (estimate)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-100 font-['Outfit']">{c.title}</h2>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{c.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 text-xs border-t border-slate-800/80 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {c.trainer_avatar && <img src={c.trainer_avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 truncate">{c.trainer_name ?? 'Coach to be confirmed'}</div>
                            <div className="text-[10px] text-slate-400 truncate">{c.room}</div>
                          </div>
                        </div>
                        <button type="button" onClick={() => setDetail(c)} className="text-slate-300 p-1.5 rounded-lg neu-btn text-xs flex items-center gap-1 shrink-0">
                          <Info className="w-3.5 h-3.5" aria-hidden="true" /> Details<span className="sr-only"> about {c.title}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          {c.booked_count} of {c.capacity} booked
                        </span>
                        <span className={`font-bold ${c.is_full ? 'text-rose-400' : c.spots_left <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-lime-400'}`}>
                          {c.is_full ? 'Class full' : `${c.spots_left} ${c.spots_left === 1 ? 'spot' : 'spots'} left`}
                        </span>
                      </div>
                      <div
                        className="w-full h-1.5 neu-pressed-sm rounded-full overflow-hidden"
                        role="progressbar"
                        aria-label={`${c.title} occupancy`}
                        aria-valuemin={0}
                        aria-valuemax={c.capacity}
                        aria-valuenow={c.booked_count}
                      >
                        <div
                          className={`h-full rounded-full ${occupancy >= 90 ? 'bg-rose-500' : occupancy >= 60 ? 'bg-amber-400' : 'bg-lime-400'}`}
                          style={{ width: `${occupancy}%` }}
                        />
                      </div>
                    </div>

                    {issue && (
                      <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-slate-200 space-y-2">
                        <p>{issue.message}</p>
                        {issue.action && (
                          <button type="button" onClick={() => navigate(issue.action!.tab, issue.action!.params)} className="font-bold text-lime-400 hover:underline">
                            {issue.action.label}
                          </button>
                        )}
                      </div>
                    )}

                    {renderAction(c)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detail && (
        <Modal
          isOpen={!!detail}
          onClose={() => setDetail(null)}
          title={detail.title}
          description={`${formatDate(detail.occurrence_date)} · ${formatClock(detail.start_time)} · ${detail.duration_minutes} min · ${detail.room}`}
          maxWidth="lg"
        >
          <div className="space-y-6">
            {detail.image_url && <img src={detail.image_url} alt="" className="w-full h-48 object-cover rounded-2xl border border-slate-800/80" />}
            <p className="text-sm text-slate-300 leading-relaxed">{detail.description}</p>
            <dl className="grid grid-cols-3 gap-3 p-4 rounded-2xl neu-pressed-sm text-center">
              <div>
                <dt className="text-[10px] text-slate-400 uppercase font-bold">Intensity</dt>
                <dd className="text-sm font-extrabold text-lime-400 mt-1">{detail.intensity}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-slate-400 uppercase font-bold">Est. calories</dt>
                <dd className="text-sm font-extrabold text-slate-200 mt-1">{detail.calories_burn_est > 0 ? `~${detail.calories_burn_est} kcal` : '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-slate-400 uppercase font-bold">Spots</dt>
                <dd className="text-sm font-extrabold text-slate-200 mt-1">{detail.is_full ? 'Full' : `${detail.spots_left} left`}</dd>
              </div>
            </dl>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
              <div className="flex items-center gap-3">
                {detail.trainer_avatar && <img src={detail.trainer_avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-700" />}
                <div>
                  <div className="text-xs text-slate-400">Coach</div>
                  <div className="text-sm font-bold text-slate-100">{detail.trainer_name ?? 'To be confirmed'}</div>
                </div>
              </div>
              <div className="sm:w-56">{renderAction(detail, () => setDetail(null))}</div>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!toCancel}
        title="Cancel this booking?"
        message={
          toCancel ? (
            <>
              Your spot in <strong>{toCancel.title}</strong> on {formatDate(toCancel.occurrence_date)} at {formatClock(toCancel.start_time)} will be released for someone else.
            </>
          ) : null
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep my spot"
        tone="danger"
        onConfirm={handleCancel}
        onClose={() => setToCancel(null)}
      />

      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" /> Times are shown in gym time (IST).
      </p>
    </div>
  );
};
