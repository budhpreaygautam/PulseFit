import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { signInAs } from './helpers';

// Front-desk and admin screens: the fixes from the staff bug-fix round. Every test creates the
// members and classes it needs and removes them again, so the shared database stays as seeded.

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Created {
  id: string;
  name: string;
  email: string;
  password: string;
}

/** Today in gym time (IST), as YYYY-MM-DD. */
function gymToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function createMember(request: APIRequestContext, admin: string, name: string, tier: string, months: number): Promise<Created> {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`;
  const res = await request.post('/api/members', { headers: auth(admin), data: { name, email, membership_tier: tier, expiry_months: months } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { member, tempPassword } = (await res.json()).data;
  return { id: member.id, name, email, password: tempPassword };
}

async function removeMembers(request: APIRequestContext, admin: string, members: Created[]) {
  for (const m of members) await request.delete(`/api/members/${m.id}`, { headers: auth(admin) });
}

async function bookAs(request: APIRequestContext, member: Created, classId: string) {
  const login = await request.post('/api/auth/login', { data: { email: member.email, password: member.password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  const token = (await login.json()).data.token as string;
  const occurrence = (await (await request.get(`/api/classes/${classId}`, { headers: auth(token) })).json()).data as { occurrence_date: string };
  const res = await request.post('/api/bookings', { headers: auth(token), data: { class_id: classId, booking_date: occurrence.occurrence_date } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function openEditMember(page: Page, name: string) {
  await page.goto('/admin/members');
  await page.locator('#member-search').fill(name);
  await page.locator('#member-search').press('Enter');
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  return page.getByRole('dialog', { name: `Edit ${name}` });
}

const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' });

/** WCAG contrast of an element's text against the colours painted behind it. */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate(el => {
    const parse = (c: string) => {
      const n = (c.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number);
      return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
    };
    const layers: { r: number; g: number; b: number; a: number }[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (bg.a >= 1) break;
    }
    let base = { r: 255, g: 255, b: 255 };
    for (const l of layers.reverse()) base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const fg = lum(parse(getComputedStyle(el).color));
    const bg = lum(base);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
}

test.describe('edit member form', () => {
  test('an active member cannot be left without a plan, and the reason shows under Plan', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff Tier'), 'basic', 1);
    try {
      const puts: string[] = [];
      page.on('request', r => r.method() === 'PUT' && r.url().includes('/api/members/') && puts.push(r.url()));
      const dialog = await openEditMember(page, member.name);
      await dialog.locator('#edit-tier').selectOption('none');
      await dialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(dialog.locator('#edit-tier-error')).toHaveText('Choose a plan for an active membership.');
      await expect(dialog.locator('#edit-tier')).toHaveAttribute('aria-describedby', 'edit-tier-error');
      expect(puts).toEqual([]);
    } finally {
      await removeMembers(request, admin, [member]);
    }
  });

  test('a server error about a field the form does not show appears as a form error', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff Issue'), 'basic', 1);
    try {
      await page.route('**/api/members/*', route =>
        route.request().method() === 'PUT'
          ? route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'email: Not allowed here.', code: 'VALIDATION_ERROR', data: { issues: [{ path: 'email', message: 'Not allowed here.' }] } })
            })
          : route.continue()
      );
      const dialog = await openEditMember(page, member.name);
      await dialog.locator('#edit-name').fill(`${member.name} X`);
      await dialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(dialog.getByRole('alert')).toContainText('email: Not allowed here.');
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await removeMembers(request, admin, [member]);
    }
  });

  test('a plan change also sends the status shown, so a lapsed member stays as shown', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff Plan'), 'basic', 1);
    try {
      const dialog = await openEditMember(page, member.name);
      await dialog.locator('#edit-tier').selectOption('pro');
      await expect(dialog.getByRole('note')).toContainText('Changing the plan cancels upcoming bookings');
      const [put] = await Promise.all([
        page.waitForRequest(r => r.method() === 'PUT' && r.url().endsWith(`/api/members/${member.id}`)),
        dialog.getByRole('button', { name: 'Save changes' }).click()
      ]);
      expect(put.postDataJSON()).toEqual({ membership_tier: 'pro', membership_status: 'active' });
      await expect(dialog).toBeHidden();
      await expect(toasts(page)).toContainText(`${member.name} was updated.`);
    } finally {
      await removeMembers(request, admin, [member]);
    }
  });

  test('a member whose plan ran out (shown Expired) can have the plan changed without a new expiry', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff Lapsed'), 'basic', 1);
    try {
      // A plan that ran out is stored as active with a past expiry, and the list shows it as Expired.
      // The API cannot create that state on purpose, so the list answer is rewritten to show it.
      const lapsedOn = `${Number(gymToday().slice(0, 4)) - 1}-12-31`;
      await page.route(
        url => url.pathname === '/api/members',
        async route => {
          if (route.request().method() !== 'GET') return route.continue();
          const response = await route.fetch();
          const body = await response.json();
          body.data = body.data.map((u: { id: string }) => (u.id === member.id ? { ...u, membership_status: 'expired', membership_expiry: lapsedOn } : u));
          return route.fulfill({ response, json: body });
        }
      );
      const dialog = await openEditMember(page, member.name);
      await expect(dialog.locator('#edit-status')).toHaveValue('expired');
      await dialog.locator('#edit-tier').selectOption('pro');
      const [response] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(`/api/members/${member.id}`)),
        dialog.getByRole('button', { name: 'Save changes' }).click()
      ]);
      expect(response.request().postDataJSON()).toEqual({ membership_tier: 'pro', membership_status: 'expired' });
      expect(response.status()).toBe(200);
      expect((await response.json()).data).toMatchObject({ membership_tier: 'pro', membership_status: 'expired' });
      await expect(dialog).toBeHidden();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await removeMembers(request, admin, [member]);
    }
  });

  test('a new date on a member shown Expired is flagged, and one click sets the status Active', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff Renew'), 'basic', 1);
    try {
      // Shown as Expired with a date that has passed, as after a plan runs out.
      const year = Number(gymToday().slice(0, 4));
      const lapse = await request.put(`/api/members/${member.id}`, { headers: auth(admin), data: { membership_status: 'expired', membership_expiry: `${year - 1}-12-31` } });
      expect(lapse.ok(), await lapse.text()).toBeTruthy();
      const future = `${year + 1}-06-30`;
      const save = (dialog: ReturnType<Page['getByRole']>) =>
        Promise.all([
          page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(`/api/members/${member.id}`)),
          dialog.getByRole('button', { name: 'Save changes' }).click()
        ]).then(([response]) => response);

      let dialog = await openEditMember(page, member.name);
      // The phone card says the membership ended, rather than "until" a date in the past.
      const cardText = (await page.locator('ul li').filter({ hasText: member.email }).textContent()) ?? '';
      expect(cardText).toMatch(/ended .*31 Dec/);
      expect(cardText).not.toContain('until');

      await expect(dialog.locator('#edit-status')).toHaveValue('expired');
      await expect(dialog.getByRole('note')).toHaveCount(0);
      await dialog.locator('#edit-expiry').fill(future);
      await expect(dialog.getByRole('note')).toContainText(`The status is Expired, so ${member.name} cannot check in or book, even with this date.`);

      // Saved as it is, the member stays Expired, and the toast says what that means.
      const first = await save(dialog);
      expect(first.request().postDataJSON()).toEqual({ membership_expiry: future, membership_status: 'expired' });
      expect(first.status()).toBe(200);
      await expect(dialog).toBeHidden();
      await expect(toasts(page)).toContainText(`${member.name} is marked Expired, so they cannot check in or book until the status is Active.`);

      // A phone-only edit is just "updated": the warning follows membership changes only.
      dialog = await openEditMember(page, member.name);
      await dialog.locator('#edit-phone').fill('98765 43210');
      const phoneOnly = await save(dialog);
      expect(phoneOnly.request().postDataJSON()).toEqual({ phone: '98765 43210' });
      await expect(dialog).toBeHidden();
      await expect(toasts(page).getByText(`${member.name} was updated.`, { exact: true })).toBeVisible();

      // The warning offers the fix.
      dialog = await openEditMember(page, member.name);
      await expect(dialog.getByRole('note')).toBeVisible();
      await dialog.getByRole('button', { name: 'Set status to Active' }).click();
      await expect(dialog.locator('#edit-status')).toHaveValue('active');
      await expect(dialog.locator('#edit-status')).toBeFocused();
      await expect(dialog.getByRole('note')).toHaveCount(0);
      const second = await save(dialog);
      expect(second.request().postDataJSON()).toEqual({ membership_status: 'active' });
      expect(second.status()).toBe(200);
      expect((await second.json()).data).toMatchObject({ membership_status: 'active', membership_expiry: future });
      await expect(dialog).toBeHidden();
    } finally {
      await removeMembers(request, admin, [member]);
    }
  });

  test('unfreezing is sent even when the old expiry has passed, and the server answer is shown', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff Unfreeze'), 'basic', 1);
    try {
      expect((await request.put(`/api/members/${member.id}`, { headers: auth(admin), data: { membership_status: 'frozen' } })).ok()).toBeTruthy();
      // Frozen today with an expiry long gone: giving back zero frozen days still leaves it in the past.
      const past = `${Number(gymToday().slice(0, 4)) - 1}-01-31`;
      const setPast = await request.put(`/api/members/${member.id}`, { headers: auth(admin), data: { membership_expiry: past } });
      expect(setPast.ok(), await setPast.text()).toBeTruthy();

      const dialog = await openEditMember(page, member.name);
      await dialog.locator('#edit-status').selectOption('active');
      const [response] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(`/api/members/${member.id}`)),
        dialog.getByRole('button', { name: 'Save changes' }).click()
      ]);
      expect(response.request().postDataJSON()).toEqual({ membership_status: 'active' });
      expect(response.status()).toBe(400);
      await expect(dialog.locator('#edit-expiry-error')).toBeVisible();
    } finally {
      await removeMembers(request, admin, [member]);
    }
  });
});

test('member, class and class-delete edits say how many bookings they cancelled', async ({ page, request }) => {
  test.setTimeout(90_000);
  const admin = await signInAs(page, request, 'admin');
  const trainers = (await (await request.get('/api/trainers')).json()).data as { id: string }[];
  // A Workout & Strength class two days ahead (never a Sunday), inside opening hours.
  const today = gymToday();
  let day = (new Date(`${today}T00:00:00Z`).getUTCDay() + 2) % 7;
  if (day === 0) day = 1;
  const title = unique('Staff Cancel Class');
  const created = await request.post('/api/classes', {
    headers: auth(admin),
    data: { title, category: 'Workout & Strength', trainer_id: trainers[0].id, day_of_week: day, start_time: '07:00', duration_minutes: 60, room: 'Studio E2E', capacity: 10 }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const classId = (await created.json()).data.id as string;

  const strength = await createMember(request, admin, unique('Staff Strength'), 'basic', 1);
  const allAccess = await createMember(request, admin, unique('Staff All'), 'vip', 1);
  const toFreeze = await createMember(request, admin, unique('Staff Freeze'), 'basic', 1);
  try {
    for (const m of [strength, allAccess, toFreeze]) await bookAs(request, m, classId);

    // Freezing a member cancels their booking.
    const dialog = await openEditMember(page, toFreeze.name);
    await dialog.locator('#edit-status').selectOption('frozen');
    await expect(dialog.getByRole('note')).toContainText(`Freezing cancels ${toFreeze.name}'s upcoming class bookings.`);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(toasts(page)).toContainText(`${toFreeze.name} was updated`);
    await expect(toasts(page)).toContainText(/1 upcoming booking was cancelled/);

    // Moving the class to Zumba cancels the Strength Pass member's booking, not the All-Access one.
    await page.goto('/admin/classes');
    await page.getByRole('button', { name: new RegExp(`^Edit ${title}`) }).click();
    const classDialog = page.getByRole('dialog', { name: `Edit ${title}` });
    await classDialog.locator('#class-category').selectOption('Zumba & Cardio');
    await expect(classDialog.getByRole('note')).toContainText('Changing the category cancels upcoming bookings');
    await classDialog.getByRole('button', { name: 'Save class' }).click();
    await expect(classDialog).toBeHidden();
    // The toast fades after a few seconds, so the page notice keeps the count as well.
    const notice = page.getByRole('status').filter({ hasText: `${title} was updated.` });
    await expect(notice).toHaveText(`${title} was updated. 1 upcoming booking was cancelled (1 because the new category is not in those members' plans).`);
    await expect(toasts(page)).toContainText('Bookings cancelled');
    await expect(toasts(page)).toContainText(/1 upcoming booking was cancelled/);

    // Deleting the class cancels the last booking.
    await page.getByRole('button', { name: new RegExp(`^Delete ${title}`) }).click();
    await page.getByRole('dialog', { name: 'Delete this class?' }).getByRole('button', { name: 'Delete class' }).click();
    const deleted = page.getByRole('status').filter({ hasText: `${title} was deleted.` });
    await expect(deleted).toHaveText(`${title} was deleted. 1 upcoming booking was cancelled.`);
    await expect(toasts(page)).toContainText(/1 upcoming booking was cancelled\./);
    // Warning toasts stay until they are read (at least 10 s), so dismiss them: the count is still on the page.
    const dismiss = toasts(page).getByRole('button', { name: 'Dismiss notification' });
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    await expect(toasts(page).getByText(/upcoming booking was cancelled/)).toHaveCount(0);
    await expect(deleted).toHaveText(`${title} was deleted. 1 upcoming booking was cancelled.`);
  } finally {
    await request.delete(`/api/classes/${classId}`, { headers: auth(admin) });
    await removeMembers(request, admin, [strength, allAccess, toFreeze]);
  }
});

