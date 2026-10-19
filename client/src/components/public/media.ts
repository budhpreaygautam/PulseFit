// Helpers for the photos on the public pages.

/**
 * For the one image most likely to be a page's Largest Contentful Paint: the browser fetches it
 * ahead of the other images. React 18 doesn't know the camelCase fetchPriority prop (it warns), so
 * the attribute is passed in the lowercase form the HTML parser reads.
 */
/**
 * Each page's hero photo, the image most likely to be its Largest Contentful Paint, by path. The
 * server keeps a copy (server/src/lib/seo.ts, checked by its tests) and preloads it from the page's
 * HTML, so the download starts before any script has run. Shown at exactly this URL, without a
 * srcset, so the preloaded file is the one used.
 */
export const HERO_PHOTOS = {
  '/': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
  '/strength': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&auto=format&fit=crop&q=80',
  '/zumba': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1600&auto=format&fit=crop&q=80'
} as const;

export const HIGH_FETCH_PRIORITY = { fetchpriority: 'high' } as Record<string, string>;

/**
 * A srcset for an Unsplash photo URL (its ?w= sets the width the CDN sends), so phones download a
 * smaller file than desktops. The URL's own width is the fallback src.
 */
export function unsplashSrcSet(url: string, widths: number[]): string {
  return widths.map(w => `${url.replace(/([?&])w=\d+/, `$1w=${w}`)} ${w}w`).join(', ');
}
