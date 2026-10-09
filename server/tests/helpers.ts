import request from 'supertest';
import app from '../src/server.js';
import db from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { generateToken } from '../src/middleware/auth.js';

export { db };

/** supertest agent bound to the Express app (no port needed). */
export const api = () => request(app);

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
