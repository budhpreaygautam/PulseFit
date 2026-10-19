import fs from 'fs';
import path from 'path';
import config from '../config.js';
import db from '../db/database.js';
import { CLOSED_WEEKDAYS, CLOSES_AT, OPENS_AT } from './hours.js';

// What search engines and link previews see before any script runs: robots.txt, sitemap.xml and
// the <head> of each page the API serves from client/dist/index.html (title, description,
// canonical, robots and JSON-LD). The browser keeps the same tags in step as people move around
// (client/src/lib/seo.ts).
//
// The pages and the gym's facts are copies of client/src/routes.ts and
// client/src/components/public/gymInfo.ts (the server cannot import client code);
// tests/seo.test.ts fails when they drift apart.

export interface PageMeta {
  path: string;
  /** The title before " · PulseFit Athletics": the route's searchTitle, else its title. */
  title: string;
  description: string;
  /** Whether search engines may index the page (and find it in the sitemap). */
  indexable: boolean;
  /** The page's hero photo (HERO_PHOTOS in client/src/components/public/media.ts), preloaded from the HTML. */
  heroImage?: string;
}

export const PAGES: readonly PageMeta[] = [
  {
    path: '/',
    title: 'Strength & Zumba gym in Gurugram',
    description:
      'PulseFit Athletics in Sector 29, Gurugram: a Workout & Strength floor and a Zumba & Cardio studio, with coach-led classes you book in the app.',
    indexable: true,
    heroImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80'
  },
  {
    path: '/strength',
    title: 'Strength training gym in Gurugram',
    description:
      'Racks, barbells and free weights near Cyber Hub, Gurugram. See the weekly strength classes, what is on the floor and a 4-day split to start with.',
    indexable: true,
    heroImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&auto=format&fit=crop&q=80'
  },
  {
    path: '/zumba',
    title: 'Zumba & cardio classes in Gurugram',
    description:
      'High-energy Zumba and dance cardio in our own studio in Sector 29, Gurugram. See the weekly classes, what a class is like, and book a spot in the app.',
    indexable: true,
    heroImage: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1600&auto=format&fit=crop&q=80'
  },
  {
    path: '/guide',
    title: 'Workout plans & Indian diet charts',
    description:
      'Workout splits, high-protein Indian diet and meal charts with calories, and a research-backed supplements guide from PulseFit Athletics, Gurugram.',
    indexable: true
  },
  {
    path: '/schedule',
    title: 'Gym class timetable & booking',
    description:
      'Workout & Strength and Zumba & Cardio classes at PulseFit, Gurugram, Monday to Saturday, with spots left for each date. Members book 14 days ahead.',
    indexable: true
  },
  {
    path: '/pricing',
    title: 'Gym membership plans in Gurugram',
    description:
      'Compare the three PulseFit Athletics membership plans in Gurugram, priced in rupees with no sign-up fee. Pay monthly, or once for a full year.',
    indexable: true
  },
  {
    path: '/coaches',
    title: 'Strength & Zumba coaches',
    description:
      'Meet the coaches who run every Workout & Strength and Zumba & Cardio class on the PulseFit Athletics timetable in Sector 29, Gurugram.',
    indexable: true
  },
  {
    path: '/exercises',
    title: 'Exercise library',
    description:
      'How to perform each movement on the PulseFit floor and which muscles it works. Search, or filter the exercises by muscle group, equipment and level.',
    indexable: true
  },
  {
    path: '/reset-password',
    title: 'Reset your password',
    description:
      'Choose a new password for your PulseFit Athletics account from the reset link we emailed you, then sign in again on the website or in the app.',
    indexable: false
  },
  {
    path: '/payment-status',
    title: 'Payment status',
    description:
      'Whether your PulseFit Athletics membership payment went through, and what to do next if it is still pending or did not complete.',
    indexable: false
  },
  {
    path: '/privacy',
    title: 'Privacy policy',
    description:
      'What personal data PulseFit Athletics collects and why, who can see it, how long we keep it, how we protect it, and the rights you have over it.',
    indexable: true
  },
  {
    path: '/terms',
    title: 'Terms of service',
    description:
      'The rules for using the PulseFit Athletics gym in Gurugram, the website and your membership: accounts, class bookings, free trials and conduct.',
    indexable: true
  },
  {
    path: '/refund-policy',
    title: 'Refund & cancellation policy',
    description:
      'How online payments, cancellations, membership freezes and refunds work at PulseFit Athletics, Gurugram, and how refunds are paid back to you.',
    indexable: true
  },
  {
    path: '/dashboard',
    title: 'My dashboard',
    description:
      'Your PulseFit Athletics member dashboard: your membership, upcoming class bookings, notes from your coach and your recent check-ins at the gym.',
    indexable: false
  },
  {
    path: '/bookings',
    title: 'My bookings',
    description:
      'The PulseFit Athletics classes you have booked, upcoming and past, with the option to cancel a booking you can no longer make it to.',
    indexable: false
  },
  {
    path: '/log-workout',
    title: 'Log a workout',
    description:
      'Record the exercises, sets, reps and weights of a training session at PulseFit Athletics, with a rest timer and your saved workout history.',
    indexable: false
  },
  {
    path: '/profile',
    title: 'My account',
    description:
      'Your PulseFit Athletics account: personal details, membership pass, invoices and billing, and changing your password.',
    indexable: false
  },
  {
    path: '/trainer',
    title: 'Coach dashboard',
    description:
      'The PulseFit Athletics coach dashboard: classes for the next 7 days, attendance for the last 14 days, and notes for the members you coach.',
    indexable: false
  },
  {
    path: '/admin',
    title: 'Admin dashboard',
    description:
      'PulseFit Athletics gym overview for staff: active members, revenue, check-ins today, class fill rate, retention and free trials this month.',
    indexable: false
  },
  {
    path: '/admin/members',
    title: 'Members',
    description:
      "PulseFit Athletics member accounts for staff: search by name, email, phone or pass code, and manage each member's plan, access and account.",
    indexable: false
  },
  {
    path: '/admin/id-cards',
    title: 'ID cards',
    description:
      'The physical PulseFit Athletics ID cards handed out at the front desk: find a card by name, email, phone or number, issue one or deactivate it.',
    indexable: false
  },
  {
    path: '/admin/check-in',
    title: 'Front-desk check-in',
    description:
      'Check members in at the PulseFit Athletics front desk: scan a QR pass or ID card, or type a pass code, card number, email or free-trial code.',
    indexable: false
  },
  {
    path: '/admin/classes',
    title: 'Classes & coaches',
    description:
      "The PulseFit Athletics weekly class timetable and coaching team, managed by staff, with booking counts for each class's next session.",
    indexable: false
  },
  {
    path: '/admin/plans',
    title: 'Plans & pricing',
    description:
      'The PulseFit Athletics membership plan catalogue, managed by staff, behind the public pricing page, online checkout and class entitlements.',
    indexable: false
  },
  {
    path: '/admin/trials',
    title: 'Free-trial leads',
    description:
      'Everyone who claimed a free trial day at PulseFit Athletics, newest first, filtered by status. Each free-trial pass works once, on its date.',
    indexable: false
  }
];

