import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { CLOSES_AT, OPENS_AT } from '../src/lib/hours.js';
import { GYM, NOT_FOUND_DESCRIPTION, PAGES, PUBLIC_API_PATHS, TITLE_SUFFIX, renderIndexHtml } from '../src/lib/seo.js';
import { api, db, resetDb } from './helpers.js';

const CLIENT_SRC = fileURLToPath(new URL('../../client/src/', import.meta.url));
const SITE = 'https://gym.example.in';

/**
 * A client source file's exports, read as text and transpiled: the server cannot import client code.
 * Its imports resolve to empty objects, which is enough for the plain data compared here.
 */
function clientModule(relative: string): Record<string, any> {
  const source = fs.readFileSync(path.join(CLIENT_SRC, relative), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} as Record<string, any> };
  new Function('exports', 'require', 'module', outputText)(module.exports, () => ({}), module);
  return module.exports;
}

// A stand-in for client/dist, shaped like the real build, so these tests never need one.
const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsefit-dist-'));
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Strength &amp; Zumba gym in Gurugram · PulseFit Athletics</title>
    <meta name="description" content="Home page description." />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Strength &amp; Zumba gym in Gurugram · PulseFit Athletics" />
    <meta property="og:description" content="Home page description." />
    <script src="/theme-init.js"></script>
    <!--app-head-->
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const original = {
  isProduction: config.isProduction,
  serveClient: config.serveClient,
  clientDistPath: config.clientDistPath,
  publicUrl: config.publicUrl,
  allowIndexing: config.allowIndexing,
  httpsRedirect: config.httpsRedirect,
  hsts: config.hsts,
  demoMode: config.demoMode
};

beforeAll(() => {
  fs.writeFileSync(path.join(distDir, 'index.html'), TEMPLATE);
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log(1);\n');
  fs.writeFileSync(path.join(distDir, 'theme-init.js'), '// theme\n');
});

afterAll(() => fs.rmSync(distDir, { recursive: true, force: true }));

beforeEach(() => {
  resetDb();
  Object.assign(config, { serveClient: true, clientDistPath: distDir, publicUrl: SITE, allowIndexing: true });
});

afterEach(() => {
  Object.assign(config, original);
  vi.unstubAllEnvs();
  vi.resetModules();
});

const indexable = PAGES.filter(p => p.indexable);

function jsonLd(html: string): any {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0][1]);
}

const nodesOf = (data: any, type: string) => data['@graph'].filter((n: any) => n['@type'] === type);

/** Google's reading of robots.txt: the longest matching rule wins, and Allow wins a tie. */
function crawlable(robots: string, url: string): boolean {
  let best = { length: -1, allow: true };
  for (const line of robots.split('\n')) {
    const rule = /^(Allow|Disallow): (\S+)$/.exec(line);
    if (!rule || !url.startsWith(rule[2])) continue;
    const allow = rule[1] === 'Allow';
    if (rule[2].length > best.length || (rule[2].length === best.length && allow)) best = { length: rule[2].length, allow };
  }
  return best.allow;
}

/**
 * The API paths the public pages read in the browser: every api.getX() called by a page App.tsx
 * loads as a public page (or by the components/public widgets they share), mapped to its path
 * through client/src/api/client.ts, plus the app config every page loads.
 */
