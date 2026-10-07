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

afterAll(() => {
  for (const file of [dbPath, `${dbPath}.${process.pid}.tmp`]) {
    try { fs.rmSync(file, { force: true }); } catch { /* already gone */ }
  }
});
