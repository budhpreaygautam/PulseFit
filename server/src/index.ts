import config, { paymentProvider, youpiConfigured } from './config.js';
import db from './db/database.js';
import { addCatalogueIfMissing, seedDatabase } from './db/seed.js';
import app from './server.js';
import { warmCompressedAssets } from './lib/compressedAssets.js';

// First start (or a deleted database file). The demo gym includes staff accounts whose password
// is published in the README, so it is only loaded where demo personas are allowed; anywhere else
// the API starts with the catalogue and no accounts.
if (db.isEmpty()) {
  if (config.demoMode) {
    console.log(`📦 No data found at ${db.filePath}; loading the demo gym.`);
    seedDatabase({ demo: true });
  } else {
    console.log(`📦 No data found at ${db.filePath}; loading the starting catalogue (no accounts).`);
    seedDatabase({ demo: false });
    console.log('   Create the first admin: npm run create-admin -- --email you@example.com --name "Your Name"');
  }
} else if (addCatalogueIfMissing()) {
  // Accounts but no plans or classes: an admin created before the first start by an older create-admin.
  console.log(`📦 ${db.filePath} had accounts but no plans or classes; loaded the starting catalogue.`);
}

// Reset links, canonical links and the sitemap must carry the gym's real address.
if (!config.isLocal && !config.publicUrl && config.corsOrigins.length === 0) {
  console.warn(
    '⚠️  Neither PUBLIC_URL nor CLIENT_ORIGIN is set: password reset links, canonical links and the sitemap have no address, ' +
      'and no other website may call the API. Set PUBLIC_URL in server/.env to the address people open the app at, e.g. https://gym.example.com.'
  );
} else if (config.isProduction && !config.publicUrl) {
  console.warn(
    `⚠️  PUBLIC_URL is not set, so password reset links, canonical links and the sitemap use the first CLIENT_ORIGIN (${config.corsOrigins[0]}). ` +
      'Set PUBLIC_URL in server/.env to the address people open the app at, e.g. https://gym.example.com.'
  );
} else if (config.publicUrl && !/^https?:\/\/[^/]/.test(config.publicUrl)) {
  console.warn(`⚠️  PUBLIC_URL (${config.publicUrl}) should start with https:// or http://, or password reset links will not open.`);
}

if (config.isProduction) {
  if (!config.rateLimit.enabled) {
    console.warn('⚠️  RATE_LIMIT is off in production: sign-in, password reset and the API have no protection against guessing or flooding.');
  }
  if (config.demoMode) {
    console.warn(
      '⚠️  DEMO_MODE is on in production: anyone can sign in as the demo admin with one click, and the demo accounts use the ' +
        'published password pulse123. Only run a public demo this way, with no real data.'
    );
  }
  if (!config.trustProxy && config.proxyLikely) {
    console.warn(
      '⚠️  TRUST_PROXY is not set, but the API looks like it runs behind a proxy (a hosting platform or an https PUBLIC_URL): ' +
        'rate limits would count every visitor as the proxy. Set TRUST_PROXY=1 (the number of proxies) in server/.env.'
    );
  }
  if (config.httpsRedirect && config.publicUrl.startsWith('https://') && !config.trustProxy) {
    console.warn('⚠️  Plain-HTTP visits are not redirected to HTTPS: the API only sees how visitors connected with TRUST_PROXY set.');
  }
  if (config.serveClient && !config.allowIndexing) {
    console.log('   search engines: kept out (ALLOW_INDEXING=false): robots.txt disallows everything and pages are sent with noindex');
  }
}

// Payments: say which gateway checkouts use, and why a chosen one is not available.
const provider = paymentProvider();
const youpiSettings = config.youpi.apiUrl || config.youpi.merchantId || config.youpi.webhookSecret;
if (config.paymentProvider && provider !== config.paymentProvider) {
  console.warn(`⚠️  PAYMENT_PROVIDER=${config.paymentProvider}, but that gateway is not fully configured, so online payments are off.`);
}
if (youpiSettings && !youpiConfigured()) {
  console.warn(
    '⚠️  YouPI needs YOUPI_API_URL, YOUPI_MERCHANT_ID and YOUPI_WEBHOOK_SECRET' +
      (config.isProduction ? ', and in production an https:// YOUPI_API_URL (or http://localhost), because the merchant key travels with each status lookup.' : '.')
  );
}
if (provider === 'youpi') {
  console.log('   payments: YouPI (UPI to your own account; experimental, see README › Payments)');
}

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+|localhost)$/i;

function onListening() {
  const address = server.address();
  const host = address && typeof address === 'object' ? address.address : config.host ?? '::';
  const everywhere = host === '::' || host === '0.0.0.0';
  const shown = everywhere ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  console.log(
    `⚡ PulseFit API listening on http://${shown}:${config.port}${everywhere ? ' (all network interfaces)' : ''} (${config.nodeEnv})`
  );
  console.log(`   demo mode: ${config.demoMode ? 'ON (1-click personas enabled)' : 'off'}`);
  if (config.demoMode && !LOOPBACK.test(host)) {
    console.warn(
      `⚠️  Demo mode is on and the API accepts connections from the network (${host}): anyone who can reach this machine ` +
        'can sign in as the demo admin. Set HOST=127.0.0.1 unless another device needs to connect.'
    );
  }
}

const server = config.host ? app.listen(config.port, config.host, onListening) : app.listen(config.port, onListening);

// Compress the website's scripts and styles now, rather than on the first visitor's request.
if (config.serveClient) warmCompressedAssets(config.clientDistPath);

// Write any debounced change before the process exits (Ctrl+C, tsx watch restarts, deploys).
function shutdown(signal: string) {
  console.log(`\n${signal} received; saving data and shutting down.`);
  try {
    db.flush();
  } finally {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
