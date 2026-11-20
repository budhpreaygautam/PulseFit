import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { api, isApiError } from '../../api/client.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';
import { formatDate } from '../../lib/format.js';

/** Asks before freezing or unfreezing the signed-in member's membership, then does it (profile page). */
export const FreezeDialog: React.FC<{ action: 'freeze' | 'unfreeze' | null; onClose: () => void }> = ({ action: confirm, onClose }) => {
  const { user, updateUser, refreshUser } = useAuth();
  const { showToast } = useToast();
  // Freezing cancels every upcoming class booking, so the dialog counts them first.
  // null while counting; 'unknown' when they could not be loaded.
  const [upcomingCount, setUpcomingCount] = useState<number | 'unknown' | null>(null);

  useEffect(() => {
    if (confirm !== 'freeze') return;
    let cancelled = false;
    setUpcomingCount(null);
    api
      .getMyBookings('upcoming')
      .then(list => !cancelled && setUpcomingCount(list.length))
      .catch(() => !cancelled && setUpcomingCount('unknown'));
    return () => {
      cancelled = true;
    };
  }, [confirm]);

  const run = async () => {
    try {
      // The server's message says what else changed (how many bookings were cancelled, how many days were added).
      if (confirm === 'freeze') {
        const { data: next, message } = await api.freezeMembership();
        updateUser(next);
        showToast(message || 'Your membership is frozen. Unfreeze it whenever you are ready to train again.', 'success');
      } else {
        const { data: next, message } = await api.unfreezeMembership();
        updateUser(next);
        showToast(message || `Welcome back. Your membership now runs until ${formatDate(next.membership_expiry)}.`, 'success');
      }
    } catch (err) {
      if (isApiError(err) && (err.code === 'NOT_ACTIVE' || err.code === 'NOT_FROZEN')) {
        showToast(err.message, 'warning');
        refreshUser();
      } else {
        showToast(isApiError(err) ? err.message : 'Your membership could not be changed.', 'error');
      }
    }
  };

  const bookingsLine =
    upcomingCount === null ? (
      'Checking your upcoming class bookings…'
    ) : upcomingCount === 'unknown' ? (
      <strong className="text-slate-100">All your upcoming class bookings will be cancelled.</strong>
    ) : upcomingCount === 0 ? (
      'You have no upcoming class bookings, so none will be cancelled.'
    ) : (
      <>
        <strong className="text-slate-100">
          Your {upcomingCount} upcoming class {upcomingCount === 1 ? 'booking' : 'bookings'} will be cancelled
        </strong>{' '}
        and the {upcomingCount === 1 ? 'spot goes' : 'spots go'} to other members. Unfreezing does not bring {upcomingCount === 1 ? 'it' : 'them'} back.
      </>
    );

  return (
    <ConfirmDialog
      isOpen={confirm !== null}
      title={confirm === 'freeze' ? 'Freeze your membership?' : 'Unfreeze your membership?'}
      message={
        confirm === 'freeze' ? (
          <div className="space-y-3">
            <p>From today you will not be able to check in, book classes or clock in on the gym floor until you unfreeze.</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li aria-live="polite">{bookingsLine}</li>
              <li>If you are clocked in on the gym floor, that session will be ended.</li>
              <li>
                When you unfreeze, the days the gym was open while you were frozen are added to your end date. The day you freeze, the day you come back and Sundays are not
                counted.
              </li>
            </ul>
          </div>
        ) : (
          <>
            Your membership becomes active again today. The days the gym was open while it was frozen{user?.frozen_since ? ` (since ${formatDate(user.frozen_since)})` : ''} are
            added to your end date; the day you froze, today and Sundays are not counted.
          </>
        )
      }
      confirmLabel={confirm === 'freeze' ? 'Freeze membership' : 'Unfreeze'}
      onConfirm={run}
      onClose={onClose}
    />
  );
};
