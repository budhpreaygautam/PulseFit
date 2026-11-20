import { expect } from '@playwright/test';
import { auth, signInAs, test } from './helpers';

// Admin › Plans & rewards › Gym contact: the phone, WhatsApp, email and social links the website
// shows, changed by an admin without a release. The database is shared, so the test that changes
// them puts the starting values back.

const DEFAULTS = { phone: '+919811078573', whatsapp: '', email: 'contact@pulsefit.in', instagram: '', facebook: '', youtube: '', x: '' };

test('an admin saves new contact details, and the website footer and Contact page show them', async ({ page, request }) => {
  const token = await signInAs(page, request, 'admin');
  try {
    await page.goto('/admin/plans?section=contact');
    const panel = page.getByRole('tabpanel');
    await panel.getByLabel('Phone', { exact: true }).fill('0124 456 7890');
    await panel.getByLabel('WhatsApp number', { exact: true }).fill('98110 55555');
    await panel.getByLabel('Email', { exact: true }).fill('desk@pulsefit.example');
    await panel.getByLabel('Instagram', { exact: true }).fill('https://www.instagram.com/pulsefit.e2e');
    await panel.getByLabel('YouTube', { exact: true }).fill('');
    await panel.getByRole('button', { name: 'Save contact details' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Gym contact details saved.' })).toBeVisible();
    // The phone comes back in the one form the server stores.
    await expect(panel.getByLabel('Phone', { exact: true })).toHaveValue('+911244567890');

    // A new page load reads the new details from /api/config.
    await page.goto('/contact');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: '+91 12445 67890' })).toHaveAttribute('href', 'tel:+911244567890');
    await expect(footer.getByRole('link', { name: 'desk@pulsefit.example' })).toHaveAttribute('href', 'mailto:desk@pulsefit.example');
    await expect(footer.getByText('+91 98110 78573')).toHaveCount(0);
    const instagram = footer.getByRole('link', { name: 'PulseFit on Instagram' });
    await expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/pulsefit.e2e');
    await expect(instagram).toHaveAttribute('target', '_blank');
    await expect(instagram).toHaveAttribute('rel', 'noopener noreferrer');
    // Empty links show no icon.
    await expect(footer.getByRole('link', { name: /^PulseFit on / })).toHaveCount(1);

    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: '+91 12445 67890' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', 'https://wa.me/919811055555');
  } finally {
    const reset = await request.put('/api/gym/contact', { headers: auth(token), data: DEFAULTS });
    expect(reset.ok(), await reset.text()).toBeTruthy();
  }
});

test('without a WhatsApp number or links there is no WhatsApp button and no social icon', async ({ page }) => {
  await page.goto('/contact');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: '+91 98110 78573' })).toBeVisible();
  await expect(footer.getByRole('link', { name: /^PulseFit on / })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'WhatsApp us' })).toHaveCount(0);
});

test('only admins can read or change the contact details', async ({ page, request }) => {
  for (const role of ['member', 'trainer'] as const) {
    const login = await request.post('/api/auth/demo-login', { data: { role } });
    const token = (await login.json()).data.token as string;
    expect((await request.get('/api/gym/contact', { headers: auth(token) })).status(), role).toBe(403);
    expect((await request.put('/api/gym/contact', { headers: auth(token), data: { ...DEFAULTS, phone: '98110 12345' } })).status(), role).toBe(403);
  }
  expect((await request.get('/api/gym/contact')).status()).toBe(401);
  expect((await (await request.get('/api/config')).json()).data.gym.contact).toEqual(DEFAULTS);

  await signInAs(page, request, 'member');
  await page.goto('/admin/plans?section=contact');
  await expect(page.getByRole('heading', { name: "This page isn't for your account" })).toBeVisible();
  await expect(page.getByLabel('WhatsApp number', { exact: true })).toHaveCount(0);
});
