import { expect, Page, APIRequestContext } from '@playwright/test';

export type Persona = 'member' | 'vip' | 'trainer' | 'admin';

/** Sign in through the demo endpoint and store the token before the app boots. */
export async function signInAs(page: Page, request: APIRequestContext, role: Persona): Promise<string> {
  const res = await request.post('/api/auth/demo-login', { data: { role } });
  expect(res.ok()).toBeTruthy();
  const { data } = await res.json();
  await page.addInitScript(token => window.localStorage.setItem('pulsefit_token', token), data.token);
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
