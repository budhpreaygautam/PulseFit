import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api/client.js';
import { MembershipTier } from '../types/index.js';

const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout. Please check your connection.'));
    document.body.appendChild(script);
  });
}

export interface CheckoutParams {
  amount: number; // in INR (main unit)
  tier: MembershipTier;
  planName: string;
  billingCycle: 'monthly' | 'annual';
  onSuccess?: () => void;
}

/**
 * useRazorpay — opens the Razorpay checkout modal for a membership purchase.
 * Handles: dynamic script load -> server order creation -> checkout modal ->
 * HMAC verification on the server -> membership upgrade + fresh token.
 */
export const useRazorpay = () => {
  const { user, refreshUser, triggerCelebration } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = useCallback(async ({ amount, tier, planName, billingCycle, onSuccess }: CheckoutParams) => {
    if (!user) {
      setError('Please sign in before purchasing a membership.');
      return;
    }

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
    if (!keyId) {
      setError('Razorpay is not configured. Add VITE_RAZORPAY_KEY_ID to client/.env.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await loadRazorpayScript();

      // Step 1: Create an order on the server so the amount/currency are set server-side.
      const order = await api.createPaymentOrder({
        amount,
        notes: { tier, billingCycle, planName },
      });

      // Step 2: Open the Razorpay checkout modal.
      const checkoutModal = new window.Razorpay!({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'PulseFit Gym',
        description: `${planName} — ${tier.toUpperCase()} Membership (${billingCycle})`,
        order_id: order.id,
        prefill: {
          name: user.name,
          email: user.email,
          contact: user.phone || '',
        },
        theme: { color: '#84cc16' },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
        handler: async (response) => {
          try {
            // Step 3: Server verifies the HMAC signature and activates the membership.
            const result = await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              tier,
              billing_cycle: billingCycle,
            });

            // Refresh the stored token (contains updated membership_tier) and user profile.
            localStorage.setItem('pulsefit_token', result.token);
            await refreshUser();
            triggerCelebration();
            onSuccess?.();
          } catch (err: any) {
            console.error('Payment verification failed:', err);
            setError(err.message || 'Payment could not be verified. Please contact support.');
          } finally {
            setIsProcessing(false);
          }
        },
      });

      checkoutModal.on('payment.failed', (resp: any) => {
        console.error('Payment failed:', resp?.error?.description);
        setError(resp?.error?.description || 'Payment failed. Please try again.');
        setIsProcessing(false);
      });

      checkoutModal.open();
    } catch (err: any) {
      console.error('Razorpay checkout error:', err);
      setError(err.message || 'Could not start the payment. Please try again.');
      setIsProcessing(false);
    }
  }, [user, refreshUser, triggerCelebration]);

  return { checkout, isProcessing, error, clearError: () => setError(null) };
};