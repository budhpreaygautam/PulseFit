import { RouteDef } from '../routes.js';
import { GYM_NAME } from '../components/public/gymInfo.js';
import { isNativeApp } from './native.js';

// Per-page <head> tags: title, description, canonical, robots and the Open Graph copies of them.
// In production the server writes the same tags into index.html for the page that was asked for
// (see the <!--app-head--> marker there), so crawlers and link previews see them without running
// any script; this keeps them right as people move between pages. Existing tags are updated, never
// duplicated.

export const TITLE_SUFFIX = ` · ${GYM_NAME}`;

const NOT_FOUND_TITLE = 'Page not found';
const NOT_FOUND_DESCRIPTION =
  'This page is not on the PulseFit Athletics website. Head back to the home page for our Gurugram gym, class timetable and membership plans.';

/** The full document title for a page: "Coaches · PulseFit Athletics". At most 60 characters. */
export function documentTitle(route: RouteDef | undefined): string {
  return `${route ? route.searchTitle ?? route.title : NOT_FOUND_TITLE}${TITLE_SUFFIX}`;
}

function setMeta(attribute: 'name' | 'property', key: string, content: string | null): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (content === null) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string | null): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

// The site's own address, taken from the canonical link the server wrote from PUBLIC_URL, so a visit
// through another host name (www, or the hosting platform's address) still points search engines at
// it. Without one (a private page loaded first, or the dev server) the page's own origin is used.
let siteOrigin: string | undefined;
function canonicalOrigin(): string {
  if (siteOrigin === undefined) {
    const written = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    try {
      siteOrigin = written ? new URL(written).origin : '';
    } catch {
      siteOrigin = '';
    }
  }
  return siteOrigin || window.location.origin;
}

/** Points the document head at a page (undefined: the 404 page). */
export function applyPageHead(route: RouteDef | undefined): void {
  const title = documentTitle(route);
  const description = route?.description ?? NOT_FOUND_DESCRIPTION;

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  // Indexable pages need no robots tag (index, follow is the default).
  setMeta('name', 'robots', route?.indexable ? null : 'noindex, nofollow');

  // The app's pages live at capacitor://localhost or https://localhost: not addresses to share.
  if (isNativeApp) return;
  // The page's own path, without the query string (?plan=, ?date=) or a trailing slash. As in the
  // server's HTML, only indexable pages have one: a canonical on a noindex page (or the missing
  // page) would send search engines mixed signals.
  const url = route?.indexable ? canonicalOrigin() + route.path : null;
  setCanonical(url);
  setMeta('property', 'og:url', url);
}
