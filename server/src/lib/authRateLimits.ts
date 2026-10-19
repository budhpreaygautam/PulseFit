import type { Request } from 'express';
import { rateLimit, ipKeyGenerator, MemoryStore, type RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

// Per-IP limits on the public auth routes (docs/API.md, "Auth & account"), per-account limits on
// sign-in and password changes, and a generous per-IP limit on the whole API.
// config.rateLimit.enabled is read on every request so tests can switch them on.

const MINUTE = 60_000;
const stores: MemoryStore[] = [];

interface LimiterOptions {
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  /** Count only answers of 400 and above. */
  skipSuccessfulRequests?: boolean;
}

function limiter(windowMs: number, limit: number, error: string, options: LimiterOptions = {}): RateLimitRequestHandler {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: req => !config.rateLimit.enabled || Boolean(options.skip?.(req)),
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error, code: 'RATE_LIMITED' });
    },
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {})
  });
}

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? '');
const userOrIp = (req: Request) => {
  const user = (req as AuthenticatedRequest).user;
  return user ? `user:${user.id}` : clientIp(req);
};
/** The sign-in email as findUserByEmail compares it (the body is parsed, not yet validated). */
const loginEmail = (req: Request) => {
  const email: unknown = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 320) : '';
};

export const loginLimiter = limiter(15 * MINUTE, 10, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
// Per account, on top of the per-IP limit, so guesses spread over many addresses still stop.
// Only failed attempts count, so the owner's own sign-ins never lock them out.
export const loginAccountLimiter = limiter(
  15 * MINUTE,
  10,
  'Too many failed sign-in attempts for this account. Please wait 15 minutes and try again.',
  { keyGenerator: req => `email:${loginEmail(req)}`, skip: req => !loginEmail(req), skipSuccessfulRequests: true }
);
export const registerLimiter = limiter(60 * MINUTE, 5, 'Too many accounts were created from this network. Please try again in an hour.');
export const forgotPasswordLimiter = limiter(60 * MINUTE, 5, 'Too many password reset requests. Please try again in an hour.');
export const resetPasswordLimiter = limiter(15 * MINUTE, 10, 'Too many password reset attempts. Please wait 15 minutes and try again.');
export const googleLimiter = limiter(15 * MINUTE, 20, 'Too many Google sign-in attempts. Please wait 15 minutes and try again.');
export const demoLoginLimiter = limiter(15 * MINUTE, 30, 'Too many demo sign-ins. Please wait 15 minutes and try again.');

// Second-factor codes: per IP during sign-in, and per account (after authenticate) while setting up.
export const mfaVerifyLimiter = limiter(15 * MINUTE, 10, 'Too many verification attempts. Please wait 15 minutes and try again.');
export const mfaSetupLimiter = limiter(15 * MINUTE, 10, 'Too many two-step verification attempts. Please wait 15 minutes and try again.', {
  keyGenerator: userOrIp
});

// Keyed by account, not IP, so someone holding a stolen token cannot keep guessing the current
// password from many addresses. Must run after authenticate.
export const changePasswordLimiter = limiter(15 * MINUTE, 10, 'Too many password change attempts. Please wait 15 minutes and try again.', {
  keyGenerator: req => `user:${(req as AuthenticatedRequest).user!.id}`
});

// Every /api request per IP, generous enough for the busiest screen. The health check (uptime
// monitors) and the Razorpay webhook (Razorpay's servers retry) are exempt. Mounted on /api.
export const apiLimiter = limiter(MINUTE, 300, 'Too many requests. Please wait a minute and try again.', {
  skip: req => (req.method === 'GET' && req.path === '/health') || req.path === '/payment/webhook'
});

/** Forget every counted request (tests only). */
export async function resetAuthRateLimits(): Promise<void> {
  await Promise.all(stores.map(s => s.resetAll()));
}
