import crypto from 'crypto';
import { test, expect, APIRequestContext } from '@playwright/test';
import { trackConsoleErrors } from './helpers';

// Two-step sign-in on the website: switch it on in My account, then sign in with a code.

const PASSWORD = 'Lane-Test-Pass-42';

function base32Decode(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/\s+/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The authenticator-app code for a 30-second step (offset from now). */
function totp(secret: string, offset = 0): string {
  const step = Math.floor(Date.now() / 30_000) + offset;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function adminToken(request: APIRequestContext): Promise<string> {
  return (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token;
}

test('a member switches on two-step sign-in, then signs in with a code; no token is kept in localStorage', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const email = `mfa-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const reg = await request.post('/api/auth/register', { data: { name: 'Mfa Lane', email, password: PASSWORD } });
  expect(reg.status(), await reg.text()).toBe(201);
  const userId = (await reg.json()).data.user.id as string;

  try {
    // Sign in through the real form: the website gets the httpOnly cookie, never a token in storage.
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email address').fill(email);
    await dialog.getByLabel('Password').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog).toBeHidden();
    const session = (await page.context().cookies()).find(c => c.name === 'pulsefit_session');
    expect(session?.httpOnly).toBe(true);
    expect(await page.evaluate(() => Object.keys(window.localStorage).filter(k => /token|session/i.test(k)))).toEqual([]);

    // Switch it on in My account.
    await page.goto('/profile?tab=security');
    await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
    await page.getByLabel('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
    const secret = (await page.locator('p.select-all').first().textContent())!.replace(/\s+/g, '');
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn on', exact: true }).click();
    const codes = page.getByRole('list', { name: 'Backup codes' }).getByRole('listitem');
    await expect(codes).toHaveCount(10);
    const backup = (await codes.first().textContent())!.trim();
    await page.getByRole('button', { name: 'I saved them' }).click();
    await expect(page.getByRole('heading', { name: /Two-step sign-in is on/ })).toBeVisible();

    // Sign out, then back in: the password alone is not enough.
    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.removeItem('pulsefit_signed_in'));
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
    await dialog.getByLabel('Email address').fill(email);
    await dialog.getByLabel('Password').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog.getByRole('heading', { name: 'Enter your sign-in code' })).toBeVisible();
    expect((await page.context().cookies()).some(c => c.name === 'pulsefit_session')).toBe(false);

    await dialog.getByLabel('Sign-in code').fill('000000');
    await dialog.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(dialog.getByText(/That code is not right/)).toBeVisible();

    // A backup code works too (and is used up).
    await dialog.getByLabel('Sign-in code').fill(backup);
    await dialog.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(dialog).toBeHidden();
    expect((await page.context().cookies()).some(c => c.name === 'pulsefit_session')).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    const admin = await adminToken(request);
    await request.delete(`/api/members/${userId}`, { headers: { Authorization: `Bearer ${admin}` } });
  }
});

test('a cookie-authenticated write from another site is refused (CSRF)', async ({ request }) => {
  const admin = await adminToken(request);
  // The cookie alone, without the X-Requested-With header a cross-site form could never add.
  const res = await request.put('/api/auth/profile', { headers: { Cookie: `pulsefit_session=${admin}` }, data: { name: 'Forged' } });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe('CSRF_REJECTED');
});
