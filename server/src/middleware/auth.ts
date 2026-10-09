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

export function generateToken(user: User): string {
  const claims: TokenClaims = { id: user.id, role: user.role, tv: user.token_version || 0 };
  return jwt.sign(claims, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

/** The user a bearer token belongs to, or null if the token is missing, invalid, expired or revoked. */
function userFromHeader(header: string | undefined): User | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const claims = jwt.verify(header.slice(7), config.jwtSecret) as TokenClaims;
    const user = db.users.find(u => u.id === claims.id);
    if (!user) return null;
    // Password changes and resets bump token_version, which revokes every older token.
    if ((claims.tv || 0) !== (user.token_version || 0)) return null;
    return user;
  } catch {
    return null;
  }
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = userFromHeader(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Your session has expired. Please sign in again.', code: 'UNAUTHORIZED' });
  }
  req.user = user;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const user = userFromHeader(req.headers.authorization);
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
