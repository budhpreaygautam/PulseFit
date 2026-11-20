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

/** App mode on a phone-sized page (an e2e build honours the test-only switch); call before page.goto. */
export async function useAppMode(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem('pulsefit_test_app_mode', '1'));
}

/** The app's bottom tabs, and its menu drawer (app mode). */
export const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Tabs' });
export const appDrawer = (page: Page) => page.getByRole('dialog', { name: 'Menu' });

/** Emulates a phone's safe-area insets; false when this Chromium cannot. Call after setting the viewport, which resets them. */
export async function emulateInsets(page: Page, insets: Record<string, number>): Promise<boolean> {
  const cdp = (await page.context().newCDPSession(page)) as unknown as { send(method: string, params: object): Promise<unknown> };
  return cdp.send('Emulation.setSafeAreaInsetsOverride', { insets }).then(() => true, () => false);
}

type Point = { x: number; y: number };

/**
 * Drags one finger from `from` to `to` in `steps` touch moves (CDP touch events, as a phone sends them).
 * With `release: false` the finger stays down; call the returned function to lift it.
 */
export async function touchDrag(page: Page, from: Point, to: Point, { steps = 8, release = true } = {}): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', at?: Point) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: at ? [at] : [] });
  };
  await touch('touchStart', from);
  for (let i = 1; i <= steps; i++) await touch('touchMove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  const lift = () => touch('touchEnd');
  if (release) await lift();
  return lift;
}

/** An APK to offer, as GET /api/config reports one (androidApp); the test server has none. */
export const APP = { url: '/downloads/pulsefit.apk', version: '2.2.0', size: 24 * 1024 * 1024 };

/** Answer GET /api/config with an APK to offer (or none). */
export async function offerApp(
  page: Page,
  androidApp: { url: string; version?: string; versionCode?: number; size: number } | null = APP
): Promise<void> {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, data: { ...body.data, androidApp } } });
  });
}

declare global {
  interface Window {
    /** Counts document.startViewTransition calls (countTransitions). */
    __vt?: number;
    /** The latest view transition's animations, as "pseudo-element animation-name" (countTransitions). */
    __vtAnimations?: string[];
  }
}

/**
 * Count document.startViewTransition calls from page load on; read them with `transitions`, and the
 * latest one's animations with `transitionAnimations`.
 */
export async function countTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__vt = 0;
    const start = Document.prototype.startViewTransition;
    if (!start) return;
    Document.prototype.startViewTransition = function (this: Document, ...args: Parameters<typeof start>) {
      window.__vt = (window.__vt ?? 0) + 1;
      const transition = start.apply(this, args);
      // Once ready, the pseudo-elements exist and their animations run.
      transition.ready.then(
        () => (window.__vtAnimations = document.getAnimations().map(a => `${(a.effect as KeyframeEffect | null)?.pseudoElement} ${(a as CSSAnimation).animationName}`)),
        () => undefined
      );
      return transition;
    };
  });
}
export const transitions = (page: Page) => page.evaluate(() => window.__vt ?? 0);
export const transitionAnimations = (page: Page) => page.evaluate(() => window.__vtAnimations ?? []);

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
