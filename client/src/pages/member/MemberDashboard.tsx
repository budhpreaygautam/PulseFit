import React, { useState } from 'react';
import { ArrowRight, CalendarCheck, Calendar, Dumbbell, Flame, MessageSquareText, Plus, QrCode, Timer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { api } from '../../api/client.js';
import { MyBooking, TrainerNoteCategory, User } from '../../types/index.js';
import { StatCard } from '../../components/common/StatCard.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { DigitalQrPassModal } from '../../components/qr/DigitalQrPassModal.js';
import { MembershipStatusBadge } from '../../components/member/MembershipStatusBadge.js';
import { BookingCard, CancelBookingDialog } from '../../components/member/BookingCard.js';
import { FloorClockCard } from '../../components/member/FloorClockCard.js';
import { ProgressSection } from '../../components/member/ProgressSection.js';
import { useApiResource } from '../../components/member/useApiResource.js';
import { formatDate, formatDateTime, gymToday, TIER_LABELS } from '../../lib/format.js';

interface MemberDashboardProps {
  setCurrentTab: (tab: string) => void;
}

const DASHBOARD_BOOKINGS = 3;
const DASHBOARD_NOTES = 3;
const DASHBOARD_CHECKINS = 5;
const EXPIRY_WARNING_DAYS = 7;

const NOTE_LABELS: Record<TrainerNoteCategory, string> = { assessment: 'Assessment', progress: 'Progress', injury: 'Injury', general: 'General' };
const METHOD_LABELS: Record<string, string> = { qr: 'QR scan', manual: 'Front desk', kiosk: 'Kiosk', camera: 'Camera' };

function daysUntil(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${gymToday()}T00:00:00Z`)) / 86_400_000);
}

/** What the member should know (and do) about their membership, or null when all is well. */
function membershipNotice(user: User): { tone: 'warn' | 'info'; text: string; action: string; tab: string; params?: Record<string, string> } | null {
  switch (user.membership_status) {
    case 'pending':
      return { tone: 'info', text: 'You do not have an active plan yet. Choose one to book classes and use the gym floor.', action: 'Choose a plan', tab: 'pricing' };
    case 'expired':
      return {
        tone: 'warn',
        text: user.membership_expiry ? `Your membership expired on ${formatDate(user.membership_expiry)}. Renew to book classes and check in.` : 'Your membership has expired. Renew to book classes and check in.',
        action: 'Renew membership',
        tab: 'pricing'
      };
    case 'frozen':
      return {
        tone: 'info',
        text: `Your membership is frozen${user.frozen_since ? ` since ${formatDate(user.frozen_since)}` : ''}. When you unfreeze, the days the gym was open while you were frozen are added to your end date.`,
        action: 'Manage membership',
        tab: 'profile',
        params: { tab: 'membership' }
      };
    case 'active': {
      if (!user.membership_expiry) return null;
      const days = daysUntil(user.membership_expiry);
      if (days > EXPIRY_WARNING_DAYS) return null;
      return {
        tone: 'warn',
        text: days <= 0 ? 'Your membership ends today.' : `Your membership ends in ${days} day${days === 1 ? '' : 's'}, on ${formatDate(user.membership_expiry)}.`,
        action: 'Renew membership',
        tab: 'pricing'
      };
    }
    default:
      return null;
  }
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({ setCurrentTab }) => {
  const { user, refreshUser } = useAuth();
  const { navigate } = useNavigation();
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [toCancel, setToCancel] = useState<MyBooking | null>(null);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const bookings = useApiResource(() => api.getMyBookings('upcoming'));
  const timeStats = useApiResource(() => api.getMyTimeTrackingStats());
  const analytics = useApiResource(() => api.getWorkoutAnalytics());
  const notes = useApiResource(() => api.getMyNotes());
  const attendance = useApiResource(() => api.getMyAttendance());
  const plans = useApiResource(() => api.getPlans());

  if (!user) return null;

  const notice = membershipNotice(user);
  const visibleNotes = notes.data ? (showAllNotes ? notes.data : notes.data.slice(0, DASHBOARD_NOTES)) : [];

  const onSessionChange = () => {
    refreshUser();
    analytics.reload();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">
      <section className="neu-flat rounded-3xl p-5 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`}
            alt=""
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-slate-800 border-2 border-lime-500/50 shrink-0"
          />
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit'] break-words">Hi, {user.name.split(' ')[0]}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-300">{TIER_LABELS[user.membership_tier] ?? user.membership_tier}</span>
              <MembershipStatusBadge status={user.membership_status} />
            </div>
            <p className="text-xs text-slate-400">
              {user.membership_expiry ? (
                <>
                  {user.membership_status === 'expired' ? 'Ended' : 'Valid through'} <strong className="text-slate-200">{formatDate(user.membership_expiry)}</strong>
                </>
              ) : (
                'No paid period yet'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => setIsQrModalOpen(true)} className="neu-btn px-5 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
            <QrCode className="w-4 h-4" aria-hidden="true" /> Check-in pass
          </button>
          <button type="button" onClick={() => setCurrentTab('workout-logger')} className="neu-btn-lime px-5 py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" /> Log a workout
          </button>
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center gap-3 text-sm ${
            notice.tone === 'warn'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
              : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200'
          }`}
        >
          <p className="flex-1">{notice.text}</p>
          <button type="button" onClick={() => navigate(notice.tab, notice.params)} className="neu-btn-lime px-4 py-2 rounded-xl text-xs font-extrabold self-start sm:self-auto">
            {notice.action}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          title="Day streak"
          value={user.streak_days ?? 0}
          subtitle="Visits, classes or workouts on consecutive days"
          icon={<Flame className="w-5 h-5" aria-hidden="true" />}
          className="p-4 sm:p-6"
        />
        <StatCard
          title="Upcoming classes"
          value={bookings.data ? bookings.data.length : '—'}
          subtitle="Booked and not started"
          icon={<Calendar className="w-5 h-5" aria-hidden="true" />}
          accentColor="cyan"
          className="p-4 sm:p-6"
        />
        <StatCard
          title="Workouts logged"
          value={analytics.data ? analytics.data.totalWorkouts : '—'}
          subtitle="All time"
          icon={<Dumbbell className="w-5 h-5" aria-hidden="true" />}
          accentColor="amber"
          className="p-4 sm:p-6"
        />
        <StatCard
          title="Floor time"
          value={timeStats.data ? `${(Math.round((timeStats.data.totalTimeMinutesThisWeek / 60) * 10) / 10).toLocaleString('en-IN')} h` : '—'}
          subtitle="This week"
          icon={<Timer className="w-5 h-5" aria-hidden="true" />}
          className="p-4 sm:p-6"
        />
      </div>

      <FloorClockCard
        user={user}
        stats={timeStats}
        plans={plans.data}
        onSessionChange={onSessionChange}
        onOpenPricing={() => setCurrentTab('pricing')}
        onOpenProfile={() => navigate('profile', { tab: 'membership' })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section aria-labelledby="upcoming-heading" className="lg:col-span-7 neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 id="upcoming-heading" className="text-lg font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Upcoming classes
            </h2>
            <button type="button" onClick={() => setCurrentTab('my-bookings')} className="text-xs font-bold text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-1">
              All my bookings <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          {!bookings.data && bookings.error ? (
            <ErrorState message={bookings.error} onRetry={bookings.reload} />
          ) : !bookings.data ? (
            <LoadingState label="Loading your bookings…" className="py-8" />
          ) : bookings.data.length === 0 ? (
            <EmptyState
              title="No upcoming classes"
              body="Book a spot in a coach-led class from the timetable."
              action={
                <button type="button" onClick={() => setCurrentTab('schedule')} className="neu-btn-lime px-4 py-2 rounded-xl text-xs font-extrabold">
                  Open the timetable
                </button>
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {bookings.data.slice(0, DASHBOARD_BOOKINGS).map(b => (
                  <BookingCard key={b.id} booking={b} onCancel={setToCancel} compact />
                ))}
              </ul>
              {bookings.data.length > DASHBOARD_BOOKINGS && (
                <button type="button" onClick={() => setCurrentTab('my-bookings')} className="neu-btn w-full py-2.5 rounded-xl text-xs font-bold">
                  See all {bookings.data.length} upcoming classes
                </button>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="notes-heading" className="lg:col-span-5 neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
          <h2 id="notes-heading" className="text-lg font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
            <MessageSquareText className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> Notes from your coaches
          </h2>
          {!notes.data && notes.error ? (
            <ErrorState message={notes.error} onRetry={notes.reload} />
          ) : !notes.data ? (
            <LoadingState label="Loading notes…" className="py-8" />
          ) : notes.data.length === 0 ? (
            <EmptyState title="No notes yet" body="When a coach shares a note about your training, it shows up here." />
          ) : (
            <>
              <ul id="coach-notes-list" className="space-y-3">
                {visibleNotes.map(n => (
                  <li key={n.id} className="neu-pressed-sm rounded-2xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                      <span className="font-bold text-slate-200">
                        {n.trainer_name} · <span className="text-slate-400 font-semibold">{NOTE_LABELS[n.category] ?? n.category}</span>
                      </span>
                      <span className="text-slate-500">{formatDateTime(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-line break-words">{n.note}</p>
                  </li>
                ))}
              </ul>
              {notes.data.length > DASHBOARD_NOTES && (
                <button
                  type="button"
                  aria-expanded={showAllNotes}
                  aria-controls="coach-notes-list"
                  onClick={() => setShowAllNotes(v => !v)}
                  className="neu-btn w-full py-2.5 rounded-xl text-xs font-bold"
                >
                  {showAllNotes ? 'Show fewer notes' : `Show all ${notes.data.length} notes`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <ProgressSection analytics={analytics} onLogWorkout={() => setCurrentTab('workout-logger')} />

      <section aria-labelledby="checkins-heading" className="neu-flat rounded-3xl p-5 sm:p-6 space-y-4">
        <h2 id="checkins-heading" className="text-lg font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-lime-700 dark:text-lime-400" aria-hidden="true" /> My recent check-ins
        </h2>
        {!attendance.data && attendance.error ? (
          <ErrorState message={attendance.error} onRetry={attendance.reload} />
        ) : !attendance.data ? (
          <LoadingState label="Loading check-ins…" className="py-8" />
        ) : attendance.data.length === 0 ? (
          <EmptyState title="No check-ins yet" body="Show your check-in pass at the front desk and your visits will be listed here." />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {attendance.data.slice(0, DASHBOARD_CHECKINS).map(a => (
              <li key={a.id} className="neu-pressed-sm rounded-xl p-3">
                <p className="text-sm font-bold text-slate-200">{formatDateTime(a.check_in_time)}</p>
                <p className="text-[11px] text-slate-500">{METHOD_LABELS[a.check_in_method] ?? a.check_in_method}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CancelBookingDialog booking={toCancel} onClose={() => setToCancel(null)} onChanged={bookings.reload} />
      <DigitalQrPassModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} user={user} />
    </div>
  );
};
