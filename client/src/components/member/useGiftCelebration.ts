import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { isAppMode } from '../../lib/appMode.js';
import { storage } from '../../lib/storage.js';
import { GiftClaim } from '../../types/index.js';

/**
 * Confetti once for a milestone or joining gift earned since the member last saw one (on this
 * device): the server grants them during a check-in or a payment, while the member is elsewhere.
 * Without a mark yet, an open gift counts as new.
 */
export function useGiftCelebration(userId: string, claims: GiftClaim[] | null): void {
  const { triggerCelebration } = useAuth();
  const { showToast } = useToast();
  useEffect(() => {
    if (!claims) return;
    const earned = claims.filter(c => c.source !== 'store');
    if (earned.length === 0) return;
    const key = `pulsefit_gifts_seen:${userId}`;
    const seen = storage.get(key);
    const newest = earned.reduce((max, c) => (c.created_at > max ? c.created_at : max), earned[0].created_at);
    const isNew = seen ? newest > seen : earned.some(c => c.status === 'ready' || c.status === 'needs_size');
    if (isNew) {
      triggerCelebration();
      // App only: the milestone scene's toast. The website keeps confetti alone (it does not change).
      if (isAppMode) showToast('A gift is waiting for you in Rewards.', 'success', 'You earned a gift', 'milestone');
    }
    storage.set(key, newest);
  }, [userId, claims, triggerCelebration, showToast]);
}
