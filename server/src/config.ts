import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Every environment variable the API reads is resolved here, once, so the rest of the
// code never touches process.env directly. See server/.env.example for descriptions.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test' || env.VITEST === 'true';

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const DEV_JWT_SECRET = 'pulsefit-dev-only-secret-do-not-use-in-production';

function resolveJwtSecret(): string {
  const secret = env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters when NODE_ENV=production.');
  }
  if (secret) {
    console.warn('⚠️  JWT_SECRET is shorter than 32 characters; using it anyway because this is not production.');
    return secret;
  }
  if (!isTest) {
    console.warn('⚠️  JWT_SECRET is not set; using a development-only secret. Set it in server/.env before deploying.');
  }
  return DEV_JWT_SECRET;
}

export const config = {
  isProduction,
  isTest,
  port: Number(env.PORT) || 5004,

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',

  // The 1-click demo personas (POST /api/auth/demo-login) hand out admin tokens, so they are
  // on by default only outside production. Set DEMO_MODE=true to keep them on a public demo.
  demoMode: flag(env.DEMO_MODE, !isProduction),

  // Comma-separated list of browser origins allowed to call the API.
  corsOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173,https://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Absolute path of the JSON database file. Tests point this at a temporary file.
  dbPath: path.resolve(env.PULSEFIT_DB_PATH || path.resolve(__dirname, '../data/gym-db.json')),

  // All "today", weekday and hour calculations use the gym's local time, not the server's.
  gymTimezone: env.GYM_TIMEZONE || 'Asia/Kolkata',

  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  // OAuth client id from Google Cloud Console. When empty, "Continue with Google" is hidden.
  googleClientId: env.GOOGLE_CLIENT_ID || '',

  // When true (the default in production) the API also serves the built client from client/dist.
  serveClient: flag(env.SERVE_CLIENT, isProduction),
  clientDistPath: path.resolve(__dirname, '../../client/dist'),

  rateLimit: {
    // Disabled in tests so suites can hammer the auth routes.
    enabled: flag(env.RATE_LIMIT, !isTest),
  },
};

export const paymentsEnabled = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);
export const googleSignInEnabled = () => Boolean(config.googleClientId);

export default config;
