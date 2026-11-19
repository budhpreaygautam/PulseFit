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
