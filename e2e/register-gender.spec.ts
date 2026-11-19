import { expect, Page, APIRequestContext } from '@playwright/test';
import { APP_HEADER, test, trackConsoleErrors } from './helpers';

// Signing up with an email asks for a gender, which picks the picture shown until the member
// uploads a photo. The pictures are served by the app itself (client/public/avatars).

const PASSWORD = 'Lift-2026-now';

async function openSignUp(page: Page) {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create an account' }).click();
  await expect(dialog.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  return dialog;
}

/** The new account is removed again, so reruns against the same database start clean. */
async function removeAccount(page: Page, request: APIRequestContext) {
  // The page's own cookies, plus the header the app sends.
  const me = await page.request.get('/api/auth/me', { headers: APP_HEADER });
  if (!me.ok()) return;
  const { data } = await me.json();
  const admin = (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token as string;
  await request.delete(`/api/members/${data.id}`, { headers: { Authorization: `Bearer ${admin}` } });
}

/** The image has loaded (an SVG from the app itself), not just been given an address. */
const loaded = (img: ReturnType<Page['locator']>) => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

test('signing up needs a gender, and the default picture matches the one picked', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const dialog = await openSignUp(page);

  // Right after the name: a labelled dropdown with the three choices after its "Choose…" prompt.
  const select = dialog.getByLabel('Gender', { exact: true });
  await expect(select).toHaveValue('');
  await expect(select.locator('option')).toHaveText(['🚻 Choose…', '♂️ Male', '♀️ Female', '⚧️ Other']);
  const fields = await dialog.locator('#auth-name, #auth-gender, #auth-email').evaluateAll(els => els.map(el => el.id));
  expect(fields).toEqual(['auth-name', 'auth-gender', 'auth-email']);

  await dialog.locator('#auth-name').fill('Riya Kapoor');
  await dialog.locator('#auth-email').fill(`gender-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await dialog.locator('#auth-password').fill(PASSWORD);

  // Without a gender the form says so in place, like the other fields, and sends nothing.
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.locator('#auth-gender-error')).toHaveText('Choose your gender.');
  await expect(select).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();

  await select.selectOption('female');
  await expect(select).toHaveValue('female');
  await expect(dialog.locator('#auth-gender-error')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog).toBeHidden();

  try {
    // No photo yet: the account button shows the female default picture.
    const account = page.getByRole('link', { name: 'My account (Riya Kapoor)' });
    const navPicture = account.locator('img');
    await expect(navPicture).toHaveAttribute('src', /\/avatars\/female\.svg$/);
    await expect.poll(() => loaded(navPicture)).toBe(true);

    // My account shows the same picture and the gender, and changing it changes the picture.
    await account.click();
    const photo = page.getByRole('img', { name: 'Your profile photo' });
    await expect(photo).toHaveAttribute('src', /\/avatars\/female\.svg$/);
    await expect(page.locator('#profile-gender')).toHaveValue('female');
    await page.locator('#profile-gender').selectOption('other');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.toast-message', { hasText: 'Your profile was updated.' })).toBeVisible();
    await expect(photo).toHaveAttribute('src', /\/avatars\/neutral\.svg$/);
    await expect(navPicture).toHaveAttribute('src', /\/avatars\/neutral\.svg$/);
    await expect.poll(() => loaded(photo)).toBe(true);

    expect(errors).toEqual([]);
  } finally {
    await removeAccount(page, request);
  }
});

// The test server has no Google client id and real Google cannot sign in here, so Google is stood
// in for: /api/config offers a client id, the GSI script is a stub whose button hands back a
// credential at once, and /api/auth/google is answered with a real session for one account made
// without a gender (as Google sign-up makes it): by registering it first, by signing in after.
async function fakeGoogle(page: Page, email: string) {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, data: { ...body.data, googleClientId: 'e2e.apps.googleusercontent.com' } } });
  });
  await page.route('https://accounts.google.com/gsi/client', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `let cb; window.google = { accounts: { id: {
        initialize: o => { cb = o.callback; },
        renderButton: el => { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Google stub'; b.onclick = () => cb({ credential: 'e2e' }); el.replaceChildren(b); }
      } } };`
    })
  );
  let created = true;
  await page.route('**/api/auth/google', async route => {
    const url = new URL(created ? '/api/auth/register' : '/api/auth/login', route.request().url()).href;
    const postData = JSON.stringify(created ? { name: 'Gita Rao', email, password: PASSWORD } : { email, password: PASSWORD });
    const response = await route.fetch({ url, postData });
    const body = await response.json();
    // No message: from Google, a message means an existing account was linked.
    await route.fulfill({ response, status: 200, json: { ...body, message: undefined, data: { ...body.data, created } } });
    created = false;
  });
}

test('a new Google account is sent to My account to choose a gender; a returning one is not', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await fakeGoogle(page, `google-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  const dialog = await openSignUp(page);
  await dialog.getByRole('button', { name: 'Google stub' }).click();

  try {
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('.toast-title', { hasText: 'Welcome to PulseFit, Gita!' })).toBeVisible();
    await expect(page.locator('.toast-message', { hasText: 'Choose your gender under Personal details to pick your profile picture.' })).toBeVisible();
    await expect(page.locator('#profile-gender')).toHaveValue('');

    // Signed out and back in with Google: same account, still no gender, but no detour.
    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Google stub' }).click();
    await expect(page.locator('.toast-message', { hasText: 'Welcome back, Gita!' })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).not.toHaveURL(/\/profile$/);
    await expect(page.locator('.toast-message', { hasText: 'Choose your gender' })).toHaveCount(0);

    expect(errors).toEqual([]);
  } finally {
    await removeAccount(page, request);
  }
});

test('the gender dropdown fits a 360px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const dialog = await openSignUp(page);
  const box = (await dialog.getByLabel('Gender', { exact: true }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
