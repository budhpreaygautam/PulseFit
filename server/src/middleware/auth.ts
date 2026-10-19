import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import db from '../db/database.js';
import { User, UserRole } from '../types/index.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

interface TokenClaims {
  id: string;
  role: UserRole;
  tv: number;
}

/**
 * The website's session lives in this httpOnly cookie, out of reach of page scripts. API clients
 * and the Android/iOS apps send the same JWT as a bearer token instead.
 */
export const SESSION_COOKIE = 'pulsefit_session';

/**
 * Cookie-authenticated writes must carry this header. A cross-site page cannot add a custom header
 * without a CORS preflight, which the origin allowlist refuses: this is the CSRF defence, on top of
 * SameSite=Lax.
 */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'PulseFit';

const ISSUER = 'pulsefit';
const SESSION_AUDIENCE = 'pulsefit-session';
const MFA_AUDIENCE = 'pulsefit-mfa';
// Staff sessions are shorter: an admin token opens every member's data.
const STAFF_SESSION_EXPIRY = '12h';

export function generateToken(user: User): string {
  const claims: TokenClaims = { id: user.id, role: user.role, tv: user.token_version || 0 };
  const expiresIn = (user.role === 'member' ? config.jwtExpiresIn : STAFF_SESSION_EXPIRY) as jwt.SignOptions['expiresIn'];
  return jwt.sign(claims, config.jwtSecret, { algorithm: 'HS256', issuer: ISSUER, audience: SESSION_AUDIENCE, expiresIn });
}

/**
 * Proof that the password (or Google) step of a sign-in passed, for an account with MFA on. It is
 * only accepted by POST /auth/mfa/verify, never as a session.
 */
export function generateMfaToken(user: User): string {
  return jwt.sign({ id: user.id, tv: user.token_version || 0 }, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: MFA_AUDIENCE,
    expiresIn: '5m'
  });
}

export function userFromMfaToken(token: string): User | null {
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: MFA_AUDIENCE }) as { id: string; tv?: number };
    const user = db.users.find(u => u.id === claims.id);
    if (!user || (claims.tv || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

/** When the request's session token was issued (ms), for actions that need a recent sign-in. */
export function sessionIssuedAt(req: Request): number | null {
  const token = tokenFromRequest(req);
  const decoded = token ? (jwt.decode(token) as { iat?: number } | null) : null;
  return decoded?.iat ? decoded.iat * 1000 : null;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function tokenFromRequest(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return readCookie(req, SESSION_COOKIE);
}

/** The user a token belongs to, or null if it is missing, invalid, expired or revoked. */
function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: SESSION_AUDIENCE }) as TokenClaims;
    const user = db.users.find(u => u.id === claims.id);
    if (!user) return null;
    // Password changes and resets bump token_version, which revokes every older token.
    if ((claims.tv || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

/** Seconds until a token expires (for the cookie's Max-Age). */
function secondsLeft(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : 0;
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax' as const,
  path: '/api'
});

/**
 * Start a session: the website gets the httpOnly cookie and no token in the body; the
 * Android/iOS apps (their own origins) and API clients without an Origin get the bearer token only.
 */
export function issueSession(req: Request, res: Response, user: User): { token?: string } {
  const token = generateToken(user);
  const origin = req.get('origin');
  // Browsers send Origin on every sign-in POST; API clients (scripts, tests) send none and get no cookie.
  if (origin === undefined || config.appOrigins.includes(origin)) return { token };
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: secondsLeft(token) * 1000 });
  return {};
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for the cookie session: a write that carries the session cookie (and no bearer
 * token) must send the X-Requested-With header the app always sets.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (readCookie(req, SESSION_COOKIE) === undefined) return next();
  if (req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) return next();
  return res.status(403).json({ success: false, error: 'This request was blocked. Reload the page and try again.', code: 'CSRF_REJECTED' });
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = userFromToken(tokenFromRequest(req));
  if (!user) {
    return res.status(401).json({ success: false, error: 'Your session has expired. Please sign in again.', code: 'UNAUTHORIZED' });
  }
  req.user = user;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const user = userFromToken(tokenFromRequest(req));
  if (user) req.user = user;
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Please sign in to continue.', code: 'UNAUTHORIZED' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to do that.', code: 'FORBIDDEN' });
    }
    next();
  };
}