/** The gym's public facts (client/src/components/public/gymInfo.ts), split up for schema.org. */
export const GYM = {
  name: 'PulseFit Athletics',
  streetAddress: 'Plot 42, Sector 29, near Cyber Hub',
  addressLocality: 'Gurugram',
  addressRegion: 'Haryana',
  postalCode: '122002',
  addressCountry: 'IN',
  telephone: '+919811078573',
  email: 'contact@pulsefit.in'
} as const;

/**
 * Facts only the owner can supply. Each is left out of the structured data while empty: never fill
 * them with guesses (search engines penalise wrong coordinates and made-up profiles).
 */
export const GYM_PROFILE: {
  /** Path under the site of a square logo, at least 112x112 px, e.g. '/logo.png' (put it in client/public). */
  logoPath: string;
  /** Path under the site of a real photo of the gym, e.g. '/gym.jpg'. */
  imagePath: string;
  /** The entrance's coordinates, copied from the gym's Google Maps pin. */
  geo: { latitude: number; longitude: number } | null;
  /** The gym's official profiles: Google Business Profile, Instagram, Facebook, YouTube… */
  sameAs: string[];
} = {
  logoPath: '',
  imagePath: '',
  geo: null,
  sameAs: []
};

export const TITLE_SUFFIX = ` · ${GYM.name}`;
const NOT_FOUND_TITLE = 'Page not found';
export const NOT_FOUND_DESCRIPTION =
  'This page is not on the PulseFit Athletics website. Head back to the home page for our Gurugram gym, class timetable and membership plans.';

/** The page at a path, matched as the client does (trailing slashes ignored); undefined: not a page. */
export function pageFor(pathname: string): PageMeta | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return PAGES.find(p => p.path === clean);
}

/**
 * The site's public address: PUBLIC_URL, else the first CLIENT_ORIGIN; '' when neither is set.
 * Never built from the request's Host headers, which anyone can set.
 */
