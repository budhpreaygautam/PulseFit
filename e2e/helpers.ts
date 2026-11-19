import { test as base, expect, Page, APIRequestContext } from '@playwright/test';

export type Persona = 'member' | 'vip' | 'trainer' | 'admin';

/** The header the website and the apps send on every API request; without it the API answers 404. */
export const APP_HEADER = { 'X-Requested-With': 'PulseFit' };

/**
 * Playwright's test, with the `request` fixture (direct API calls) sending APP_HEADER like the app.
 * Browser pages get no extra header: they must work with what the app itself sends. Specs import
 * `test` from here.
 */
export const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: APP_HEADER });
    await use(request);
    await request.dispose();
  }
});

/**
 * Sign the page's browser context in with a token, as the website itself is signed in: the
 * httpOnly session cookie plus the "signed in" marker the app checks on load. All pages of a
 * context share the cookie, so a second user needs a context of its own.
 */
export async function useSession(page: Page, token: string): Promise<void> {
  await page.context().addCookies([{ name: 'pulsefit_session', value: token, domain: 'localhost', path: '/api', httpOnly: true, sameSite: 'Lax' }]);
  await page.addInitScript(() => window.localStorage.setItem('pulsefit_signed_in', '1'));
}

/** Sign in through the demo endpoint before the app boots; returns the token for API calls. */
export async function signInAs(page: Page, request: APIRequestContext, role: Persona): Promise<string> {
  const res = await request.post('/api/auth/demo-login', { data: { role } });
  expect(res.ok()).toBeTruthy();
  const { data } = await res.json();
  await useSession(page, data.token);
  return data.token as string;
}

/** The bearer header for direct API calls made as someone else than the page's session. */
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * A new member with one free month of Basic, made by the demo admin and signed in with its temporary
 * password: rewards specs count points and gifts on it, never on the seeded personas.
 */
export async function freshMember(request: APIRequestContext, label: string): Promise<{ id: string; email: string; token: string; adminToken: string }> {
  const admin = await request.post('/api/auth/demo-login', { data: { role: 'admin' } });
  expect(admin.ok()).toBeTruthy();
  const adminToken = (await admin.json()).data.token as string;
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}@example.com`;
  const created = await request.post('/api/members', {
    headers: auth(adminToken),
    data: { name: `E2E ${label}`.slice(0, 60), email, membership_tier: 'basic', expiry_months: 1 }
  });
  expect(created.status(), await created.text()).toBe(201);
  const { member, tempPassword } = (await created.json()).data;
  const login = await request.post('/api/auth/login', { data: { email, password: tempPassword } });
  expect(login.ok(), await login.text()).toBeTruthy();
  return { id: member.id, email, token: (await login.json()).data.token, adminToken };
}

/** Collect uncaught page errors and console errors (ignoring blocked remote images/fonts). */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource|net::ERR/.test(text)) return;
    errors.push(text);
  });
  return errors;
}
