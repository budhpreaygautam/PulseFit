import db from '../database.js';
import { addDays, gymDateTime, gymToday } from '../../lib/dates.js';
import { defaultAvatar } from '../../lib/users.js';
import { User } from '../../types/index.js';

// Demo data owned by the auth domain. Called by seedDatabase() after the base data
// (users, trainers, classes, exercises, plans) has been written.
//
// Two fresh sign-ups that have not bought a plan yet, so the admin's "pending" view and the
// member's "choose a plan" screen have something to show: one registered with email and
// password (pulse123, like every demo account), one through Google (no password).
export function seedAuth(): void {
  const today = gymToday();
  const demoHash = db.users.find(u => u.email === 'member@pulsefit.com')?.password_hash;

  const signups: User[] = [
    {
      id: 'usr_pending_1',
      email: 'kabir.singh@example.com',
      ...(demoHash ? { password_hash: demoHash } : {}),
      name: 'Kabir Singh',
      role: 'member',
      avatar_url: defaultAvatar('Kabir Singh'),
      phone: '+91 98117 40213',
      membership_tier: 'none',
      membership_status: 'pending',
      membership_expiry: null,
      qr_code_token: 'PULSE-MEM-KABIR-5D21C0',
      created_at: gymDateTime(addDays(today, -2), '19:05').toISOString(),
      streak_days: 0,
      last_active_date: null,
      token_version: 0
    },
    {
      id: 'usr_google_1',
      email: 'isha.nair@example.com',
      name: 'Isha Nair',
      role: 'member',
      avatar_url: defaultAvatar('Isha Nair'),
      phone: '',
      membership_tier: 'none',
      membership_status: 'pending',
      membership_expiry: null,
      qr_code_token: 'PULSE-MEM-ISHA-9B7E14',
      created_at: gymDateTime(addDays(today, -5), '08:30').toISOString(),
      streak_days: 0,
      last_active_date: null,
      token_version: 0,
      google_sub: 'demo-google-sub-isha-nair'
    }
  ];

  const taken = new Set(db.users.map(u => u.email));
  db.users = [...db.users, ...signups.filter(u => !taken.has(u.email))];
}
