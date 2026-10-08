import db from './database.js';
import bcrypt from 'bcryptjs';
import { defaultAvatar, findUserByEmail, generateQrToken, generateTempPassword, newId } from '../lib/users.js';
import { User } from '../types/index.js';

// `npm run create-admin -- --email owner@example.com --name "Gym Owner"`
// Creates an admin account with a random password and prints the password once. This is how a
// production deployment gets its first account (production never seeds the demo personas).
// Run it while the API is stopped: a running server keeps the database in memory and would
// overwrite the file on its next save.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim() || 'Gym Admin';

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- --email you@example.com [--name "Your Name"]');
  process.exit(1);
}
if (findUserByEmail(email)) {
  console.error(`An account with ${email} already exists. Reset its password from the admin panel instead.`);
  process.exit(1);
}

const password = generateTempPassword(14);
const admin: User = {
  id: newId('usr'),
  email,
  name,
  password_hash: bcrypt.hashSync(password, 10),
  role: 'admin',
  avatar_url: defaultAvatar(name),
  phone: '',
  membership_tier: 'none',
  membership_status: 'pending',
  membership_expiry: null,
  qr_code_token: generateQrToken(name),
  created_at: new Date().toISOString(),
  streak_days: 0,
  last_active_date: null,
  token_version: 0
};
db.users = [...db.users, admin];
db.saveSync();

console.log(`✅ Admin ${email} created in ${db.filePath}`);
console.log(`   Temporary password: ${password}`);
console.log('   Sign in and change it under My account → Password.');
console.log('   If the API was running, restart it now so it loads the new account.');
