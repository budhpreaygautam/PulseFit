import { GymContact } from '../types/index.js';

// The gym's phone, WhatsApp, email and social pages: one setting admins edit (GET/PUT /gym/contact),
// served to the website and the apps with GET /config, and used in the structured data (seo.ts) and
// the enquiry emails.

/** Each network's home page. */
export const SOCIAL_HOMES = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  youtube: 'https://www.youtube.com/',
  x: 'https://x.com/'
};

/**
 * What the website showed before the setting existed (client/src/components/public/gymInfo.ts;
 * tests/seo.test.ts fails when they drift apart). The social links start as each network's home page\n * (the owner's choice until the gym enters its own pages; an admin clears one to hide its icon).
 */
export const defaultGymContact = (): GymContact => ({
  phone: '+919811078573',
  whatsapp: '',
  email: 'contact@pulsefit.in',
  ...SOCIAL_HOMES
});

/** Each network's own sites: a link must be on one of them or a subdomain (www., m. from a phone, web.). */
export const SOCIAL_HOSTS = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  youtube: ['youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com']
} as const;

/**
 * An Indian mobile or landline number in any common spelling (98110 78573, +91 98110 78573,
 * 098110 78573, 0124 456 7890), as +91 and its 10 digits; null when it is not one.
 */
export function indianPhone(value: string): string | null {
  const national = /^(?:\+91|91|0)?([1-9]\d{9})$/.exec(value.replace(/[\s()-]/g, ''))?.[1];
  return national ? `+91${national}` : null;
}

/** Whether a link is an https:// address on one of these sites (the home page included). */
export function isLinkOn(link: string, hosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  const host = url.hostname;
  const onSite = hosts.some(site => host === site || host.endsWith(`.${site}`));
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && onSite;
}
