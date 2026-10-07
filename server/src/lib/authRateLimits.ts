import { rateLimit, MemoryStore, type RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config.js';

// Per-IP limits on the public auth routes (docs/API.md, "Auth & account").
// config.rateLimit.enabled is read on every request so tests can switch the limits on.

const MINUTE = 60_000;
const stores: MemoryStore[] = [];

function limiter(windowMs: number, limit: number, error: string, extra: { skipSuccessfulRequests?: boolean } = {}): RateLimitRequestHandler {
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
    ...extra
  });
}

// Only failed sign-ins count, so members sharing the gym's Wi-Fi are not locked out by each other.
export const loginLimiter = limiter(15 * MINUTE, 10, 'Too many sign-in attempts. Please wait 15 minutes and try again.', {
  skipSuccessfulRequests: true
});
export const registerLimiter = limiter(60 * MINUTE, 5, 'Too many accounts were created from this network. Please try again in an hour.');
export const forgotPasswordLimiter = limiter(60 * MINUTE, 5, 'Too many password reset requests. Please try again in an hour.');
export const googleLimiter = limiter(15 * MINUTE, 20, 'Too many Google sign-in attempts. Please wait 15 minutes and try again.');

/** Forget every counted request (tests only). */
export async function resetAuthRateLimits(): Promise<void> {
  await Promise.all(stores.map(s => s.resetAll()));
}
