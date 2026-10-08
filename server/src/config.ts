import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Every environment variable the API reads is resolved here, once, so the rest of the
// code never touches process.env directly. See server/.env.example for descriptions.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env;
// Fail closed: the compiled build (`npm start`, which runs dist/) is production unless NODE_ENV
// says otherwise, so forgetting NODE_ENV on a deploy cannot switch on development shortcuts.
const runningCompiledBuild = __dirname.split(path.sep).includes('dist');
const nodeEnv = env.NODE_ENV || (runningCompiledBuild ? 'production' : 'development');
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test' || env.VITEST === 'true';
const isDevelopment = nodeEnv === 'development';

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseTrustProxy(value: string | undefined): boolean | number {
  if (!value || ['false', '0', 'no', 'off'].includes(value.toLowerCase())) return false;
  if (value.toLowerCase() === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

const DEV_JWT_SECRET = 'pulsefit-dev-only-secret-do-not-use-in-production';

function resolveJwtSecret(): string {
  const secret = env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  // Only local development and tests may run without a real secret.
  if (!isDevelopment && !isTest) {
    throw new Error(`JWT_SECRET must be set to a random string of at least 32 characters (NODE_ENV=${nodeEnv}).`);
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
  nodeEnv,
  isProduction,
  isTest,
  // Local development or tests: the only environments where development shortcuts (demo
  // personas by default, reset links in API responses, the dev JWT secret) are allowed.
  isLocal: isDevelopment || isTest,
  port: Number(env.PORT) || 5004,

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',

  // The 1-click demo personas (POST /api/auth/demo-login) hand out admin tokens, so they are
  // on by default only in local development. Set DEMO_MODE=true to keep them on a public demo.
  demoMode: flag(env.DEMO_MODE, isDevelopment || isTest),

  // Express 'trust proxy': how many reverse proxies sit in front of the API. Only then are
  // X-Forwarded-For addresses believed (rate limits are per client IP). Default: none.
  trustProxy: parseTrustProxy(env.TRUST_PROXY),

  // Comma-separated list of browser origins allowed to call the API.
  corsOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173,https://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Absolute path of the JSON database file. Tests point this at a temporary file.
  dbPath: path.resolve(env.PULSEFIT_DB_PATH || path.resolve(__dirname, '../data/gym-db.json')),

  // All "today", weekday and hour calculations use the gym's local time, not the server's.
  gymTimezone: env.GYM_TIMEZONE || 'Asia/Kolkata',

  // Refuse check-ins, floor clock-ins and same-day trials while the gym is closed (lib/hours.ts).
  // Tests switch it off so they pass at any hour of the day.
  enforceOpeningHours: flag(env.ENFORCE_OPENING_HOURS, true),

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
