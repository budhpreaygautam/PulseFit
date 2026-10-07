import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import path from 'path';

// The suite runs against the production build served by the API, on a throwaway database
// seeded with the demo data, so it exercises exactly what would be deployed.
const PORT = Number(process.env.E2E_PORT) || 5180;
const dbPath = path.join(os.tmpdir(), `pulsefit-e2e-${process.pid}.json`);

export default defineConfig({
  testDir: 'e2e',
  // One shared database: run serially so bookings and check-ins do not race each other.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: 'npm run build --prefix client && cd server && npx tsx src/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      SERVE_CLIENT: 'true',
      DEMO_MODE: 'true',
      RATE_LIMIT: 'false',
      PULSEFIT_DB_PATH: dbPath
    }
  }
});