export function siteUrl(): string {
  return config.publicUrl || config.corsOrigins[0] || '';
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** JSON that cannot end its <script> block or open a comment, whatever the strings in it say. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ---- robots.txt and sitemap.xml ----

/** Whether this deployment serves the website (not just the API) and may be indexed. */
const websiteIndexable = () => config.allowIndexing && config.serveClient;

/**
 * The read-only API answers the public pages are drawn from in the browser (plans, classes, coaches,
 * exercises, the floor count and the app config). Google's renderer obeys robots.txt for these
 * requests too, so they stay open or the indexed pages would show only their loading or error panels.
 * They are still never indexed themselves: every /api answer carries X-Robots-Tag: noindex.
 */
export const PUBLIC_API_PATHS = [
  '/api/config',
  '/api/plans',
  '/api/classes',
  '/api/trainers',
  '/api/exercises',
  '/api/time-tracking/active-floor'
];

/**
 * robots.txt: the public pages, their assets and the API answers they render from open to crawlers;
 * the rest of the API and the signed-in areas not. Staging (ALLOW_INDEXING off) and an API-only host
 * shut everything.
 */
export function robotsTxt(): string {
  if (!websiteIndexable()) return 'User-agent: *\nDisallow: /\n';
  // One line per area: /admin also covers /admin/members and the rest. Scripts, styles and images
  // stay open: Google renders the pages with them. The longest matching rule wins, so the Allow
  // lines for the public API answers beat "Disallow: /api/". The Android app download
  // (/downloads/pulsefit.apk) is a file for people, not a page.
  const closed = PAGES.filter(p => !p.indexable).map(p => p.path);
  const disallow = closed.filter(p => !closed.some(other => other !== p && p.startsWith(`${other}/`)));
  const base = siteUrl();
  return [
    'User-agent: *',
    'Allow: /',
    ...PUBLIC_API_PATHS.map(p => `Allow: ${p}`),
    'Disallow: /api/',
    'Disallow: /downloads/',
    ...disallow.map(p => `Disallow: ${p}`),
    ...(base ? ['', `Sitemap: ${base}/sitemap.xml`] : []),
    ''
  ].join('\n');
}

/** sitemap.xml for every indexable page, or null when indexing is off (staging) or the site has no address. */
export function sitemapXml(lastmod?: string): string | null {
  const base = siteUrl();
  if (!websiteIndexable() || !base) return null;
  const urls = PAGES.filter(p => p.indexable).map(
    p => `  <url>\n    <loc>${escapeXml(base + p.path)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---- JSON-LD ----

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const rupees = (amount: number) => `₹${new Intl.NumberFormat('en-IN').format(amount)}`;

function plansByPrice() {
  return [...db.membership_plans].sort((a, b) => a.price_monthly - b.price_monthly);
}

/** The schema.org graph for a page: the gym (an ExerciseGym), its organisation, the website and the page itself. */
export function structuredData(page: PageMeta): Record<string, unknown> {
  const base = siteUrl();
  const at = (pagePath: string) => (base ? base + pagePath : undefined);
  const id = (fragment: string) => `${base}/#${fragment}`;
  const plans = plansByPrice();
  const sameAs = GYM_PROFILE.sameAs.length ? { sameAs: GYM_PROFILE.sameAs } : {};

  const organization = {
    '@type': 'Organization',
    '@id': id('organization'),
    name: GYM.name,
    url: at('/'),
    email: GYM.email,
    telephone: GYM.telephone,
    ...(GYM_PROFILE.logoPath && base ? { logo: at(GYM_PROFILE.logoPath) } : {}),
    ...sameAs
  };

  const gym: Record<string, unknown> = {
    '@type': 'ExerciseGym',
    '@id': id('gym'),
    name: GYM.name,
    url: at('/'),
    telephone: GYM.telephone,
    email: GYM.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: GYM.streetAddress,
      addressLocality: GYM.addressLocality,
      addressRegion: GYM.addressRegion,
      postalCode: GYM.postalCode,
      addressCountry: GYM.addressCountry
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: WEEKDAYS.filter((_, day) => !CLOSED_WEEKDAYS.includes(day)),
        opens: OPENS_AT,
        closes: CLOSES_AT
      }
    ],
    currenciesAccepted: 'INR',
    parentOrganization: { '@id': id('organization') },
    ...(plans.length
      ? { priceRange: `${rupees(plans[0].price_monthly)}–${rupees(plans[plans.length - 1].price_monthly)} a month` }
      : {}),
    ...(GYM_PROFILE.imagePath && base ? { image: at(GYM_PROFILE.imagePath) } : {}),
    ...(GYM_PROFILE.geo ? { geo: { '@type': 'GeoCoordinates', ...GYM_PROFILE.geo } } : {}),
    ...sameAs
  };

  // The pricing page also carries the plans, at the prices checkout charges today.
  if (page.path === '/pricing' && plans.length) {
    gym.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Membership plans',
      itemListElement: plans.map(plan => ({
        '@type': 'Offer',
        name: plan.name,
        description: plan.description,
        url: at('/pricing'),
        price: plan.price_monthly,
        priceCurrency: 'INR',
        priceSpecification: [
          { '@type': 'UnitPriceSpecification', price: plan.price_monthly, priceCurrency: 'INR', billingDuration: 'P1M' },
          { '@type': 'UnitPriceSpecification', price: plan.price_annual, priceCurrency: 'INR', billingDuration: 'P1Y' }
        ],
        itemOffered: { '@type': 'Service', name: plan.name, provider: { '@id': id('gym') } }
      }))
    };
  }

  const website = {
    '@type': 'WebSite',
    '@id': id('website'),
    name: GYM.name,
    url: at('/'),
    inLanguage: 'en-IN',
    publisher: { '@id': id('organization') }
  };

  const webpage = {
    '@type': 'WebPage',
    '@id': `${base}${page.path}#webpage`,
    url: at(page.path),
    name: page.title + TITLE_SUFFIX,
    description: page.description,
    inLanguage: 'en-IN',
    isPartOf: { '@id': id('website') },
    about: { '@id': id('gym') }
  };

  return { '@context': 'https://schema.org', '@graph': [organization, website, gym, webpage] };
}

