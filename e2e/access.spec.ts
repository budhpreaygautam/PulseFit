import { expect, APIRequestContext, Page, Response } from '@playwright/test';
import { test, trackConsoleErrors } from './helpers';

// The six service pages need an account. A guest following a link to one stays where they are and
// gets the sign-in dialog; after signing in they land on the page. Opened by its address, a service
// page shows only "Please sign in" (with the dialog open): the page itself is never put on screen,
// so removing the dialog reveals nothing, and no answer the browser receives holds its data.

const SERVICE_PAGES = [
  { label: 'Strength Floor', path: '/strength', heading: /^BUILD REAL STRENGTH/ },
  { label: 'Zumba Studio', path: '/zumba', heading: /^DANCE\. SWEAT\./ },
  { label: 'Plans & Diets', path: '/guide', heading: 'TRAINING PLANS, DIETS & SUPPLEMENTS' },
  { label: 'Timetable', path: '/schedule', heading: 'BOOK A CLASS' },
  { label: 'Memberships', path: '/pricing', heading: 'CHOOSE YOUR PLAN' },
  { label: 'Coaches', path: '/coaches', heading: 'MEET THE COACHES' }
];

/** A header link: an icon in the main row on a desktop, a labelled link in the menu on a phone. */
async function headerLink(page: Page, label: string, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    return page.locator('#mobile-menu').getByRole('link', { name: label, exact: true });
  }
  return page.getByRole('banner').getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true });
}

async function signInFromDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('#auth-email').fill('member@pulsefit.com');
  await dialog.locator('#auth-password').fill('pulse123');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
}

for (const { label, path, heading } of SERVICE_PAGES) {
  test(`a guest following "${label}" in the header gets the sign-in dialog, then lands on ${path}`, async ({ page, isMobile }) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/');
    await expect(page.locator('main h1')).toBeVisible();

    await (await headerLink(page, label, isMobile)).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Sign in to PulseFit' })).toBeVisible();
    // No navigation: still the home page, and the service page is not behind the dialog.
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('heading', { level: 1, name: heading })).toHaveCount(0);

    await signInFromDialog(page);
    await expect(page).toHaveURL(url => url.pathname === path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('the footer and the home page buttons ask a guest to sign in too, and closing the dialog stays put', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  const footer = page.getByRole('contentinfo');
  const dialog = page.getByRole('dialog');
  for (const link of [
    footer.getByRole('link', { name: 'Class timetable' }),
    footer.getByRole('link', { name: 'Become a member' }),
    main.getByRole('button', { name: 'View the timetable' }),
    main.getByRole('button', { name: 'Explore the strength floor' }),
    main.getByRole('button', { name: 'Explore the Zumba studio' }),
    main.getByRole('button', { name: /Read the guides/ }),
    main.getByRole('button', { name: /^All coaches/ }),
    main.getByRole('button', { name: /^See the / }).first()
  ]) {
    await link.click();
    await expect(dialog.getByRole('heading', { name: 'Sign in to PulseFit' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  await expect(page.locator('main h1')).toBeVisible();
});

/** Text only the service pages show, as a signed-in account receives it. */
async function serviceDetails(request: APIRequestContext): Promise<string[]> {
  const login = await request.post('/api/auth/demo-login', { data: { role: 'vip' } });
  const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
  const get = async (url: string) => (await (await request.get(url, { headers })).json()).data;
  const classes = (await get('/api/classes')) as Array<{ title: string; description: string }>;
  const trainers = (await get('/api/trainers')) as Array<{ bio: string; instagram: string }>;
  const plans = (await get('/api/plans')) as Array<{ description: string; features: string[] }>;
  const guide = await get('/api/guide');
  return [
    ...classes.flatMap(c => [c.title, c.description]),
    ...trainers.flatMap(t => [t.bio, t.instagram]),
    ...plans.flatMap(p => [p.description, ...p.features]),
    ...guide.workout_plans.flatMap((p: { days: Array<{ exercises: Array<{ tip: string }> }> }) => p.days.flatMap(d => d.exercises.map(e => e.tip))),
    ...guide.strength_split.flatMap((d: { exercises: string[] }) => d.exercises)
  ].filter(Boolean);
}

test('a service page opened by its address shows only "Please sign in"; removing the dialog reveals nothing, and no answer holds its data', async ({ page, request }) => {
  const details = await serviceDetails(request);
  expect(details.length).toBeGreaterThan(20);

  for (const { path, heading } of SERVICE_PAGES) {
    const responses: Response[] = [];
    const onResponse = (r: Response) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) responses.push(r);
    };
    page.on('response', onResponse);
    await page.goto(path);
    const dialog = page.getByRole('dialog');
    await expect(page.getByRole('heading', { name: 'Please sign in' })).toBeVisible();
    // The dialog opens by itself.
    await expect(dialog.getByRole('heading', { name: 'Sign in to PulseFit' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    page.off('response', onResponse);

    // As an attacker would in DevTools: take the dialog out of the page. Nothing was behind it.
    await page.evaluate(() => document.querySelectorAll('[role="dialog"]').forEach(el => el.remove()));
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toHaveCount(0);
    await expect(page.locator('#day-panel, [role="grid"], [role="tabpanel"]')).toHaveCount(0);
    const text = await page.locator('body').innerText();
    for (const detail of details) expect(text, `${path}: ${detail}`).not.toContain(detail);

    // Nothing the browser was sent holds the page's data: the service APIs were not even asked.
    const asked = responses.map(r => new URL(r.url()).pathname);
    for (const api of ['/api/guide', '/api/classes', '/api/trainers', '/api/plans', '/api/bookings/my']) expect(asked, path).not.toContain(api);
    for (const r of responses) {
      const body = await r.text().catch(() => '');
      for (const detail of details) expect(body, `${path} ${r.url()}: ${detail}`).not.toContain(detail);
    }
  }
});

test('after signing in from a service page opened by its address, that page opens', async ({ page }) => {
  await page.goto('/schedule?category=Zumba%20%26%20Cardio');
  await expect(page.getByRole('heading', { name: 'Please sign in' })).toBeVisible();
  await signInFromDialog(page);
  await expect(page).toHaveURL(url => url.pathname === '/schedule' && url.searchParams.get('category') === 'Zumba & Cardio');
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zumba & Cardio', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a browser that blocks web storage (cookies allowed) can still sign in and open the service pages', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }
      });
    }
  });
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();
  await signInFromDialog(page);
  await expect(page).toHaveURL(url => url.pathname === '/dashboard');

  await (await headerLink(page, 'Timetable', isMobile)).click();
  await expect(page).toHaveURL(url => url.pathname === '/schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'BOOK A CLASS' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
