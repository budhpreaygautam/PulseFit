import crypto from 'crypto';
import db from '../db/database.js';
import { effectiveStatus } from './membership.js';
import { currentStreak } from './streak.js';
import { SafeUser, User } from '../types/index.js';

/** Unique-enough short id with a readable prefix, e.g. newId('bk') -> 'bk_3f9a1c2b7d4e'. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * The only shape a user may leave the API in: no password hash or internal fields, and the
 * membership status / streak as they are today (an expired date reads as 'expired').
 */
export function toSafeUser(user: User): SafeUser {
  const { password_hash, token_version, google_sub, ...rest } = user;
  return {
    ...rest,
    membership_status: effectiveStatus(user),
    streak_days: currentStreak(user)
  };
}

const PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random password for admin-created accounts and resets (about 58 bits). */
export function generateTempPassword(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += PASS_ALPHABET[bytes[i] % PASS_ALPHABET.length];
  return out;
}

/** Turnstile pass token, unique across users: PULSE-MEM-<NAME>-<6 chars>. */
export function generateQrToken(name: string): string {
  const stem = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'ATHL';
  for (;;) {
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    const token = `PULSE-MEM-${stem}-${suffix}`;
    if (!db.users.some(u => u.qr_code_token === token)) return token;
  }
}

export function findUserByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  return db.users.find(u => u.email.toLowerCase() === normalized);
}

export function defaultAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
}
