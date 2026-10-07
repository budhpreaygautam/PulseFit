import type { Request } from 'express';
import { rateLimit, MemoryStore, type RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

// Per-IP limits on the public auth routes (docs/API.md, "Auth & account"), plus a per-account
// limit on password changes. config.rateLimit.enabled is read on every request so tests can switch them on.

const MINUTE = 60_000;
const stores: MemoryStore[] = [];

function limiter(windowMs: number, limit: number, error: string, keyGenerator?: (req: Request) => string): RateLimitRequestHandler {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !config.rateLimit.enabled,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error, code: 'RATE_LIMITED' });
    },
    ...(keyGenerator ? { keyGenerator } : {})
  });
}

export const loginLimiter = limiter(15 * MINUTE, 10, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
export const registerLimiter = limiter(60 * MINUTE, 5, 'Too many accounts were created from this network. Please try again in an hour.');
export const forgotPasswordLimiter = limiter(60 * MINUTE, 5, 'Too many password reset requests. Please try again in an hour.');
export const googleLimiter = limiter(15 * MINUTE, 20, 'Too many Google sign-in attempts. Please wait 15 minutes and try again.');

// Keyed by account, not IP, so someone holding a stolen token cannot keep guessing the current
// password from many addresses. Must run after authenticate.
export const changePasswordLimiter = limiter(
  15 * MINUTE,
  10,
  'Too many password change attempts. Please wait 15 minutes and try again.',
  req => `user:${(req as AuthenticatedRequest).user!.id}`
);

/** Forget every counted request (tests only). */
export async function resetAuthRateLimits(): Promise<void> {
  await Promise.all(stores.map(s => s.resetAll()));
}