function publicPageApiPaths(): string[] {
  const read = (relative: string) => fs.readFileSync(path.join(CLIENT_SRC, relative), 'utf8');
  const client = read('api/client.ts');
  const getPaths = new Map<string, string>();
  const entries = [...client.matchAll(/^ {2}(\w+):/gm)];
  entries.forEach((entry, i) => {
    const body = client.slice(entry.index, entries[i + 1]?.index);
    const get = /\bget<[\s\S]*?>\(\s*['`](\/[^'`$?]*)/.exec(body);
    if (get) getPaths.set(entry[1], get[1]);
  });

  const app = read('App.tsx');
  const pages = [
    ...[...app.matchAll(/publicPage\(\(\) => import\('\.\/([^']+)\.js'\)/g)].map(m => `${m[1]}.tsx`),
    ...[...app.matchAll(/from '\.\/(pages\/public\/[^']+)\.js'/g)].map(m => `${m[1]}.tsx`)
  ];
  const widgets = fs.readdirSync(path.join(CLIENT_SRC, 'components/public')).filter(f => f.endsWith('.tsx')).map(f => `components/public/${f}`);
  const sources = [...pages, ...widgets, 'context/ConfigContext.tsx'].map(read);

  const paths = new Set<string>();
  for (const source of sources) {
    for (const [, method] of source.matchAll(/\bapi\.(\w+)\(/g)) {
      const found = getPaths.get(method);
      if (found) paths.add(`/api${found}`);
    }
    for (const [, literal] of source.matchAll(/abortableGet<[^>]*>\('(\/[^']*)'/g)) paths.add(`/api${literal}`);
  }
  return [...paths].sort();
}

describe('server copy of the client pages and gym facts', () => {
  it('matches client/src/routes.ts: paths, titles, descriptions and indexable flags', () => {
    const { ROUTES } = clientModule('routes.ts');
    expect(ROUTES.length).toBeGreaterThan(0);
    expect(PAGES.map(({ heroImage: _hero, ...page }) => page)).toEqual(
      ROUTES.map((r: any) => ({ path: r.path, title: r.searchTitle ?? r.title, description: r.description, indexable: r.indexable }))
    );
  });

  it('matches client/src/components/public/gymInfo.ts: name, address, phone, email and hours', () => {
    const info = clientModule('components/public/gymInfo.ts');
    expect(GYM.name).toBe(info.GYM_NAME);
    expect(`${GYM.streetAddress}, ${GYM.addressLocality}, ${GYM.addressRegion} ${GYM.postalCode}`).toBe(info.GYM_ADDRESS);
    expect(GYM.telephone).toBe(info.GYM_PHONE_TEL);
    expect(GYM.email).toBe(info.GYM_EMAIL);
    expect(Number(OPENS_AT.slice(0, 2))).toBe(info.OPEN_HOUR);
    expect(Number(CLOSES_AT.slice(0, 2))).toBe(info.CLOSE_HOUR);
  });

  it('gives the 404 page the same description as the client', () => {
    expect(fs.readFileSync(path.join(CLIENT_SRC, 'lib/seo.ts'), 'utf8')).toContain(`'${NOT_FOUND_DESCRIPTION}'`);
  });

  it('preloads the hero photos the client shows (HERO_PHOTOS in components/public/media.ts)', () => {
    const { HERO_PHOTOS } = clientModule('components/public/media.ts');
    const copies = Object.fromEntries(PAGES.filter(p => p.heroImage).map(p => [p.path, p.heroImage]));
    expect(copies).toEqual(HERO_PHOTOS);
  });

  it('keeps every title within 60 characters and every description within 160', () => {
    for (const page of PAGES) {
      expect((page.title + TITLE_SUFFIX).length, page.path).toBeLessThanOrEqual(60);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
  });
});

describe('GET /robots.txt', () => {
  it('opens the public pages and assets, shuts the API and signed-in areas, and names the sitemap', async () => {
    const res = await api().get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    const lines = res.text.trim().split('\n');
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Allow: /');
    expect(lines).not.toContain('Disallow: /');
    for (const area of ['/api/', '/downloads/', '/admin', '/trainer', '/dashboard', '/bookings', '/log-workout', '/profile', '/reset-password', '/payment-status']) {
      expect(lines).toContain(`Disallow: ${area}`);
    }
    // /admin already covers its sub-pages; nothing public, and no script or style, is shut.
    expect(lines).not.toContain('Disallow: /admin/members');
    for (const page of indexable) {
      const blocked = lines.filter(l => l.startsWith('Disallow: ')).some(l => page.path.startsWith(l.slice('Disallow: '.length)));
      expect(blocked, page.path).toBe(false);
    }
    expect(res.text).not.toMatch(/assets|\.js|\.css/);
    expect(lines.at(-1)).toBe(`Sitemap: ${SITE}/sitemap.xml`);
    expect(res.headers['x-robots-tag']).toBeUndefined();
  });

  it('lets the renderer fetch every API answer the public pages are drawn from', async () => {
    const robots = (await api().get('/robots.txt')).text;
    const used = publicPageApiPaths();
    // The pages read at least plans, classes, coaches, exercises and the config; an empty list
    // would mean the scan of the client source stopped matching.
    expect(used).toEqual(expect.arrayContaining(['/api/config', '/api/plans', '/api/classes', '/api/trainers', '/api/exercises']));
    for (const url of used) {
      expect(crawlable(robots, url), url).toBe(true);
      expect(crawlable(robots, `${url}?week_start=2026-10-19`), url).toBe(true);
    }
    for (const page of indexable) expect(crawlable(robots, page.path), page.path).toBe(true);
  });

  it('keeps the signed-in and staff API answers shut', async () => {
    const robots = (await api().get('/robots.txt')).text;
    for (const url of [
      '/api/auth/me',
      '/api/members',
      '/api/payments/my',
      '/api/bookings/my',
      '/api/trainer/me',
      '/api/trainer/clients',
      '/api/workouts',
      '/api/time-tracking/my-stats',
      '/api/analytics/dashboard',
      '/api/trials',
      '/api/health'
    ]) {
      expect(crawlable(robots, url), url).toBe(false);
    }
  });

  it('opens only API answers anyone may read without signing in', async () => {
    for (const url of PUBLIC_API_PATHS) {
      const res = await api().get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers['x-robots-tag'], url).toBe('noindex, nofollow');
    }
  });

  it('shuts everything on staging (ALLOW_INDEXING off) and marks every response noindex', async () => {
    config.allowIndexing = false;
    const robots = await api().get('/robots.txt');
    expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
    for (const url of ['/robots.txt', '/', '/pricing', '/api/health']) {
      expect((await api().get(url)).headers['x-robots-tag'], url).toBe('noindex, nofollow');
    }
  });

  it('shuts everything on a host that only serves the API', async () => {
    config.serveClient = false;
    expect((await api().get('/robots.txt')).text).toBe('User-agent: *\nDisallow: /\n');
    expect((await api().get('/sitemap.xml')).status).toBe(404);
  });

  it('never indexes API answers', async () => {
    expect((await api().get('/api/health')).headers['x-robots-tag']).toBe('noindex, nofollow');
    expect((await api().get('/')).headers['x-robots-tag']).toBeUndefined();
  });
});

describe('GET /sitemap.xml', () => {
  it('lists every indexable page once, as absolute addresses, in the sitemap namespace', async () => {
    const res = await api().get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    expect(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    const locs = [...res.text.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual(indexable.map(p => SITE + p.path));
    expect(locs).toHaveLength(11);
    expect(locs).not.toContain(`${SITE}/dashboard`);
    expect(res.text).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('escapes the addresses as XML', async () => {
    config.publicUrl = 'https://gym.example.in/a&b';
    const res = await api().get('/sitemap.xml');
    expect(res.text).toContain('<loc>https://gym.example.in/a&amp;b/pricing</loc>');
    expect(res.text).not.toContain('a&b');
  });

  it('is not served while indexing is off', async () => {
    config.allowIndexing = false;
    expect((await api().get('/sitemap.xml')).status).toBe(404);
  });

  it('falls back to the first CLIENT_ORIGIN, never the Host header, when PUBLIC_URL is unset', async () => {
    config.publicUrl = '';
    const res = await api().get('/sitemap.xml').set('Host', 'evil.example.com').set('X-Forwarded-Host', 'evil.example.net');
    expect(res.text).not.toContain('evil.example');
    expect(res.text).toContain(`<loc>${config.corsOrigins[0]}/</loc>`);
  });
});

describe('page head in the served index.html', () => {
  it('fills in the title, description, Open Graph tags and canonical link of an indexable page', async () => {
    const res = await api().get('/pricing');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['cache-control']).toBe('no-cache');
    const html = res.text;
    const page = PAGES.find(p => p.path === '/pricing')!;
    expect(html).toContain('<title>Gym membership plans in Gurugram · PulseFit Athletics</title>');
    expect(html).toContain(`<meta name="description" content="${page.description}" />`);
    expect(html).toContain('<meta property="og:title" content="Gym membership plans in Gurugram · PulseFit Athletics" />');
    expect(html).toContain(`<meta property="og:description" content="${page.description}" />`);
    expect(html).toContain(`<link rel="canonical" href="${SITE}/pricing" />`);
    expect(html).toContain(`<meta property="og:url" content="${SITE}/pricing" />`);
    expect(html).not.toContain('name="robots"');
    expect(html).not.toContain('<!--app-head-->');
    // Each tag once: replaced in place, not added again.
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    // The app still loads.
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('/assets/index-abc123.js');
  });

  it('escapes the title and uses the clean path, without query string or trailing slash, as canonical', async () => {
    const res = await api().get('/pricing/?plan=pro&utm_source=x');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`<link rel="canonical" href="${SITE}/pricing" />`);
    expect(res.text).not.toContain('utm_source');
    const home = await api().get('/');
    expect(home.text).toContain('<title>Strength &amp; Zumba gym in Gurugram · PulseFit Athletics</title>');
    expect(home.text).toContain(`<link rel="canonical" href="${SITE}/" />`);
  });

  it('marks private pages noindex, with no canonical link', async () => {
    for (const url of ['/dashboard', '/admin/members', '/reset-password?token=abc', '/payment-status']) {
      const res = await api().get(url);
      expect(res.status, url).toBe(200);
      expect(res.text, url).toContain('<meta name="robots" content="noindex, nofollow" />');
      expect(res.text, url).not.toContain('rel="canonical"');
      expect(res.text, url).not.toContain('og:url');
    }
    expect((await api().get('/admin/members')).text).toContain('<title>Members · PulseFit Athletics</title>');
  });

  it('preloads the hero photo on the pages that have one, and only there', async () => {
    const home = (await api().get('/')).text;
    const href = PAGES[0].heroImage!.replace(/&/g, '&amp;');
    expect(home).toContain(`<link rel="preload" as="image" href="${href}" fetchpriority="high" />`);
    expect(home.match(/rel="preload"/g)).toHaveLength(1);
    expect((await api().get('/pricing')).text).not.toContain('rel="preload"');
  });

  it('answers an unknown address with 404 and noindex, still rendering the app', async () => {
    for (const url of ['/this-page-does-not-exist', '/Pricing', '/index.html']) {
      const res = await api().get(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).toContain('<title>Page not found · PulseFit Athletics</title>');
      expect(res.text, url).toContain('<meta name="robots" content="noindex, nofollow" />');
      expect(res.text, url).not.toContain('rel="canonical"');
      expect(res.text, url).not.toContain('application/ld+json');
      expect(res.text, url).toContain('<div id="root"></div>');
    }
  });

  it('tells the app in its HTML when the deployment is a demo, and only then', async () => {
    config.demoMode = true;
    expect((await api().get('/pricing')).text).toContain('<meta name="pulsefit-demo-mode" content="on" />');
    config.demoMode = false;
    expect((await api().get('/pricing')).text).not.toContain('pulsefit-demo-mode');
  });

  it('answers a missing build asset with a plain 404, not the app', async () => {
    const res = await api().get('/assets/missing.js');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).not.toContain('<div id="root"></div>');
  });

  it('picks up a client rebuilt while the server runs', async () => {
    const file = path.join(distDir, 'index.html');
    expect((await api().get('/')).text).toContain('/assets/index-abc123.js');
    fs.writeFileSync(file, TEMPLATE.replace('index-abc123.js', 'index-def456.js'));
    // A later modification time, as a rebuild gives it.
    const later = new Date(fs.statSync(file).mtimeMs + 5_000);
    fs.utimesSync(file, later, later);
    try {
      expect((await api().get('/')).text).toContain('/assets/index-def456.js');
    } finally {
      fs.writeFileSync(file, TEMPLATE);
    }
  });

  it('leaves the API alone: unknown API routes still answer JSON', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('serves the hashed build assets as immutable, and other files for an hour', async () => {
    const asset = await api().get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const theme = await api().get('/theme-init.js');
    expect(theme.status).toBe(200);
    expect(theme.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('sends the build scripts compressed to clients that accept it', async () => {
    const script = `export const plans = ${JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, name: `Plan ${i}` })))};\n`;
    fs.writeFileSync(path.join(distDir, 'assets', 'big-abc123.js'), script);
    for (const encoding of ['br', 'gzip']) {
      const res = await api().get('/assets/big-abc123.js').set('Accept-Encoding', encoding);
      expect(res.status).toBe(200);
      expect(res.headers['content-encoding']).toBe(encoding);
      expect(res.headers['vary']).toMatch(/Accept-Encoding/);
      expect(res.headers['content-type']).toMatch(/javascript/);
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(Number(res.headers['content-length'])).toBeLessThan(script.length / 3);
      expect(res.text).toBe(script);
    }
    // Neither encoding accepted, or a file too small to gain: sent as it is.
    const plain = await api().get('/assets/big-abc123.js').set('Accept-Encoding', 'identity');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.text).toBe(script);
    const small = await api().get('/assets/index-abc123.js').set('Accept-Encoding', 'br');
    expect(small.headers['content-encoding']).toBeUndefined();
    // A missing file is still a plain 404.
    expect((await api().get('/assets/gone-abc123.js').set('Accept-Encoding', 'br')).status).toBe(404);
  });

  it('adds nothing when the API does not serve the client', async () => {
    config.serveClient = false;
    expect((await api().get('/pricing')).status).toBe(404);
    expect((await api().get('/assets/index-abc123.js')).status).toBe(404);
  });
});

describe('JSON-LD', () => {
  it('describes the gym as an ExerciseGym with its organisation and website, from the gym facts', async () => {
    const data = jsonLd((await api().get('/')).text);
    expect(data['@context']).toBe('https://schema.org');
    const [gym] = nodesOf(data, 'ExerciseGym');
    const [org] = nodesOf(data, 'Organization');
    const [site] = nodesOf(data, 'WebSite');
    const [page] = nodesOf(data, 'WebPage');
    expect(gym).toMatchObject({
      '@id': `${SITE}/#gym`,
      name: 'PulseFit Athletics',
      url: `${SITE}/`,
      telephone: GYM.telephone,
      email: GYM.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Plot 42, Sector 29, near Cyber Hub',
        addressLocality: 'Gurugram',
        addressRegion: 'Haryana',
        postalCode: '122002',
        addressCountry: 'IN'
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          opens: '06:00',
          closes: '22:00'
        }
      ],
      parentOrganization: { '@id': org['@id'] }
    });
    const monthly = db.membership_plans.map(p => p.price_monthly);
    const rupees = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;
    expect(gym.priceRange).toBe(`${rupees(Math.min(...monthly))}–${rupees(Math.max(...monthly))} a month`);
    // Nothing the owner has not supplied.
    for (const key of ['geo', 'logo', 'image', 'sameAs', 'aggregateRating']) {
      expect(gym[key], key).toBeUndefined();
      expect(org[key], key).toBeUndefined();
    }
    expect(gym.hasOfferCatalog).toBeUndefined();
    expect(site).toMatchObject({ url: `${SITE}/`, publisher: { '@id': org['@id'] } });
    expect(page).toMatchObject({ url: `${SITE}/`, name: 'Strength & Zumba gym in Gurugram · PulseFit Athletics' });
  });

  it('lists the membership plans as offers in rupees on /pricing, at the catalogue prices', async () => {
    db.membership_plans = db.membership_plans.map(p => (p.tier === 'pro' ? { ...p, price_monthly: 2345, price_annual: 23450 } : p));
    const [gym] = nodesOf(jsonLd((await api().get('/pricing')).text), 'ExerciseGym');
    const offers = gym.hasOfferCatalog.itemListElement;
    expect(offers).toHaveLength(db.membership_plans.length);
    const pro = db.membership_plans.find(p => p.tier === 'pro')!;
    const offer = offers.find((o: any) => o.name === pro.name);
    expect(offer).toMatchObject({ '@type': 'Offer', price: 2345, priceCurrency: 'INR', url: `${SITE}/pricing` });
    expect(offer.priceSpecification).toEqual([
      { '@type': 'UnitPriceSpecification', price: 2345, priceCurrency: 'INR', billingDuration: 'P1M' },
      { '@type': 'UnitPriceSpecification', price: 23450, priceCurrency: 'INR', billingDuration: 'P1Y' }
    ]);
  });

  it('cannot be broken out of by text in the catalogue', async () => {
    const evil = '</script><script>alert(1)</script><!-- & "quoted"  ';
    db.membership_plans = db.membership_plans.map((p, i) => (i === 0 ? { ...p, name: evil, description: evil } : p));
    const html = (await api().get('/pricing')).text;
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<!-- &');
    expect(html.match(/<\/script>/g)).toHaveLength(html.match(/<script[\s>]/g)!.length);
    const [gym] = nodesOf(jsonLd(html), 'ExerciseGym');
    expect(gym.hasOfferCatalog.itemListElement.some((o: any) => o.name === evil)).toBe(true);
  });

  it('is a data block the Content Security Policy does not need to allow', async () => {
    const res = await api().get('/');
    expect(res.text).toMatch(/<script type="application\/ld\+json">/);
    // script-src stays strict: no inline scripts, no hashes or nonces needed for the data block.
    const scriptSrc = res.headers['content-security-policy'].split(';').find((d: string) => d.trim().startsWith('script-src '))!;
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toMatch(/'unsafe-inline'|'unsafe-eval'|'sha256-|'nonce-/);
  });

  it('never writes "$" patterns from a value into the page', () => {
    const { html } = renderIndexHtml(TEMPLATE.replace('Home page description.', "$' $& $1"), '/');
    expect(html).not.toContain('$&');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });
});