test('narrowing a plan asks first, then reports the cancelled bookings', async ({ page, request }) => {
  await signInAs(page, request, 'admin');
  const vip = ((await (await request.get('/api/plans')).json()).data as { id: string; name: string; tier: string; categories: string[] }[]).find(p => p.tier === 'vip')!;
  expect(vip.categories).toEqual([]);
  // The server's answer is stubbed: really narrowing the plan would cancel seeded members' bookings.
  const puts: unknown[] = [];
  await page.route(`**/api/plans/${vip.id}`, route => {
    if (route.request().method() !== 'PUT') return route.continue();
    puts.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { ...vip, categories: ['Workout & Strength'] },
        message: 'Plan updated. 3 upcoming bookings were cancelled because the plan no longer covers those classes.'
      })
    });
  });
  try {
    await page.goto('/admin/plans');
    const editor = page.getByRole('form', { name: vip.name });
    // None ticked means every category, so ticking one takes the other away.
    await editor.getByRole('checkbox', { name: 'Workout & Strength' }).check();
    await editor.getByRole('button', { name: `Save ${vip.name}` }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove classes from this plan?' });
    await expect(confirm).toContainText('Zumba & Cardio');
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(confirm).toBeHidden();
    expect(puts).toEqual([]);

    await editor.getByRole('button', { name: `Save ${vip.name}` }).click();
    await confirm.getByRole('button', { name: 'Save and cancel bookings' }).click();
    await expect(confirm).toBeHidden();
    expect(puts).toEqual([{ categories: ['Workout & Strength'] }]);
    await expect(toasts(page)).toContainText(`${vip.name} was saved`);
    await expect(toasts(page)).toContainText('3 upcoming bookings were cancelled because the plan no longer covers those classes.');
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('the temporary password stays until the admin says it is noted, and its warning is readable in light theme', async ({ page, request }) => {
  const admin = await signInAs(page, request, 'admin');
  await page.addInitScript(() => window.localStorage.setItem('pulsefit_theme', 'light'));
  const member = await createMember(request, admin, unique('Staff Reset'), 'basic', 1);
  try {
    await page.goto('/admin/members');
    await page.locator('#member-search').fill(member.name);
    await page.locator('#member-search').press('Enter');
    await page.getByRole('button', { name: `Reset password for ${member.name}` }).click();
    await page.getByRole('dialog', { name: 'Reset password?' }).getByRole('button', { name: 'Reset password' }).click();

    const dialog = page.getByRole('dialog', { name: 'Password reset' });
    await expect(dialog).toBeVisible();
    const password = await dialog.locator('output').textContent();
    expect(password?.trim()).toBeTruthy();
    // Focus starts on Copy, not on the corner button that cannot close this dialog.
    await expect(dialog.getByRole('button', { name: 'Copy' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Note the password down first');
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('output')).toHaveText(password!);

    expect(await contrastOf(page, '[role="dialog"] [role="note"]')).toBeGreaterThanOrEqual(4.5);

    await dialog.getByRole('button', { name: 'I have noted it down' }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await removeMembers(request, admin, [member]);
  }
});

test('the check-in box is empty and focused after a denied scan, so the next scan is not glued on', async ({ page, request }) => {
  await signInAs(page, request, 'admin');
  await page.goto('/admin/check-in');
  const box = page.locator('#checkin-code');
  await box.click();
  await page.keyboard.type('NOT-A-REAL-PASS-1');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Access denied/).first()).toBeVisible();
  await expect(box).toHaveValue('');
  await expect(box).toBeFocused();

  await page.keyboard.type('NOT-A-REAL-PASS-2');
  await page.keyboard.press('Enter');
  await expect(page.getByText('NOT-A-REAL-PASS-2', { exact: true })).toBeVisible();
  await expect(page.getByText(/NOT-A-REAL-PASS-1NOT/)).toHaveCount(0);
  await expect(box).toHaveValue('');
});

test.describe('members page', () => {
  test('the status filter follows the address and writes itself back to it', async ({ page, request }) => {
    await signInAs(page, request, 'admin');
    await page.goto('/admin');
    await page.getByRole('button', { name: /frozen: show these members/ }).click();
    await expect(page).toHaveURL(/\/admin\/members\?status=frozen$/);
    const filter = page.locator('#status-filter');
    await expect(filter).toHaveValue('frozen');

    // The admin links live in the navbar from the md breakpoint and in the page below it.
    const adminLinks = page.locator('nav[aria-label="Front desk & admin"]:visible, nav[aria-label="Admin sections"]:visible').first();
    await adminLinks.getByText('Members', { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/members$/);
    await expect(filter).toHaveValue('all');

    await filter.selectOption('expired');
    await expect(page).toHaveURL(/\/admin\/members\?status=expired$/);
    await page.reload();
    await expect(page.locator('#status-filter')).toHaveValue('expired');

    await page.locator('#status-filter').selectOption('all');
    await expect(page).toHaveURL(/\/admin\/members$/);
    await page.reload();
    await expect(page.locator('#status-filter')).toHaveValue('all');
  });

  test('a phone card for a member without an expiry date does not read "until —"', async ({ page, request }) => {
    const admin = await signInAs(page, request, 'admin');
    const member = await createMember(request, admin, unique('Staff No Plan'), 'none', 0);
    try {
      await page.goto('/admin/members');
      await page.locator('#member-search').fill(member.name);
      await page.locator('#member-search').press('Enter');
      const card = page.locator('ul li').filter({ hasText: member.email });
      await expect(card).toHaveCount(1);
      const text = (await card.textContent()) ?? '';
      expect(text).toContain('No plan');
      expect(text).not.toContain('until');
    } finally {
      await removeMembers(request, admin, [member]);
    }
  });

  test('admin pages show one row of admin links, with one name for the dashboard', async ({ page, request }, testInfo) => {
    await signInAs(page, request, 'admin');
    await page.goto('/admin/members');
    await expect(page.locator('main h1').first()).toBeVisible();
    const pageNav = page.getByRole('navigation', { name: 'Admin sections' });
    if (testInfo.project.name === 'mobile') {
      await expect(pageNav).toBeVisible();
      await expect(pageNav.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Front desk & admin' })).toBeVisible();
      await expect(pageNav).toBeHidden();
    }
    // The navbar calls it Dashboard; the page's own links used to say Overview.
    await expect(page.locator('nav[aria-label="Admin sections"], nav[aria-label="Front desk & admin"]').getByText('Overview', { exact: true })).toHaveCount(0);
  });
});
