import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useAppConfig } from '../context/ConfigContext.js';
import { api, ApiError, errorMessage } from '../api/client.js';
import { GYM_EMAIL, GYM_PHONE_DISPLAY } from '../components/public/gymInfo.js';
import { BillingCycle, PaidTier, Payment, User } from '../types/index.js';

const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay checkout. Check your connection and try again.'));
    document.body.appendChild(script);
  });
}

export interface CheckoutParams {
  tier: PaidTier;
  billingCycle: BillingCycle;
  /** `message` is the server's own account of what the payment did (for example, class bookings a plan change cancelled). */
  onSuccess?: (result: { user: User; payment?: Payment; message?: string }) => void;
}

/**
 * Opens Razorpay Checkout for a membership. The server prices the order from the plan
 * catalogue and fixes the tier/cycle on its own order record; the browser only says which
 * plan was chosen. Verification activates the membership and returns a fresh session.
 */
export const useRazorpay = () => {
  const { user, setSession, updateUser, triggerCelebration } = useAuth();
  const { config } = useAppConfig();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = useCallback(
    async ({ tier, billingCycle, onSuccess }: CheckoutParams) => {
      if (!user) {
        setError('Please sign in before buying a membership.');
        return;
      }
      if (!config.payments.enabled) {
        setError('Online payments are not available right now. Please pay at the front desk.');
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        await loadRazorpayScript();
        const order = await api.createPaymentOrder({ tier, billing_cycle: billingCycle });

        const checkoutModal = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: config.gym.name,
          description: order.description,
          order_id: order.orderId,
          prefill: { name: user.name, email: user.email, contact: user.phone || '' },
          theme: { color: '#84cc16' },
          modal: { ondismiss: () => setIsProcessing(false) },
          handler: async response => {
            try {
              const result = await api.verifyPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              setSession({ token: result.token, user: result.user });
              triggerCelebration();
              onSuccess?.({ user: result.user, payment: result.payment, message: result.message || undefined });
            } catch (err) {
              const code = err instanceof ApiError ? err.code : undefined;
              const data = err instanceof ApiError ? (err.data as { user?: User; message?: string } | undefined) : undefined;
              const current = data?.user;
              const paymentRef = `payment id ${response.razorpay_payment_id}`;
              // The webhook may have activated the order first; that is still a success, and the
              // server still says what that activation did (for example, cancelled bookings).
              if (code === 'ALREADY_PROCESSED' && current) {
                updateUser(current);
                onSuccess?.({ user: current, message: data?.message || undefined });
              } else if (code === 'ORDER_REJECTED') {
                // Razorpay reported a wrong amount or currency for this order: it can never activate a membership.
                setError(
                  'This payment could not be applied: Razorpay reported a different amount or currency from this order, so nothing was activated on your membership. ' +
                    `If money was taken, contact the front desk at ${GYM_PHONE_DISPLAY} or ${GYM_EMAIL} with your ${paymentRef}. ` +
                    'Under our refund policy we then activate the plan you paid for or refund the money in full.'
                );
              } else if (code === 'ORDER_NOT_FOUND' || code === 'ORDER_NOT_YOURS') {
                // No webhook will activate this order for this account either.
                setError(`${errorMessage(err)} Nothing was activated. If money was taken, contact the front desk at ${GYM_PHONE_DISPLAY} or ${GYM_EMAIL} with your ${paymentRef}.`);
              } else {
                // A lost connection or an unconfirmed signature: Razorpay's webhook can still activate the order.
                setError(`${errorMessage(err)} If money was taken, your membership will be activated automatically or by the front desk.`);
              }
            } finally {
              setIsProcessing(false);
            }
          }
        });

        checkoutModal.on('payment.failed', (resp: any) => {
          setError(resp?.error?.description || 'The payment did not go through. You have not been charged.');
          setIsProcessing(false);
        });

        checkoutModal.open();
      } catch (err) {
        setError(errorMessage(err, 'Could not start the payment. Please try again.'));
        setIsProcessing(false);
      }
    },
    [user, config, setSession, updateUser, triggerCelebration]
  );

  return { checkout, isProcessing, error, clearError: () => setError(null), paymentsEnabled: config.payments.enabled };
};