// ---- index.html ----

/** The marker in client/index.html where the per-page tags go (Vite keeps it in the build). */
export const HEAD_MARKER = '<!--app-head-->';

/** Written into the head when DEMO_MODE is on; read by client/src/context/ConfigContext.tsx. */
export const DEMO_MODE_META = 'pulsefit-demo-mode';

/**
 * client/dist/index.html filled in for one path: its title, description, Open Graph copies,
 * canonical link and JSON-LD, or noindex for private pages. status is 404 for an unknown path
 * (the app still renders its own "page not found").
 */
export function renderIndexHtml(template: string, pathname: string): { status: number; html: string } {
  const page = pageFor(pathname);
  const title = escapeHtml(page ? page.title + TITLE_SUFFIX : NOT_FOUND_TITLE + TITLE_SUFFIX);
  const description = escapeHtml(page?.description ?? NOT_FOUND_DESCRIPTION);
  const base = siteUrl();

  const head: string[] = [];
  if (page?.indexable && base) {
    const url = escapeHtml(base + page.path);
    head.push(`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`);
  }
  if (!page?.indexable) head.push('<meta name="robots" content="noindex, nofollow" />');
  // The likely Largest Contentful Paint: without this its download waits until the app has rendered.
  if (page?.heroImage) head.push(`<link rel="preload" as="image" href="${escapeHtml(page.heroImage)}" fetchpriority="high" />`);
  if (page) head.push(`<script type="application/ld+json">${jsonForScript(structuredData(page))}</script>`);
  // Lets a demo deployment show its "Demo accounts" bar in the first render, instead of pushing the
  // page down once /api/config answers (client/src/context/ConfigContext.tsx).
  if (config.demoMode) head.push(`<meta name="${DEMO_MODE_META}" content="on" />`);

  // Function replacements, so a "$" in a value is never read as a pattern.
  let html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, (_m, open, close) => open + description + close)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, (_m, open, close) => open + title + close)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, (_m, open, close) => open + description + close);
  const extra = head.join('\n    ');
  // An index.html built before the marker existed: add the tags at the end of <head>.
  html = html.includes(HEAD_MARKER) ? html.replace(HEAD_MARKER, () => extra) : html.replace('</head>', () => `${extra}\n  </head>`);

  return { status: page ? 200 : 404, html };
}

let cachedTemplate: { file: string; mtimeMs: number; html: string; builtOn?: string } | null = null;

/**
 * client/dist/index.html, or null when the client has not been built. Read again only when the file
 * changes, so a client rebuilt in place never serves the old build's asset names.
 */
export function loadIndexTemplate(): { html: string; builtOn?: string } | null {
  const file = path.join(config.clientDistPath, 'index.html');
  try {
    const { mtime, mtimeMs } = fs.statSync(file);
    if (cachedTemplate?.file === file && cachedTemplate.mtimeMs === mtimeMs) return cachedTemplate;
    const html = fs.readFileSync(file, 'utf8');
    // The sitemap's <lastmod>: the day the client was built.
    cachedTemplate = { file, mtimeMs, html, builtOn: mtime.toISOString().slice(0, 10) };
    return cachedTemplate;
  } catch {
    return null;
  }
}
