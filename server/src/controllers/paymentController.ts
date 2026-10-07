import crypto from 'crypto';
import { Response } from 'express';
import Razorpay from 'razorpay';
import config, { paymentsEnabled } from '../config.js';
import db from '../db/database.js';
import { ApiError } from '../lib/http.js';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { MembershipTier } from '../types/index.js';

let razorpayClient: Razorpay | null = null;

/** The Razorpay SDK client, created on first use so the API can start without payment keys. */
function getRazorpay(): Razorpay {
  if (!paymentsEnabled()) {
    throw new ApiError(503, 'Online payments are not configured on this server.', 'PAYMENTS_DISABLED');
  }
  razorpayClient ??= new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  return razorpayClient;
}

// Create a Razorpay order for a membership purchase.
// Amount is passed in INR (main unit) and converted to paise (smallest unit) server-side.
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, currency = 'INR', notes } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'A valid amount is required' });
    }

    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        ...(notes || {}),
        user_id: req.user?.id || '',
      },
    };

    const order = await getRazorpay().orders.create(options);

    res.json({
      success: true,
      data: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
    });
  } catch (err: any) {
    if (err instanceof ApiError) return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    console.error('Razorpay order creation error:', err);
    res.status(500).json({ success: false, error: err?.error?.description || err?.message || 'Order creation failed' });
  }
};

// Verify the HMAC signature returned by Razorpay, then activate the purchased membership tier.
export const verifyPayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tier,
      billing_cycle,
    } = req.body;

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Recompute the expected signature and compare with the one Razorpay sent back.
    const shasum = crypto.createHmac('sha256', config.razorpay.keySecret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (digest !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    // Payment is valid — upgrade the user's membership.
    const validTiers: MembershipTier[] = ['basic', 'pro', 'vip'];
    const newTier: MembershipTier = validTiers.includes(tier) ? tier : (req.user.membership_tier || 'pro');
    const months = billing_cycle === 'annual' ? 12 : 1;

    const newExpiry = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]; // YYYY-MM-DD, consistent with existing stored values

    const currentUser = db.users.find(u => u.id === req.user!.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    db.users = db.users.map(u => {
      if (u.id === req.user!.id) {
        return {
          ...u,
          membership_tier: newTier,
          membership_status: 'active',
          membership_expiry: newExpiry,
        };
      }
      return u;
    });

    const updatedUser = db.users.find(u => u.id === req.user!.id)!;
    const { password_hash, ...safeUser } = updatedUser;

    res.json({
      success: true,
      data: {
        message: 'Payment verified. Membership activated successfully.',
        membership: {
          tier: safeUser.membership_tier,
          status: safeUser.membership_status,
          expiry: safeUser.membership_expiry,
        },
        user: safeUser,
        token: generateToken(updatedUser),
      },
    });
  } catch (err: any) {
    console.error('Razorpay payment verification error:', err);
    res.status(500).json({ success: false, error: err?.error?.description || err?.message || 'Payment verification failed' });
  }
};