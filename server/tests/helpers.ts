import request from 'supertest';
import app from '../src/server.js';
import db from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { generateToken } from '../src/middleware/auth.js';
import { addDays, gymToday } from '../src/lib/dates.js';
import { generateQrToken, newId } from '../src/lib/users.js';
import type { User } from '../src/types/index.js';

export { db };

/** The header the website and the apps send on every API request; without it the API answers 404. */
export const APP_HEADER = { 'X-Requested-With': 'PulseFit' } as const;

/** supertest agent bound to the Express app (no port needed), sending APP_HEADER like the app does. */
export const api = () => request.agent(app).set(APP_HEADER);

/** The same without APP_HEADER: an API address opened in the browser, a link, another site, curl. */
export const bareApi = () => request(app);

/** Wipe the temporary database and load the demo data. Call in beforeEach. */
export function resetDb(): void {
  seedDatabase();
}

/** Seeded demo accounts (password 'pulse123'). */
export const personas = {
  member: 'member@pulsefit.com', // Aarav Sharma, pro (Zumba & Cardio pass), active
  vip: 'vip@pulsefit.com', // Ananya Gupta, vip (all access), active
  admin: 'admin@pulsefit.com', // Priya Verma, admin
  trainer: 'trainer@pulsefit.com', // Coach Vikram Rathore, trainer (trainer record trn_vikram)
  basic: 'rohan.mehra@example.com', // Rohan Mehra, basic (Workout & Strength pass), active
  expired: 'dev.kapoor@example.com' // Dev Kapoor, basic, expired
} as const;

export function userByEmail(email: string) {
  const user = db.users.find(u => u.email === email);
  if (!user) throw new Error(`No seeded user ${email}`);
  return user;
}

/** A valid bearer token for a seeded user, without going through the login route. */
export function tokenFor(email: string): string {
  return generateToken(userByEmail(email));
}

export function authHeader(email: string): { Authorization: string } {
  return { Authorization: `Bearer ${tokenFor(email)}` };
}

/**
 * Insert a fresh member with no history: active on the basic plan until today + 30, unless the
 * patch says otherwise. Sign in as them with authHeader(member.email).
 */
export function addMember(patch: Partial<User> = {}): User {
  const id = newId('usr');
  const member: User = {
    id,
    email: `${id}@example.com`,
    name: 'Test Member',
    role: 'member',
    avatar_url: '',
    phone: '',
    membership_tier: 'basic',
    membership_status: 'active',
    membership_expiry: addDays(gymToday(), 30),
    frozen_since: null,
    qr_code_token: generateQrToken('Test Member'),
    created_at: new Date().toISOString(),
    streak_days: 0,
    last_active_date: null,
    token_version: 0,
    ...patch
  };
  db.users = [...db.users, member];
  return member;
}
