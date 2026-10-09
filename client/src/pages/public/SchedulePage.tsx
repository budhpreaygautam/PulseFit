import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Filter, Flame, Info, Loader2, Moon, Search, Sparkles, Users } from 'lucide-react';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { useApiData } from '../../components/public/useApiData.js';
import { cheapestPlanFor, planCovers } from '../../components/public/plans.js';
import { CATEGORIES, HOURS_DAYS, HOURS_TIME, mondayOf, weekdayOf } from '../../components/public/gymInfo.js';
import { useAuth } from '../../context/AuthContext.js';
import { useAppConfig } from '../../context/ConfigContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, errorMessage, isApiError } from '../../api/client.js';
import { addDays, DAY_NAMES, formatClock, formatDate, formatINR, gymToday, STATUS_LABELS } from '../../lib/format.js';
import { ClassOccurrence, MembershipPlan } from '../../types/index.js';

interface SchedulePageProps {
  onOpenAuthModal: (mode: 'login' | 'register') => void;
}

const BOOKING_WINDOW_DAYS = 14;
const INTENSITY_ORDER = ['Low', 'Medium', 'High', 'Extreme'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** First day ('YYYY-MM-01') of the month a date is in. */
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
/** First day of the month n months after the given first day. */
const addMonths = (first: string, n: number) => {
  const [y, m] = first.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const lastDayOfMonth = (first: string) => addDays(addMonths(first, 1), -1);
/**
 * The calendar shows this month and next. Classes repeat every week, so dates beyond the booking
 * window show the timetable with booking not open yet.
 */
const lastViewableDate = (today: string) => lastDayOfMonth(addMonths(monthOf(today), 1));

interface CardIssue {
  message: string;
  action?: { label: string; tab: string; params?: Record<string, string> };
}

const occurrenceKey = (c: ClassOccurrence) => `${c.id}:${c.occurrence_date}`;

/**
 * The date to open on, from ?week= (a Monday) and ?day= (0 = Sunday), kept between today and the last
 * date the calendar shows. Without them: today, or Monday when today is a Sunday (the gym is closed).
 */
function initialDate(params: URLSearchParams): string {
  const today = gymToday();
  const requestedWeek = params.get('week');
  const requestedDay = params.get('day');

  let weekStart = mondayOf(today);
  let dayIndex = (weekdayOf(today) + 6) % 7;
  if (weekdayOf(today) === 0) {
    weekStart = addDays(weekStart, 7);
    dayIndex = 0;
  }
  if (requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) && mondayOf(requestedWeek) === requestedWeek) {
    if (requestedWeek !== weekStart) dayIndex = 0;
    weekStart = requestedWeek;
  }
  if (requestedDay !== null && /^[0-6]$/.test(requestedDay)) dayIndex = (Number(requestedDay) + 6) % 7;
  const date = addDays(weekStart, dayIndex);
  const last = lastViewableDate(today);
  return date < today ? today : date > last ? last : date;
}

function categoryFrom(params: URLSearchParams): string {
  const requested = params.get('category');
  return requested && (CATEGORIES as string[]).includes(requested) ? requested : 'All';
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ onOpenAuthModal }) => {
  const { params, navigate } = useNavigation();
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState(() => initialDate(params));
  // The month on show; it can differ from the selected date's month while browsing.
  const [month, setMonth] = useState(() => monthOf(initialDate(params)));
  const [trainerId, setTrainerId] = useState(() => params.get('trainer') ?? '');
  const [category, setCategory] = useState(() => categoryFrom(params));
  const [intensity, setIntensity] = useState('All');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ClassOccurrence | null>(null);
  const [toCancel, setToCancel] = useState<ClassOccurrence | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, CardIssue>>({});
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  // Bookings made here whose timetable refresh has not arrived yet (occurrence key -> booking id).
  const [justBooked, setJustBooked] = useState<Record<string, string>>({});

  // A new navigation to the timetable (e.g. "View classes" on a coach) re-reads the query string.
  useEffect(() => {
    const date = initialDate(params);
    setSelectedDate(date);
    setMonth(monthOf(date));
    setTrainerId(params.get('trainer') ?? '');
    setCategory(categoryFrom(params));
  }, [params]);

  const today = gymToday();
  const lastBookable = addDays(today, BOOKING_WINDOW_DAYS);
  const lastViewable = lastViewableDate(today);
  // The API lists one week at a time: the week of the selected date.
  const weekStart = mondayOf(selectedDate);

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

  /** A class as it is after a booking just made here, until the refreshed timetable arrives. */
  const withJustBooked = (c: ClassOccurrence): ClassOccurrence => {
    const bookingId = justBooked[occurrenceKey(c)];
    if (!bookingId || c.my_booking_id) return c;
    const booked = c.booked_count + 1;
    return { ...c, my_booking_id: bookingId, booked_count: booked, spots_left: Math.max(0, c.capacity - booked), is_full: booked >= c.capacity };
  };

  // Members see straight away which classes their plan does not cover.
  useEffect(() => {
    if (user?.role === 'member') loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);
  const memberPlan = user?.role === 'member' ? plans?.find(p => p.tier === user.membership_tier) : undefined;

  // Classes repeat every week, so the loaded week gives each weekday's count for the whole month.
  const scheduledByWeekday = new Map<number, number>();
  const shownByWeekday = new Map<number, number>();
  for (const c of classes) {
    const wd = weekdayOf(c.occurrence_date);
    scheduledByWeekday.set(wd, (scheduledByWeekday.get(wd) ?? 0) + 1);
    if (matchesFilters(c)) shownByWeekday.set(wd, (shownByWeekday.get(wd) ?? 0) + 1);
  }
  // A closed day (Sunday) shows as closed only when nothing is scheduled on it: classes the
  // timetable lists are always shown, so they can be seen, booked and cancelled here. With a coach
  // filter the API lists only that coach's classes, so an empty day is just an empty filter result.
  const isClosedDate = (date: string) =>
    config.gym.hours.closedWeekdays.includes(weekdayOf(date)) &&
    trainerId === '' &&
    classesState.data !== null &&
    (scheduledByWeekday.get(weekdayOf(date)) ?? 0) === 0;
  const countOn = (date: string) => shownByWeekday.get(weekdayOf(date)) ?? 0;
  const isViewable = (date: string) => date >= today && date <= lastViewable;

  const selectedIsClosed = isClosedDate(selectedDate);
  const dayClasses = classes.filter(c => c.occurrence_date === selectedDate && matchesFilters(c)).map(withJustBooked);
  const filtersActive = category !== 'All' || intensity !== 'All' || search.trim() !== '' || trainerId !== '';

  const selectDate = (date: string) => {
    const clamped = date < today ? today : date > lastViewable ? lastViewable : date;
    if (mondayOf(clamped) !== weekStart) setIssues({});
    setSelectedDate(clamped);
    setMonth(monthOf(clamped));
    return clamped;
  };

  /** The first date of a month worth opening: viewable, and an open day when there is one. */
  const firstDateIn = (first: string) => {
    const end = lastDayOfMonth(first) < lastViewable ? lastDayOfMonth(first) : lastViewable;
    let fallback: string | null = null;
    for (let d = first < today ? today : first; d <= end; d = addDays(d, 1)) {
      if (!config.gym.hours.closedWeekdays.includes(weekdayOf(d))) return d;
      fallback = fallback ?? d;
    }
    return fallback;
  };

  const changeMonth = (delta: number) => {
    const next = addMonths(month, delta);
    const date = firstDateIn(next);
    if (date) selectDate(date);
    else setMonth(next);
  };

  // Calendar weeks (Monday first) covering the month on show.
  const calendarWeeks: string[][] = [];
  for (let d = mondayOf(month); d <= lastDayOfMonth(month); d = addDays(d, 7)) {
    calendarWeeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  // One Tab stop in the grid (roving tabindex): the selected day, or the first one worth opening.
  const focusDate = monthOf(selectedDate) === month ? selectedDate : firstDateIn(month);

  // Grid keyboard: arrows move a day or a week, Home/End go to the week's ends, Page Up/Down change month.
  const onDayKeyDown = (e: React.KeyboardEvent, date: string) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    let next: string;
    if (e.key in steps) next = addDays(date, steps[e.key]);
    else if (e.key === 'Home') next = mondayOf(date);
    else if (e.key === 'End') next = addDays(mondayOf(date), 6);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const first = addMonths(monthOf(date), e.key === 'PageUp' ? -1 : 1);
      const day = Math.min(Number(date.slice(8, 10)), Number(lastDayOfMonth(first).slice(8, 10)));
      next = `${first.slice(0, 8)}${String(day).padStart(2, '0')}`;
    } else return;
    e.preventDefault();
    const target = selectDate(next);
    requestAnimationFrame(() => document.getElementById(`day-${target}`)?.focus());
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
      case 'MEMBERSHIP_ENDS_BEFORE_CLASS': {
        const expiry = isApiError(err) ? (err.data as { membership_expiry?: string } | undefined)?.membership_expiry : undefined;
        const tier = user?.membership_tier;
        return {
          message: expiry
            ? `Your membership ends on ${formatDate(expiry)}, before this class on ${formatDate(c.occurrence_date)}. Renew your plan to book it.`
            : errorMessage(err),
          action: { label: 'Renew my plan', tab: 'pricing', params: tier && tier !== 'none' ? { plan: tier } : undefined }
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
    const key = occurrenceKey(c);
    setIssue(c, null);
    setBusyKey(key);
    try {
      // occurrence_date comes from the server, which works in gym time; never derive it here.
      const booking = await api.createBooking({ class_id: c.id, booking_date: c.occurrence_date });
      // Show it as booked right away; the refresh below brings the server's own numbers.
      setJustBooked(prev => ({ ...prev, [key]: booking.id }));
      showToast(`${c.title}, ${formatDate(c.occurrence_date)} at ${formatClock(c.start_time)}.`, 'success', 'Class booked');
    } catch (err) {
      setIssue(c, await explainBookingError(c, err));
    } finally {
      setBusyKey(null);
      await classesState.reload();
      setJustBooked(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleCancel = async () => {
    const c = toCancel;
    if (!c?.my_booking_id) return;
    try {
      await api.cancelBooking(c.my_booking_id);
      setIssue(c, null);
      // Keep the dialog busy until the card shows the spot as free again.
      await classesState.reload();
      showToast(`Your booking for ${c.title} on ${formatDate(c.occurrence_date)} is cancelled.`, 'info', 'Booking cancelled');
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

    // A plan that does not cover the category can never book it: say so instead of offering the button.
    if (!started && memberPlan && plans && !planCovers(memberPlan, c.category)) {
      const cover = cheapestPlanFor(plans, c.category, memberPlan);
      const noteId = `plan-note-${c.id}-${c.occurrence_date}`;
      return (
        <div className="space-y-2">
          <button type="button" disabled aria-describedby={noteId} className="w-full py-3 rounded-xl text-xs font-bold neu-pressed-sm text-slate-400 cursor-not-allowed">
            Not in your plan<span className="sr-only">: {c.title}</span>
          </button>
          <p id={noteId} className="text-[11px] text-slate-400 text-center">
            Your {memberPlan.name} doesn't include {c.category} classes.{' '}
            <button
              type="button"
              onClick={() => {
                onDone?.();
                navigate('pricing', cover ? { plan: cover.tier } : undefined);
              }}
              className="font-bold text-lime-400 hover:underline"
            >
              {cover ? `Upgrade to the ${cover.name}` : 'See plans'}
            </button>
          </p>
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
        <div className="glass-tint p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-slate-200">
          <p className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            {membershipNotice.text}
          </p>
          <button type="button" onClick={() => navigate(membershipNotice.tab)} className="neu-btn px-4 py-2 rounded-xl text-xs font-bold text-slate-200 shrink-0">
            {membershipNotice.label}
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        {/* A compact month calendar: beside the classes on large screens (and stays in view), on top on phones. */}
        <section className="neu-flat rounded-3xl p-4 space-y-3 w-full max-w-sm mx-auto lg:max-w-none lg:sticky lg:top-28" aria-labelledby="calendar-month">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              disabled={month <= monthOf(today)}
              className="neu-icon-btn w-8 h-8 shrink-0 disabled:opacity-40"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <h2 id="calendar-month" className="text-base font-black text-slate-100 font-['Outfit'] truncate" aria-live="polite">
              {formatDate(month, { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1.5 shrink-0">
              {(selectedDate !== today || month !== monthOf(today)) && (
                <button type="button" onClick={() => selectDate(firstDateIn(monthOf(today)) ?? today)} className="neu-btn px-2.5 py-1 rounded-lg text-[11px] font-bold">
                  Today
                </button>
              )}
              <button
                type="button"
                onClick={() => changeMonth(1)}
                disabled={addMonths(month, 1) > lastViewable}
                className="neu-icon-btn w-8 h-8 disabled:opacity-40"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div role="grid" aria-labelledby="calendar-month" className="space-y-1">
            <div role="row" className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map(label => (
                <div key={label} role="columnheader" aria-label={label} className="text-center text-[10px] font-bold uppercase text-slate-400 py-1">
                  {label.slice(0, 2)}
                </div>
              ))}
            </div>
            {calendarWeeks.map(week => (
              <div key={week[0]} role="row" className="grid grid-cols-7 gap-1">
                {week.map(date => {
                  if (monthOf(date) !== month) return <div key={date} role="gridcell" aria-hidden="true" />;
                  const viewable = isViewable(date);
                  const isSelected = date === selectedDate;
                  const isToday = date === today;
                  const closed = viewable && isClosedDate(date);
                  const count = countOn(date);
                  const notOpenYet = date > lastBookable;
                  const longDate = formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
                  const summary = !viewable
                    ? date < today ? 'past' : 'not shown yet'
                    : closed ? 'closed' : !classesState.data ? 'loading' : `${count} ${count === 1 ? 'class' : 'classes'}`;
                  return (
                    <div key={date} role="gridcell" aria-selected={isSelected}>
                      <button
                        type="button"
                        id={`day-${date}`}
                        disabled={!viewable}
                        tabIndex={date === focusDate ? 0 : -1}
                        aria-current={isToday ? 'date' : undefined}
                        aria-controls="day-panel"
                        aria-label={`${longDate}${isToday ? ', today' : ''}: ${summary}${viewable && notOpenYet && !closed ? `, booking opens ${formatDate(addDays(date, -BOOKING_WINDOW_DAYS), { day: 'numeric', month: 'short' })}` : ''}`}
                        onClick={() => selectDate(date)}
                        onKeyDown={e => onDayKeyDown(e, date)}
                        className={`relative w-full aspect-square max-h-11 mx-auto rounded-xl flex flex-col items-center justify-center gap-0.5 ${
                          isSelected ? 'neu-pressed-sm border border-lime-500/60' : viewable ? 'neu-btn' : 'opacity-35 cursor-not-allowed'
                        }`}
                      >
                        <span
                          className={`text-[13px] font-extrabold leading-none ${
                            isSelected ? 'text-lime-700 dark:text-lime-400' : closed ? 'text-slate-500' : 'text-slate-100'
                          }`}
                        >
                          {Number(date.slice(8, 10))}
                        </span>
                        {/* A dot per class, up to three; grey while booking has not opened yet. */}
                        <span className="flex gap-0.5 h-1" aria-hidden="true">
                          {viewable &&
                            !closed &&
                            Array.from({ length: Math.min(count, 3) }, (_, i) => (
                              <span key={i} className={`w-1 h-1 rounded-full ${notOpenYet ? 'bg-slate-500' : 'bg-lime-500'}`} />
                            ))}
                        </span>
                        {isToday && !isSelected && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-lime-500" aria-hidden="true" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400" aria-label="Calendar key">
            <li className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-500" aria-hidden="true" /> Classes you can book
            </li>
            <li className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" aria-hidden="true" /> Booking opens {BOOKING_WINDOW_DAYS} days before
            </li>
            <li>Grey date: closed</li>
          </ul>
        </section>

        <div className="space-y-6 min-w-0">

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 neu-flat p-4 rounded-2xl border border-slate-800/80">
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
              <button type="button" onClick={clearFilters} className="neu-btn px-3 py-1.5 rounded-xl text-xs font-bold">
                Clear filters
              </button>
            )}
          </div>
        </div>

        <section id="day-panel" aria-labelledby="day-heading" className="space-y-4">
          <h2 id="day-heading" className="text-lg sm:text-xl font-black text-slate-100 font-['Outfit']">
            {formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
            {selectedDate === today && <span className="ml-2 text-xs font-bold text-lime-700 dark:text-lime-400 align-middle">Today</span>}
          </h2>
          {classesState.isLoading && !classesState.data ? (
            <LoadingState label="Loading the timetable…" />
          ) : classesState.error ? (
            <ErrorState message={classesState.error} onRetry={classesState.reload} />
          ) : selectedIsClosed ? (
            <div className="neu-flat p-10 sm:p-14 rounded-3xl text-center border border-slate-800/80 space-y-4 max-w-2xl mx-auto">
              <Moon className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" aria-hidden="true" />
              <h2 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit']">Closed on {DAY_NAMES[weekdayOf(selectedDate)]}s</h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                The gym is open {HOURS_DAYS}, {HOURS_TIME}. There are no classes on this day.
              </p>
              {weekdayOf(selectedDate) === 0 && addDays(selectedDate, 1) <= lastViewable && (
                <button type="button" onClick={() => selectDate(addDays(selectedDate, 1))} className="px-6 py-3 neu-btn-lime font-extrabold text-xs rounded-xl">
                  See Monday's classes
                </button>
              )}
            </div>
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
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          <span className="px-2 py-0.5 rounded-md glass-dark text-[10px] font-bold uppercase tracking-wider text-zinc-100">{c.intensity}</span>
                          <span className="px-2 py-0.5 rounded-md glass-dark text-[10px] font-bold uppercase tracking-wider text-zinc-100">{c.category}</span>
                        </div>
                        <span className="absolute top-3 right-3 font-mono text-xs font-black bg-black/55 backdrop-blur-md px-2.5 py-1 rounded-lg text-lime-300 border border-lime-400/30">
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
                        <div role="alert" className="glass-tint p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-slate-200 space-y-2">
                          <p>{issue.message}</p>
                          {issue.action && (
                            <button type="button" onClick={() => navigate(issue.action!.tab, issue.action!.params)} className="neu-btn px-3 py-1.5 rounded-xl text-xs font-bold">
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
        </section>
        </div>
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
              <div className="sm:w-56">{renderAction(withJustBooked(detail), () => setDetail(null))}</div>
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
