import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
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

// The address people open the app at, without a trailing slash ('' when unset).
const publicUrl = (env.PUBLIC_URL || '').trim().replace(/\/+$/, '');

// The Vite dev server. Only local development and tests may fall back to it: anywhere else an
// unset CLIENT_ORIGIN means PUBLIC_URL, so a deploy never trusts (or links to) localhost.
const DEV_CLIENT_ORIGINS = 'http://localhost:5173,https://localhost:5173';

// Absolute path of the JSON database file. Tests point this at a temporary file.
const dbPath = path.resolve(env.PULSEFIT_DB_PATH || path.resolve(__dirname, '../data/gym-db.json'));

// Older builds signed tokens with this public literal; no server may use it outside development.
const DEV_JWT_SECRET = 'pulsefit-dev-only-secret-do-not-use-in-production';
const TEST_JWT_SECRET = 'pulsefit-test-only-secret-not-for-any-server';

/** A random development secret, kept next to the database (git-ignored) so restarts keep sessions. */
function devJwtSecret(): string {
  const file = path.join(path.dirname(dbPath), '.dev-jwt-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  } catch {
    // First start: create it below.
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    console.warn(`⚠️  JWT_SECRET is not set; generated a development secret in ${file}. Set JWT_SECRET in server/.env before deploying.`);
  } catch {
    console.warn('⚠️  JWT_SECRET is not set and the generated development secret could not be saved; sessions end when the API restarts.');
  }
  return secret;
}

function resolveJwtSecret(): string {
  const secret = env.JWT_SECRET;
  const local = isDevelopment || isTest;
  if (secret === DEV_JWT_SECRET && !local) {
    throw new Error(`JWT_SECRET is the public development secret from the source code; set a random one of at least 32 characters (NODE_ENV=${nodeEnv}).`);
  }
  if (secret && secret.length >= 32) return secret;
  // Only local development and tests may run without a real secret.
  if (!local) {
    throw new Error(`JWT_SECRET must be set to a random string of at least 32 characters (NODE_ENV=${nodeEnv}).`);
  }
  if (secret) {
    console.warn('⚠️  JWT_SECRET is shorter than 32 characters; using it anyway because this is not production.');
    return secret;
  }
  return isTest ? TEST_JWT_SECRET : devJwtSecret();
}

function resolvePaymentProvider(value: string | undefined): '' | 'razorpay' | 'youpi' {
  const provider = (value || '').trim().toLowerCase();
  if (provider === '' || provider === 'razorpay' || provider === 'youpi') return provider;
  throw new Error(`PAYMENT_PROVIDER must be razorpay or youpi (or empty), not "${value}".`);
}

