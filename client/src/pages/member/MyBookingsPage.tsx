import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../../api/client.js';
import { MyBooking } from '../../types/index.js';
import { useNavigation } from '../../context/NavigationContext.js';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States.js';
import { BookingCard, CancelBookingDialog } from '../../components/member/BookingCard.js';
import { useApiResource } from '../../components/member/useApiResource.js';

type Scope = 'upcoming' | 'past';

const TABS: { id: Scope; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' }
];

export const MyBookingsPage: React.FC = () => {
  const { params, navigate } = useNavigation();
  const [scope, setScope] = useState<Scope>(params.get('scope') === 'past' ? 'past' : 'upcoming');
  const [toCancel, setToCancel] = useState<MyBooking | null>(null);
  const bookings = useApiResource(() => api.getMyBookings(scope), [scope]);

  const selectTab = (next: Scope) => {
    setScope(next);
    navigate('my-bookings', next === 'past' ? { scope: 'past' } : undefined, { replace: true });
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = scope === 'upcoming' ? 'past' : 'upcoming';
    selectTab(next);
    document.getElementById(`bookings-tab-${next}`)?.focus();
  };

  const rows = bookings.data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100 font-['Outfit'] flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-lime-700 dark:text-lime-400" aria-hidden="true" /> My bookings
          </h1>
          <p className="text-sm text-slate-400 mt-1">Your class reservations. Times are gym time (IST).</p>
        </div>
        <button type="button" onClick={() => navigate('schedule')} className="neu-btn-lime px-5 py-2.5 rounded-xl text-xs font-extrabold self-start sm:self-auto">
          Book a class
        </button>
      </header>

      <div role="tablist" aria-label="Bookings" className="inline-flex gap-1 p-1.5 rounded-2xl neu-pressed-sm">
        {TABS.map(t => (
          <button
            key={t.id}
            id={`bookings-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={scope === t.id}
            aria-controls="bookings-panel"
            tabIndex={scope === t.id ? 0 : -1}
            onClick={() => selectTab(t.id)}
            onKeyDown={onTabKeyDown}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${scope === t.id ? 'neu-btn-lime' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section id="bookings-panel" role="tabpanel" aria-labelledby={`bookings-tab-${scope}`}>
        {bookings.error ? (
          <ErrorState message={bookings.error} onRetry={bookings.reload} />
        ) : !rows ? (
          <LoadingState label="Loading your bookings…" />
        ) : rows.length === 0 ? (
          scope === 'upcoming' ? (
            <EmptyState
              title="No upcoming classes"
              body="You have not booked a class that is still to come."
              action={
                <button type="button" onClick={() => navigate('schedule')} className="neu-btn-lime px-5 py-2.5 rounded-xl text-xs font-extrabold">
                  Open the timetable
                </button>
              }
            />
          ) : (
            <EmptyState title="No past classes yet" body="Classes you booked appear here once they have started." />
          )
        ) : (
          <ul className="space-y-3">
            {rows.map(b => (
              <BookingCard key={b.id} booking={b} onCancel={scope === 'upcoming' ? setToCancel : undefined} />
            ))}
          </ul>
        )}
      </section>

      <CancelBookingDialog booking={toCancel} onClose={() => setToCancel(null)} onChanged={bookings.reload} />
    </div>
  );
};
