import { expect, APIRequestContext, Page } from '@playwright/test';
import { signInAs, test, trackConsoleErrors, useSession } from './helpers';

// The training plans, diet charts, supplements guide (/guide) and the strength split (/strength)
// come with a plan. Both pages need an account (see access.spec.ts for guests); a member without a
// plan (a new account, or one whose plan has ended) gets a teaser and a way to choose a plan, and
// the full content is never sent to them: GET /api/guide answers 403 PLAN_REQUIRED.

// Lines that only the full guide holds (server/src/content/guide.ts).
const PLAN_EXERCISE = 'Barbell Flat Bench Press';
const MEAL = 'Oats & High-Protein Fuel Bowl';
const SUPPLEMENT = 'Creatine Monohydrate (Creapure®)';
const SPLIT_EXERCISE = 'Barbell bench press 4×8';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Every answer the page gets for the full guide. */
function guideResponses(page: Page): number[] {
  const statuses: number[] = [];
  page.on('response', r => {
    if (new URL(r.url()).pathname === '/api/guide') statuses.push(r.status());
  });
  return statuses;
}

/** A new account, as signing up makes it: no plan yet (pending). Removed again by `remove`. */
async function newAccount(request: APIRequestContext) {
  const email = `guide-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await request.post('/api/auth/register', { data: { name: 'Isha Nair', gender: 'female', email, password: 'Lift-2026-now' } });
  expect(res.status(), await res.text()).toBe(201);
  const { token, user } = (await res.json()).data;
  expect(user).toMatchObject({ membership_status: 'pending', membership_tier: 'none' });
  const remove = async () => {
    const admin = (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token as string;
    await request.delete(`/api/members/${user.id}`, { headers: auth(admin) });
  };
  return { token: token as string, id: user.id as string, remove };
}

test('a member without a plan sees the teaser and "Choose a plan", and the server sends none of the guide', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  const account = await newAccount(request);
  try {
    expect((await request.get('/api/guide', { headers: auth(account.token) })).status()).toBe(403);
    await useSession(page, account.token);
    const statuses = guideResponses(page);
    await page.goto('/guide');
    const main = page.getByRole('main');

    // The intro and the section tabs stay.
    await expect(main.getByRole('heading', { level: 1, name: 'TRAINING PLANS, DIETS & SUPPLEMENTS' })).toBeVisible();
    await expect(main.getByRole('tab')).toHaveCount(3);

    // Workout plans: names and one line each, then the way to a plan. No day-by-day table.
    const panel = main.getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: '5-Day Push / Pull / Legs (PPL)' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Choose a plan to open the full workout plans' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: /^Sign in/ })).toHaveCount(0);
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(main).not.toContainText(PLAN_EXERCISE);
    expect(statuses).toEqual([403]);

    await main.getByRole('tab', { name: 'Diet & meal charts' }).click();
    await expect(panel.getByRole('heading', { name: 'Pure Vegetarian High-Protein Plan' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Choose a plan to open the full diet charts' })).toBeVisible();
    await expect(main).not.toContainText(MEAL);
    await expect(main).not.toContainText('kcal');

    await main.getByRole('tab', { name: 'Supplements guide' }).click();
    await expect(panel.getByRole('heading', { name: 'Creatine monohydrate' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Choose a plan to read the full supplements guide' })).toBeVisible();
    await expect(main).not.toContainText(SUPPLEMENT);
    await expect(main).not.toContainText('Standard Dose');

    // "Choose a plan" opens Memberships.
    await panel.getByRole('button', { name: 'Choose a plan' }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole('heading', { level: 1, name: 'CHOOSE YOUR PLAN' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await account.remove();
  }
});

test('a plan bought while signed in opens the full guide without a reload', async ({ page, request }) => {
  const account = await newAccount(request);
  try {
    await useSession(page, account.token);
    await page.goto('/guide');
    await page.evaluate(() => ((window as unknown as { notReloaded: boolean }).notReloaded = true));
    const panel = page.getByRole('main').getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: 'Choose a plan to open the full workout plans' })).toBeVisible();

    // The front desk activates a plan (as a payment does); the app's next look at the account picks it up.
    const admin = (await (await request.post('/api/auth/demo-login', { data: { role: 'admin' } })).json()).data.token as string;
    const granted = await request.put(`/api/members/${account.id}`, { headers: auth(admin), data: { membership_tier: 'basic', membership_status: 'active', membership_expiry: '2099-12-31' } });
    expect(granted.ok(), await granted.text()).toBeTruthy();
    // My account re-reads the account (refreshUser) when it opens; back on the guide, it loads in full.
    const me = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/me');
    await page.getByRole('banner').getByRole('link', { name: /^My account \(/ }).click();
    await expect(page).toHaveURL(/\/profile$/);
    expect((await (await me).json()).data.membership_status).toBe('active');
    const guide = page.waitForResponse(r => new URL(r.url()).pathname === '/api/guide');
    await page.goBack();
    expect((await guide).status()).toBe(200);
    await expect(panel.getByRole('table').first()).toContainText(PLAN_EXERCISE);
    await expect(panel.getByRole('heading', { name: /^Choose a plan/ })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded)).toBe(true);
  } finally {
    await account.remove();
  }
});

test('signing in on /guide shows the full content without a reload', async ({ page }) => {
  await page.goto('/guide');
  await page.evaluate(() => ((window as unknown as { notReloaded: boolean }).notReloaded = true));
  await expect(page.getByRole('heading', { name: 'Please sign in' })).toBeVisible();

  // The sign-in dialog opens by itself.
  const dialog = page.getByRole('dialog');
  await dialog.locator('#auth-email').fill('member@pulsefit.com');
  await dialog.locator('#auth-password').fill('pulse123');
  const guide = page.waitForResponse(r => new URL(r.url()).pathname === '/api/guide');
  await dialog.locator('button[type="submit"]').click();
  expect((await guide).status()).toBe(200);
  await expect(dialog).toBeHidden();

  await expect(page).toHaveURL(/\/guide$/);
  const panel = page.getByRole('main').getByRole('tabpanel');
  await expect(panel.getByRole('table').first()).toContainText(PLAN_EXERCISE);
  await expect(panel.getByRole('heading', { name: /^(Sign in|Choose a plan)/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded)).toBe(true);
});

test('a member with an active plan reads every section of the guide', async ({ page, request }) => {
  const errors = trackConsoleErrors(page);
  await signInAs(page, request, 'member');
  const statuses = guideResponses(page);
  await page.goto('/guide');
  const main = page.getByRole('main');
  const panel = main.getByRole('tabpanel');

  await expect(panel.getByRole('heading', { level: 2, name: '5-Day Push / Pull / Legs (PPL)' })).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(5);
  await expect(panel.getByRole('table').first()).toContainText(PLAN_EXERCISE);
  await panel.getByRole('button', { name: /4-Day Upper \/ Lower Strength Split/ }).click();
  await expect(panel.getByRole('heading', { level: 2, name: '4-Day Upper / Lower Strength Split' })).toBeVisible();
  await expect(panel.getByRole('table')).toHaveCount(4);

  await main.getByRole('tab', { name: 'Diet & meal charts' }).click();
  await expect(panel.getByRole('heading', { name: MEAL })).toBeVisible();
  // The day's total is added up from the meals: 650 + 320 + 850 + 380 + 280 + 520.
  await expect(panel.getByText('≈ 3,000 kcal a day')).toBeVisible();
  await expect(panel.getByText('Drink 3.5 to 4.5 Liters of water daily', { exact: false })).toBeVisible();

  await main.getByRole('tab', { name: 'Supplements guide' }).click();
  await expect(panel.getByRole('heading', { name: SUPPLEMENT })).toBeVisible();
  await expect(panel.getByText('3g to 5g daily (consistent every day)')).toBeVisible();

  await expect(main.getByRole('heading', { name: /^(Sign in|Choose a plan)/ })).toHaveCount(0);
  expect(statuses).toEqual([200]);
  expect(errors).toEqual([]);
});

test('the strength split comes with a plan: its days for a member without one, everything for a coach', async ({ page, request }) => {
  const account = await newAccount(request);
  try {
    await useSession(page, account.token);
    const statuses = guideResponses(page);
    await page.goto('/strength');
    const main = page.getByRole('main');
    // The page itself: the floor, the classes and the split's days.
    await expect(main.getByRole('heading', { name: "WHAT YOU'LL TRAIN WITH" })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'A 4-DAY BODY-PART SPLIT' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Chest & triceps' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Choose a plan to see the full split' })).toBeVisible();
    await expect(main).not.toContainText(SPLIT_EXERCISE);
    await expect(main.getByRole('button', { name: 'Log this workout' })).toHaveCount(0);
    expect(statuses).toEqual([403]);
    await main.getByRole('button', { name: 'Choose a plan' }).click();
    await expect(page).toHaveURL(/\/pricing\?plan=basic$/);
  } finally {
    await account.remove();
  }

  await signInAs(page, request, 'trainer');
  await page.goto('/strength');
  const main = page.getByRole('main');
  await expect(main.getByText(SPLIT_EXERCISE)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Log this workout' })).toHaveCount(4);
  await expect(main.getByRole('heading', { name: 'Choose a plan to see the full split' })).toHaveCount(0);
});