/** The YouPI API address is fine for its secret: HTTPS, or plain HTTP to this machine. */
function youpiUrlIsSafe(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' || (protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname));
  } catch {
    return false;
  }
}

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  // Local development or tests: the only environments where development shortcuts (demo
  // personas by default, reset links in API responses, the dev JWT secret) are allowed.
  isLocal: isDevelopment || isTest,
  port: Number(env.PORT) || 5004,
  // Network address to listen on. Development stays on this machine; HOST=0.0.0.0 opens it to the
  // LAN (a phone on Wi-Fi). Unset elsewhere: every interface.
  host: env.HOST?.trim() || (isDevelopment ? '127.0.0.1' : undefined),

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',

  // The 1-click demo personas (POST /api/auth/demo-login) hand out admin tokens, so they are
  // on by default only in local development. Set DEMO_MODE=true to keep them on a public demo.
  demoMode: flag(env.DEMO_MODE, isDevelopment || isTest),

  // Express 'trust proxy': how many reverse proxies sit in front of the API. Only then are
  // X-Forwarded-For addresses believed (rate limits are per client IP). Default: none.
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  // Signs that a proxy terminates HTTPS in front of the API (a PaaS, or an https PUBLIC_URL while
  // the API itself only speaks HTTP), for the startup warning when TRUST_PROXY is unset.
  proxyLikely:
    Boolean(env.RENDER || env.RAILWAY_ENVIRONMENT || env.FLY_APP_NAME || env.DYNO || env.K_SERVICE || env.WEBSITE_HOSTNAME) ||
    (env.PUBLIC_URL || '').trim().startsWith('https://'),

  // Comma-separated list of browser origins allowed to call the API. Unset: the Vite dev server in
  // local development and tests, PUBLIC_URL everywhere else (index.ts warns when both are unset).
  corsOrigins: (env.CLIENT_ORIGIN || (isDevelopment || isTest ? DEV_CLIENT_ORIGINS : publicUrl))
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Origins of the Android/iOS app (Capacitor). Allowed by CORS but never used to build reset
  // links, since a link to the app's internal origin opens nothing outside the app.
  appOrigins: (env.APP_ORIGINS ?? 'https://localhost,capacitor://localhost')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // The address people open the app at (e.g. https://gym.example.com), used to build password
  // reset links, canonical links, the sitemap and the HTTPS redirect. Empty: the first CLIENT_ORIGIN
  // (production never trusts the request's Host headers).
  publicUrl,

  // Let search engines index the website: robots.txt allows the public pages and lists the sitemap.
  // Off (the default outside production, and for staging or preview deploys): robots.txt answers
  // "Disallow: /" and every response carries X-Robots-Tag: noindex.
  allowIndexing: flag(env.ALLOW_INDEXING, isProduction),

  // In production with an https:// PUBLIC_URL, send plain-HTTP requests to PUBLIC_URL with a 301
  // (the health check excepted). Needs TRUST_PROXY, since the proxy in front ends HTTPS.
  httpsRedirect: flag(env.HTTPS_REDIRECT, true),

  // Strict-Transport-Security (one year, sub-domains included). Off in local development, where it
  // would pin https://localhost for every other project on this machine.
  hsts: flag(env.HSTS, !isDevelopment),

  // Write password reset links to the server log, for staff to hand out (there is no email
  // delivery). On by default only in local development; the log line never names the email.
  logResetLinks: flag(env.LOG_RESET_LINKS, isDevelopment || isTest),

  dbPath,

  // Files the website hands out, kept next to the database (on the data volume in production), so a
  // new Android app goes live by copying pulsefit.apk (and pulsefit.json) there, without a redeploy.
  downloadsDir: path.join(path.dirname(dbPath), 'downloads'),

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

  // YouPI PG, a self-hosted UPI gateway (https://github.com/youpi-pg/YouPI-PG): its Payment API
  // address, this gym's merchant id there, and that merchant's webhook secret (which also
  // authenticates payment-status lookups, so it only ever travels over HTTPS or this machine).
  youpi: {
    apiUrl: (env.YOUPI_API_URL || '').trim().replace(/\/+$/, ''),
    merchantId: (env.YOUPI_MERCHANT_ID || '').trim(),
    webhookSecret: env.YOUPI_WEBHOOK_SECRET || '',
  },

  // Which gateway new checkouts use: razorpay or youpi. Empty: Razorpay when its keys are set,
  // otherwise YouPI. Orders already started with either gateway can always finish.
  paymentProvider: resolvePaymentProvider(env.PAYMENT_PROVIDER),

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

export type PaymentProvider = 'razorpay' | 'youpi';

export const razorpayConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);
export const youpiConfigured = () =>
  Boolean(config.youpi.apiUrl && config.youpi.merchantId && config.youpi.webhookSecret) &&
  (!config.isProduction || youpiUrlIsSafe(config.youpi.apiUrl));

/** The gateway new checkouts use, or null when online payments are off. */
export function paymentProvider(): PaymentProvider | null {
  if (config.paymentProvider === 'youpi') return youpiConfigured() ? 'youpi' : null;
  if (config.paymentProvider === 'razorpay') return razorpayConfigured() ? 'razorpay' : null;
  if (razorpayConfigured()) return 'razorpay';
  return youpiConfigured() ? 'youpi' : null;
}

export const paymentsEnabled = () => paymentProvider() !== null;
export const googleSignInEnabled = () => Boolean(config.googleClientId);

export default config;