describe('HTTPS', () => {
  it('sends Strict-Transport-Security for a year, sub-domains included, without preload', async () => {
    config.hsts = true;
    const res = await api().get('/api/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    config.hsts = false;
    expect((await api().get('/api/health')).headers['strict-transport-security']).toBeUndefined();
  });

  describe('redirect from plain HTTP', () => {
    beforeEach(() => Object.assign(config, { isProduction: true, httpsRedirect: true, publicUrl: SITE }));

    it('sends a plain-HTTP visit to the same path on PUBLIC_URL with a 301, whatever the Host headers say', async () => {
      const res = await api()
        .get('/pricing?plan=pro')
        .set('X-Forwarded-Proto', 'http')
        .set('Host', 'evil.example.com')
        .set('X-Forwarded-Host', 'evil.example.net');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe(`${SITE}/pricing?plan=pro`);
    });

    it('keeps the method of other requests with a 308', async () => {
      const res = await api().post('/api/auth/login').set('X-Forwarded-Proto', 'http').send({});
      expect(res.status).toBe(308);
      expect(res.headers.location).toBe(`${SITE}/api/auth/login`);
    });

    it('leaves HTTPS visits and the health check alone', async () => {
      expect((await api().get('/pricing').set('X-Forwarded-Proto', 'https')).status).toBe(200);
      expect((await api().get('/api/health').set('X-Forwarded-Proto', 'http')).status).toBe(200);
    });

    it('does nothing without a proxy header (no loop behind a proxy that does not send it)', async () => {
      expect((await api().get('/pricing')).status).toBe(200);
    });

    it('is off with HTTPS_REDIRECT=false, outside production, and for an http:// PUBLIC_URL', async () => {
      const visit = () => api().get('/pricing').set('X-Forwarded-Proto', 'http');
      config.httpsRedirect = false;
      expect((await visit()).status).toBe(200);
      Object.assign(config, { httpsRedirect: true, isProduction: false });
      expect((await visit()).status).toBe(200);
      Object.assign(config, { isProduction: true, publicUrl: 'http://gym.example.in' });
      expect((await visit()).status).toBe(200);
    });
  });
});

describe('production defaults', () => {
  /** config.ts evaluated afresh, as a production server would start with these settings. */
  async function productionConfig(env: Record<string, string>) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('JWT_SECRET', 'x'.repeat(48));
    for (const key of ['CLIENT_ORIGIN', 'PUBLIC_URL', 'ALLOW_INDEXING', 'HTTPS_REDIRECT', 'HSTS']) vi.stubEnv(key, '');
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();
    return (await import('../src/config.js')).default;
  }

  it('never falls back to localhost for CLIENT_ORIGIN: PUBLIC_URL, or nothing', async () => {
    const fresh = await productionConfig({ PUBLIC_URL: `${SITE}/` });
    expect(fresh.corsOrigins).toEqual([SITE]);
    expect(fresh.allowIndexing).toBe(true);
    expect(fresh.httpsRedirect).toBe(true);
    expect(fresh.hsts).toBe(true);
    expect((await productionConfig({})).corsOrigins).toEqual([]);
    expect((await productionConfig({ CLIENT_ORIGIN: 'https://a.example.in, https://b.example.in' })).corsOrigins).toEqual([
      'https://a.example.in',
      'https://b.example.in'
    ]);
  });

  it('lets staging switch indexing, the redirect and HSTS off', async () => {
    const fresh = await productionConfig({ PUBLIC_URL: SITE, ALLOW_INDEXING: 'false', HTTPS_REDIRECT: 'false', HSTS: 'false' });
    expect(fresh).toMatchObject({ allowIndexing: false, httpsRedirect: false, hsts: false });
  });

  it('keeps search engines out of tests and local development by default', () => {
    expect(original.allowIndexing).toBe(false);
  });
});
