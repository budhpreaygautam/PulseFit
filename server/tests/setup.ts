import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

// Runs before each test file is imported: point the database at a throwaway file so tests
// never touch server/data/gym-db.json.
const dbPath = path.join(os.tmpdir(), `pulsefit-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
process.env.NODE_ENV = 'test';
process.env.PULSEFIT_DB_PATH = dbPath;
process.env.DEMO_MODE = process.env.DEMO_MODE ?? 'true';
// Behave as if behind one reverse proxy, so tests can simulate client IPs with X-Forwarded-For.
process.env.TRUST_PROXY = process.env.TRUST_PROXY ?? '1';
// Opening-hours clock rules would make tests depend on the time they run; tests that cover
// them switch config.enforceOpeningHours back on.
process.env.ENFORCE_OPENING_HOURS = process.env.ENFORCE_OPENING_HOURS ?? 'false';
// The origin tests assume the defaults, whatever server/.env says (dotenv never overrides a set value).
process.env.CLIENT_ORIGIN = 'http://localhost:5173,https://localhost:5173';
process.env.APP_ORIGINS = 'https://localhost,capacitor://localhost';
// Payment tests configure their gateway themselves.
for (const key of ['PAYMENT_PROVIDER', 'YOUPI_API_URL', 'YOUPI_MERCHANT_ID', 'YOUPI_WEBHOOK_SECRET']) process.env[key] = '';

afterAll(() => {
  for (const file of [dbPath, `${dbPath}.${process.pid}.tmp`]) {
    try { fs.rmSync(file, { force: true }); } catch { /* already gone */ }
  }
});
