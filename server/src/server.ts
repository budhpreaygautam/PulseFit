import path from 'path';
import express, { type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config.js';
import apiRoutes from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';
import { csrfGuard } from './middleware/auth.js';
import { apiLimiter } from './lib/authRateLimits.js';
import { loadIndexTemplate, renderIndexHtml, robotsTxt, sitemapXml } from './lib/seo.js';
import { compressedAssets } from './lib/compressedAssets.js';
import { ANDROID_APP_URL, sendAndroidApp } from './lib/androidApp.js';

export const app = express();

// Set TRUST_PROXY to the number of proxies in front of the API (e.g. 1 on Render/Railway/nginx)
// so rate limits see the real client IP; without it, forged X-Forwarded-For headers are ignored.
app.set('trust proxy', config.trustProxy);

// HTTPS only. The proxy in front ends TLS and says how the visitor connected (X-Forwarded-Proto,
// believed only with TRUST_PROXY); a plain-HTTP request is sent to the same path on PUBLIC_URL,
// never on the request's Host header. Without that header nothing is redirected, so a proxy that
// does not send it cannot cause a redirect loop. The health check stays reachable over HTTP for
// load balancers.
app.use((req, res, next) => {
  const redirect =
    config.isProduction &&
    config.httpsRedirect &&
    config.trustProxy &&
    config.publicUrl.startsWith('https://') &&
    !req.secure &&
    Boolean(req.get('x-forwarded-proto')) &&
    req.path !== '/api/health';
  if (!redirect) return next();
  const target = req.originalUrl.startsWith('/') ? req.originalUrl : '/';
  // 308 keeps the method and body of a POST; browsers turn a 301 POST into a GET.
  res.redirect(req.method === 'GET' || req.method === 'HEAD' ? 301 : 308, config.publicUrl + target);
});

const RAZORPAY = 'https://*.razorpay.com';
const GOOGLE_ACCOUNTS = 'https://accounts.google.com';

// The website loads Razorpay Checkout, Google Identity Services, Google Fonts and remote images.
// No inline scripts (the theme script is public/theme-init.js); inline styles stay allowed for
// React style attributes and the invoice's print stylesheet.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", RAZORPAY, GOOGLE_ACCOUNTS],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', `${GOOGLE_ACCOUNTS}/gsi/style`],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", RAZORPAY, GOOGLE_ACCOUNTS],
        frameSrc: [RAZORPAY, GOOGLE_ACCOUNTS],
        // canvas-confetti draws in a worker it creates from a blob: URL.
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        // Only when the site is known to be on HTTPS: a plain-HTTP install would lose every asset.
        ...(config.publicUrl.startsWith('https://') ? { upgradeInsecureRequests: [] } : {})
      }
    },
    crossOriginEmbedderPolicy: false,
    // Google sign-in (popup mode) and Razorpay checkout talk to the windows they open.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    // Sent below, only when config.hsts is on.
    strictTransportSecurity: false
  })
);

// Browsers remember for a year to use HTTPS only, on this host and its sub-domains (every
// sub-domain must then serve HTTPS too). preload stays off: listing the domain at hstspreload.org
// is hard to undo, so add `preload: true` only once the whole domain is HTTPS for good. Browsers
// ignore the header on plain-HTTP responses.
const hsts = helmet.strictTransportSecurity({ maxAge: 365 * 24 * 60 * 60, includeSubDomains: true, preload: false });
app.use((req, res, next) => (config.hsts ? hsts(req, res, next) : next()));

// Staging and preview deploys (ALLOW_INDEXING off) keep every response out of search results, and
// API answers never belong in them. A JSON-LD block in index.html is data, not script, so the
// CSP above does not need to allow it.
app.use((req, res, next) => {
  if (!config.allowIndexing || req.path === '/api' || req.path.startsWith('/api/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests and tools such as curl send no Origin header.
      if (!origin || config.corsOrigins.includes(origin) || config.appOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 600
  })
);

app.use('/api', apiLimiter);

// Without TRUST_PROXY every visitor behind a proxy shares the proxy's address for rate limits.
let proxyWarned = false;
if (config.isProduction) {
  app.use((req, _res, next) => {
    if (!config.trustProxy && !proxyWarned && req.headers['x-forwarded-for']) {
      proxyWarned = true;
      console.warn('⚠️  Requests arrive through a proxy (X-Forwarded-For) but TRUST_PROXY is not set: rate limits see the proxy, not the visitor. Set TRUST_PROXY=1 in server/.env.');
    }
    next();
  });
}

// Cookie-authenticated writes must carry X-Requested-With (see csrfGuard).
app.use('/api', csrfGuard);

// Razorpay and YouPI webhook signatures are computed over the exact raw body, so those routes
// must see the bytes before express.json() parses them.
app.use(['/api/payment/webhook', '/api/payment/youpi/webhook'], express.raw({ type: 'application/json', limit: '1mb' }));
// 512 kB leaves room for a resized profile photo sent as a data URL.
app.use(express.json({ limit: '512kb' }));

if (!config.isTest) {
  app.use('/api', (req, _res, next) => {
    // The path only: query strings carry emails, phone numbers and pass codes.
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.baseUrl}${req.path}`);
    next();
  });
}

app.use('/api', apiRoutes);

// For crawlers: which pages to index, and where they are (lib/seo.ts).
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsTxt());
});
app.get('/sitemap.xml', (_req, res, next) => {
  const xml = sitemapXml(loadIndexTemplate()?.builtOn);
  if (!xml) return next();
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
});

// The Android app, from the downloads folder on the data volume (lib/androidApp.ts). Anything else
// under /downloads/ is a plain 404, never the app's HTML.
app.get(ANDROID_APP_URL, sendAndroidApp);
app.use('/downloads', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

// In production the API also serves the built React app, with a fallback to index.html so
// deep links such as /schedule or /admin/members survive a refresh. Settings are read per
// request, so tests can point clientDistPath at a fixture.
let assets: { root: string; serve: RequestHandler } | null = null;
const compressed = compressedAssets(() => config.clientDistPath);
app.use((req, res, next) => (config.serveClient ? compressed(req, res, next) : next()));
app.use((req, res, next) => {
  // The raw index.html still has the head marker: it is only served filled in, below.
  if (!config.serveClient || req.path === '/index.html') return next();
  if (assets?.root !== config.clientDistPath) {
    assets = {
      root: config.clientDistPath,
      serve: express.static(config.clientDistPath, {
        index: false,
        maxAge: '1h',
        // Vite puts a content hash in every file name under assets/, so they never change.
        setHeaders(res, file) {
          if (path.basename(path.dirname(file)) === 'assets') res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      })
    };
  }
  assets.serve(req, res, next);
});

// A missing file under /assets/ (an old chunk asked for after a redeploy) is a plain 404, not the
// app's HTML, which the browser would reject with a confusing MIME-type error.
app.use('/assets', (_req, res, next) => (config.serveClient ? res.status(404).type('text/plain').send('Not found') : next()));

// Each page gets its own title, description, canonical link and JSON-LD in the HTML itself, so
// crawlers and link previews see them without running the app. An unknown address answers 404
// (with the app's own "page not found"), not a soft 404.
app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
  const template = config.serveClient ? loadIndexTemplate() : null;
  if (!template) return next();
  const { status, html } = renderIndexHtml(template.html, req.path);
  // Always revalidated, so a new deploy's asset names reach people at once.
  res.status(status).type('html').set('Cache-Control', 'no-cache').send(html);
});

app.use(errorHandler);

export default app;
