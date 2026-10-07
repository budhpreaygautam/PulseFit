import React from 'react';
import { Clock, MapPin, User as UserIcon, X } from 'lucide-react';
import { BookingStatus, MyBooking } from '../../types/index.js';
import { api, isApiError } from '../../api/client.js';
import { formatDate, formatTime } from '../../lib/format.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';
import { useToast } from '../../context/ToastContext.js';

const STATUS_CHIP: Record<BookingStatus, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-lime-500/10 border-lime-500/40 text-lime-700 dark:text-lime-400' },
  attended: { label: 'Attended', className: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-700 dark:text-cyan-300' },
  no_show: { label: 'Missed', className: 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-500/10 border-slate-500/40 text-slate-600 dark:text-slate-400' }
};

export const BookingStatusChip: React.FC<{ status: BookingStatus }> = ({ status }) => {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.confirmed;
  return <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${chip.className}`}>{chip.label}</span>;
};

interface BookingCardProps {
  booking: MyBooking;
  onCancel?: (booking: MyBooking) => void;
  compact?: boolean;
}

export const BookingCard: React.FC<BookingCardProps> = ({ booking, onCancel, compact = false }) => (
  <li className="neu-flat p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
    <div className="w-full sm:w-24 shrink-0 neu-pressed-sm rounded-xl px-3 py-2 flex sm:flex-col items-center sm:justify-center gap-2 sm:gap-0 text-center">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {formatDate(booking.booking_date, { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
      <span className="text-sm font-black text-lime-700 dark:text-lime-400 font-mono">{formatTime(booking.starts_at)}</span>
    </div>

    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-extrabold text-sm text-slate-100 font-['Outfit'] break-words">{booking.class_title || 'Class'}</h3>
        <BookingStatusChip status={booking.status} />
      </div>
      <p className="text-xs text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
        {booking.category && <span>{booking.category}</span>}
        {booking.trainer_name && (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="w-3 h-3" aria-hidden="true" /> {booking.trainer_name}
          </span>
        )}
        {!compact && booking.room && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" aria-hidden="true" /> {booking.room}
          </span>
        )}
        {!compact && booking.duration_minutes ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" /> {booking.duration_minutes} min
          </span>
        ) : null}
      </p>
    </div>

    {onCancel && booking.can_cancel && (
      <button
        type="button"
        onClick={() => onCancel(booking)}
        className="neu-btn px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-300 inline-flex items-center justify-center gap-1.5 shrink-0"
        aria-label={`Cancel booking for ${booking.class_title || 'class'} on ${formatDate(booking.booking_date)}`}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" /> Cancel
      </button>
    )}
  </li>
);

interface CancelBookingDialogProps {
  booking: MyBooking | null;
  onClose: () => void;
  /** Called after the booking was cancelled, or turned out to be no longer cancellable. */
  onChanged: () => void;
}

export const CancelBookingDialog: React.FC<CancelBookingDialogProps> = ({ booking, onClose, onChanged }) => {
  const { showToast } = useToast();

  const cancel = async () => {
    if (!booking) return;
    try {
      await api.cancelBooking(booking.id);
      showToast(`Your spot in ${booking.class_title || 'the class'} was released.`, 'success', 'Booking cancelled');
    } catch (err) {
      if (isApiError(err) && err.code === 'ALREADY_CANCELLED') {
        showToast('This booking was already cancelled.', 'info');
      } else if (isApiError(err) && err.code === 'CLASS_STARTED') {
        showToast('This class has already started, so the booking can no longer be cancelled.', 'warning');
      } else {
        showToast(isApiError(err) ? err.message : 'The booking could not be cancelled. Please try again.', 'error');
        return;
      }
    }
    onChanged();
  };

  return (
    <ConfirmDialog
      isOpen={booking !== null}
      title="Cancel this booking?"
      message={
        booking ? (
          <>
            You will give up your spot in <strong className="text-slate-100">{booking.class_title || 'this class'}</strong> on{' '}
            {formatDate(booking.booking_date)} at {formatTime(booking.starts_at)}. Someone else can then book it.
          </>
        ) : null
      }
      confirmLabel="Cancel booking"
      cancelLabel="Keep my spot"
      tone="danger"
      onConfirm={cancel}
      onClose={onClose}
    />
  );
};
