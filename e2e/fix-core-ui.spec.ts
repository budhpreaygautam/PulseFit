import { expect, Locator, Page, Route } from '@playwright/test';
import { signInAs, test } from './helpers';

// Regression checks for the core UI fixes: session restore and account switching, the offline
// state, config retries, toasts, focus after a page change, and readable accent text in light theme.

const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(t => window.localStorage.setItem('pulsefit_theme', t), theme);
}

test('light is the default theme, even when the device prefers dark; a picked dark theme is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#e6ebf2');

  await page.evaluate(() => window.localStorage.setItem('pulsefit_theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

/** WCAG contrast ratio of an element's text against the background colours actually behind it. */
async function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate(el => {
    const parse = (c: string): number[] => {
      const parts = (c.match(/rgba?\(([^)]+)\)/)?.[1] ?? '0,0,0,0').split(/[\s,/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const layers: number[][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg[3] > 0) layers.unshift(bg);
      if (bg[3] >= 1) break;
    }
    let base = [255, 255, 255];
    for (const layer of layers) base = base.map((v, i) => layer[i] * layer[3] + v * (1 - layer[3]));
    const fg = parse(getComputedStyle(el).color);
    const text = base.map((v, i) => fg[i] * fg[3] + v * (1 - fg[3]));
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [luminance(text), luminance(base)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
}

test.describe('session', () => {
  test('a saved session does not redirect away from the home page or a password-reset link', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    await page.goto('/');
    await expect(page.getByRole('link', { name: /^My account \(/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');

    await page.goto('/reset-password?token=abc123');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^My account \(/ })).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('token')).toBe('abc123');
  });

  test('signing in from the home page still opens your dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /^Member/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('switching to another demo account reloads the page for that account', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    await page.goto('/dashboard');
    await expect(page.locator('main h1')).toHaveText(/^Hi, /);
    const before = await page.locator('main h1').textContent();

    const reload = page.waitForRequest(r => r.url().includes('/api/bookings/my'));
    await page.getByRole('group', { name: /Demo accounts/ }).getByRole('button', { name: 'All-Access member' }).click();
    await reload;
    await expect(page.locator('main h1')).not.toHaveText(before ?? '');
  });

  test('an expired session shows one warning, however many requests fail', async ({ page, request }) => {
    await signInAs(page, request, 'vip');
    await page.goto('/schedule');
    await expect(page.getByRole('link', { name: /^My account \(/ })).toBeVisible();

    // Every API call now answers 401, as after a password change on another device.
    await page.route('**/api/**', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: SESSION_EXPIRED, code: 'UNAUTHORIZED' }) })
    );
    await page.getByRole('contentinfo').getByRole('link', { name: 'My dashboard' }).click();
    await expect(page.getByRole('heading', { name: /please sign in/i })).toBeVisible();
    await page.waitForTimeout(1_000);
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText(SESSION_EXPIRED)).toHaveCount(1);
  });

  test('when the server cannot be reached, the saved session waits and recovers on its own', async ({ page, request }) => {
    const token = await signInAs(page, request, 'member');
    await page.route('**/api/auth/me', route => route.abort('connectionrefused'));
    const started = Date.now();
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: "Can't reach PulseFit right now" })).toBeVisible({ timeout: 6_000 });
    expect(Date.now() - started).toBeLessThan(6_000);
    await expect(page.getByRole('heading', { name: /please sign in/i })).toHaveCount(0);
    // The session is kept (the cookie, and the marker that says to restore it); no token is in localStorage.
    expect(await page.evaluate(() => window.localStorage.getItem('pulsefit_signed_in'))).toBe('1');
    expect(await page.evaluate(() => window.localStorage.getItem('pulsefit_token'))).toBeNull();
    expect((await page.context().cookies()).find(c => c.name === 'pulsefit_session')?.value).toBe(token);

    // The server is back: the page recovers without a reload or a click.
    await page.unroute('**/api/auth/me');
    await expect(page.locator('main h1')).toHaveText(/^Hi, /, { timeout: 20_000 });
  });

  test('a session check that hangs also shows the offline state, and a late answer still signs you in', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    const held: Route[] = [];
    let holding = true;
    await page.route('**/api/auth/me', route => {
      if (holding) held.push(route);
      else void route.continue();
    });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: "Can't reach PulseFit right now" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('heading', { name: /please sign in/i })).toHaveCount(0);

    holding = false;
    for (const route of held.splice(0)) await route.continue();
    await expect(page.locator('main h1')).toHaveText(/^Hi, /, { timeout: 10_000 });
  });
  test('a session check that never answers is called off and tried again, one at a time', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    let started = 0;
    let open = 0;
    let mostOpen = 0;
    let calledOff = 0;
    let holding = true;
    const held: Route[] = [];
    page.on('requestfailed', r => {
      if (!r.url().endsWith('/api/auth/me')) return;
      open -= 1;
      calledOff += 1;
    });
    page.on('requestfinished', r => {
      if (r.url().endsWith('/api/auth/me')) open -= 1;
    });
    await page.route('**/api/auth/me', route => {
      started += 1;
      open += 1;
      mostOpen = Math.max(mostOpen, open);
      if (holding) held.push(route);
      else void route.continue();
    });
    await page.goto('/dashboard');

    // Shown as offline after 5 s, but no second check piles up behind the first.
    await expect(page.getByRole('heading', { name: "Can't reach PulseFit right now" })).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(4_000);
    expect(started).toBe(1);

    // After 15 s the first check is called off and a new one starts.
    await expect.poll(() => started, { timeout: 15_000 }).toBe(2);
    expect(calledOff).toBe(1);
    expect(mostOpen).toBe(1);

    holding = false;
    for (const route of held.splice(0)) await route.continue().catch(() => undefined);
    await expect(page.locator('main h1')).toHaveText(/^Hi, /, { timeout: 10_000 });
  });
});

test.describe('parts that load on demand', () => {
  test('a QR pass that cannot be fetched says so, leaves the app working and opens after a reload', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    await page.route('**/assets/DigitalQrPassModal-*.js', route => route.abort('connectionrefused'));
    await page.goto('/schedule');
    const openPass = page.getByRole('button', { name: 'Show my QR entry pass' });
    await openPass.click();

    const toast = page.getByRole('alert').filter({ hasText: "Couldn't open your QR pass." });
    await expect(toast).toContainText('reload the page');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(openPass).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.unroute('**/assets/DigitalQrPassModal-*.js');
    await page.reload();
    await openPass.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('a sign-in dialog that cannot be fetched says so, leaves the page working and opens after a reload', async ({ page }) => {
    await page.route('**/assets/AuthModal-*.js', route => route.abort('connectionrefused'));
    await page.goto('/');
    const signIn = page.getByRole('button', { name: 'Sign in' }).first();
    await signIn.click();

    const toast = page.getByRole('alert').filter({ hasText: "Couldn't open sign-in." });
    await expect(toast).toContainText('reload the page');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.unroute('**/assets/AuthModal-*.js');
    await page.reload();
    await signIn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('a page that cannot be fetched shows a reload panel, and other pages still open', async ({ page, request }) => {
    await signInAs(page, request, 'member');
    await page.route('**/assets/MyBookingsPage-*.js', route => route.abort('connectionrefused'));
    await page.goto('/bookings');
    await expect(page.getByRole('heading', { name: "This page didn't load" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: 'My dashboard' }).click();
    await expect(page.locator('main h1')).toHaveText(/^Hi, /);
  });
});

test('a failed config request is retried, so demo mode and its account bar still appear', async ({ page }) => {
  let failed = 0;
  await page.route('**/api/config', route => {
    if (failed++ === 0) return route.abort('connectionrefused');
    return route.continue();
  });
  await page.goto('/pricing');
  await expect(page.getByRole('group', { name: /Demo accounts/ })).toBeVisible({ timeout: 8_000 });
  // The bar shows from the first render (the server marks a demo deployment in the HTML), so wait
  // for the retry itself.
  await expect.poll(() => failed, { timeout: 8_000 }).toBeGreaterThan(1);
});

test('a config request that hangs is called off after 8 seconds and tried again', async ({ page }) => {
  let started = 0;
  let calledOff = 0;
  page.on('requestfailed', r => {
    if (r.url().endsWith('/api/config')) calledOff += 1;
  });
  // The first request is never answered.
  await page.route('**/api/config', route => (started++ === 0 ? undefined : route.continue()));
  await page.goto('/pricing');
  // The demo bar shows from the first render (the server marks a demo deployment in the HTML), so
  // wait for the second request itself.
  await expect.poll(() => started, { timeout: 12_000 }).toBe(2);
  expect(calledOff).toBe(1);
  await expect(page.getByRole('group', { name: /Demo accounts/ })).toBeVisible();
});

test('coming back to the window replaces a config request that has been waiting', async ({ page }) => {
  let started = 0;
  await page.route('**/api/config', route => (started++ === 0 ? undefined : route.continue()));
  await page.goto('/pricing');
  await page.waitForTimeout(3_500);
  expect(started).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => started, { timeout: 2_500 }).toBe(2);
  await expect(page.getByRole('group', { name: /Demo accounts/ })).toBeVisible();
});

test('error toasts stay well past the old 4.5 seconds and pause while hovered', async ({ page }) => {
  await page.route('**/api/auth/demo-login', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Demo sign-in failed for this test.' }) })
  );
  await page.goto('/pricing');
  await page.getByRole('group', { name: /Demo accounts/ }).getByRole('button', { name: 'Coach' }).click();
  const toast = page.getByRole('alert').filter({ hasText: 'Demo sign-in failed for this test.' });
  await expect(toast).toBeVisible();
  await page.waitForTimeout(6_000);
  await expect(toast).toBeVisible();

  const box = await toast.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute('data-paused', 'true');
  await page.mouse.move(1, 1);
  await expect(page.getByRole('region', { name: 'Notifications' })).not.toHaveAttribute('data-paused', 'true');

  await toast.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(toast).toHaveCount(0);
});

test('dismissing a toast by click, tap or keyboard does not hold later toasts on screen', async ({ page, isMobile }) => {
  await page.goto('/pricing');
  const region = page.getByRole('region', { name: 'Notifications' });
  const demo = page.getByRole('group', { name: /Demo accounts/ });
  const toastFor = (text: string) => region.getByRole('status').filter({ hasText: text });

  // Dismissed with the pointer (a tap on phones): the button had focus and is gone with its toast.
  await demo.getByRole('button', { name: 'Member', exact: true }).click();
  const first = toastFor('Signed in as the demo member.');
  const dismissFirst = first.getByRole('button', { name: 'Dismiss notification' });
  if (isMobile) await dismissFirst.tap();
  else await dismissFirst.click();
  await expect(first).toHaveCount(0);

  await demo.getByRole('button', { name: 'All-Access member' }).click();
  const second = toastFor('Signed in as the demo all-access member.');
  await expect(second).toBeVisible();
  await expect(region).not.toHaveAttribute('data-paused', 'true');
  await expect(second).toHaveCount(0, { timeout: 8_000 });

  // Dismissed from the keyboard: focus goes back to the page, not to <body> or a removed button.
  await demo.getByRole('button', { name: 'Member', exact: true }).click();
  const third = toastFor('Signed in as the demo member.');
  await third.getByRole('button', { name: 'Dismiss notification' }).focus();
  await expect(region).toHaveAttribute('data-paused', 'true');
  await page.keyboard.press('Enter');
  await expect(third).toHaveCount(0);
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    return { onBody: !el || el === document.body, inToasts: Boolean(el?.closest('[aria-label="Notifications"]')) };
  });
  expect(focus).toEqual({ onBody: false, inToasts: false });

  await demo.getByRole('button', { name: 'Coach' }).click();
  const fourth = toastFor('Signed in as the demo coach.');
  await expect(fourth).toBeVisible();
  await expect(region).not.toHaveAttribute('data-paused', 'true');
  await expect(fourth).toHaveCount(0, { timeout: 8_000 });
});

test('each toast is announced once: errors by their alert role, others by the always-present announcer', async ({ page }) => {
  await page.goto('/pricing');
  const region = page.getByRole('region', { name: 'Notifications' });
  await expect(region).not.toHaveAttribute('aria-live', /.+/);
  await page.getByRole('group', { name: /Demo accounts/ }).getByRole('button', { name: 'Member', exact: true }).click();
  const card = region.getByRole('status').filter({ hasText: 'Signed in as the demo member.' });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('#toast-announcer')).toHaveText('Signed in as the demo member.');
});

test('opening another page moves focus to its heading and announces it', async ({ page }) => {
  await page.goto('/pricing');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('main h1')).toBeFocused();
  await expect(page.locator('#route-announcer')).toHaveText('Privacy policy');
});

test('a page that loads on demand gets focus on its heading once it arrives', async ({ page, request }) => {
  await signInAs(page, request, 'member');
  await page.goto('/schedule');
  await expect(page.getByRole('link', { name: /^My account \(/ })).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: 'My dashboard' }).click();
  await expect(page.locator('main h1')).toHaveText(/^Hi, /);
  await expect(page.locator('main h1')).toBeFocused();
});

test('plan names match the catalogue wherever a tier is shown', async ({ page, request }) => {
  const plans = (await (await request.get('/api/plans')).json()).data as Array<{ tier: string; name: string }>;
  const nameOf = (tier: string) => plans.find(p => p.tier === tier)?.name;

  // The member's own header uses the shared tier labels.
  await signInAs(page, request, 'member');
  await page.goto('/dashboard');
  await expect(page.locator('main h1')).toHaveText(/^Hi, /);
  await expect(page.locator('main h1 + div').getByText(nameOf('pro')!, { exact: true })).toBeVisible();

  // So does the staff filter, which lists every tier. (Init scripts run in order, so the admin
  // token stored last is the one the next page load uses.)
  await signInAs(page, request, 'admin');
  await page.goto('/admin/members');
  await expect(page.locator('#tier-filter')).toBeVisible();
  const options = await page.locator('#tier-filter option').allTextContents();
  for (const tier of ['basic', 'pro', 'vip']) expect(options).toContain(nameOf(tier));
});

test('the header lines up with the page at every width, and its icon-only links keep their names and show tooltips', async ({ page, request, isMobile }) => {
  test.skip(isMobile, 'Phones get the menu, where every link shows its label.');
  const labels = ['Overview', 'Strength Floor', 'Zumba Studio', 'Plans & Diets', 'Timetable', 'Memberships', 'Coaches'];
  const roleLabels = {
    vip: ['Dashboard', 'My bookings', 'Log workout', 'Exercises', 'My account'],
    admin: ['Dashboard', 'Members', 'ID cards', 'Check-in', 'Classes & coaches', 'Coach dashboards', 'Plans', 'Trial leads', 'My account']
  };
  const main = page.getByRole('navigation', { name: 'Main' });
  /** Whether a header link shows its label (else only its icon, the label being visually hidden). */
  const showsLabel = (link: Locator) => link.locator(':scope > span:not(.nav-tip)').evaluate(label => getComputedStyle(label).position !== 'absolute');
  /** Where an element's content starts and ends, left to right. */
  const contentEdges = (locator: Locator) =>
    locator.evaluate(el => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return [Math.round(box.left + parseFloat(style.paddingLeft)), Math.round(box.right - parseFloat(style.paddingRight))];
    });

  // The all-access member has the widest account buttons, the admin the longest row of links.
  for (const [persona, section] of [['vip', 'My PulseFit'], ['admin', 'Front desk & admin']] as const) {
    await signInAs(page, request, persona);
    for (const width of [768, 1024, 1280, 1536, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/schedule');
      const roleRow = page.getByRole('navigation', { name: section });
      await expect(roleRow).toBeVisible();

      // The demo bar, the header and the signed-in row start and end where the page and the footer do.
      const pageEdges = await contentEdges(page.locator('footer > div').first());
      expect(await contentEdges(page.locator('header > div').first()), `header at ${width}px`).toEqual(pageEdges);
      expect(await contentEdges(roleRow), `${section} at ${width}px`).toEqual(pageEdges);
      expect(await contentEdges(page.locator('#demo-switcher-label').locator('..')), `demo bar at ${width}px`).toEqual(pageEdges);

      // The main links (from 1280 px; the menu below that) only ever show their icons.
      if (width >= 1280) {
        for (const label of labels) {
          const link = main.getByRole('link', { name: label, exact: true });
          await expect(link).toHaveText(label);
          expect(await showsLabel(link), `${label} at ${width}px`).toBe(false);
        }
        const fits = await page.locator('header > div').first().evaluate(bar => bar.scrollWidth <= bar.clientWidth && bar.lastElementChild!.scrollWidth <= bar.lastElementChild!.clientWidth);
        expect(fits, `account buttons at ${width}px`).toBe(true);
      } else {
        await expect(main).toBeHidden();
      }

      // The signed-in row: one line, the same names at every width, labels shown from 1280 px.
      const rows = await roleRow.getByRole('link').evaluateAll(links => new Set(links.map(link => Math.round(link.getBoundingClientRect().top))).size);
      expect(rows, `${section} rows at ${width}px`).toBe(1);
      await expect(roleRow.getByRole('link')).toHaveCount(roleLabels[persona].length);
      for (const label of roleLabels[persona]) {
        const link = roleRow.getByRole('link', { name: label, exact: true });
        await expect(link).toHaveText(label);
        expect(await showsLabel(link), `${label} at ${width}px`).toBe(width >= 1280);
      }
    }
  }

  // The label appears on hover, stays while the pointer moves onto it, and Escape hides it (WCAG 1.4.13).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/schedule');
  const timetable = main.getByRole('link', { name: 'Timetable', exact: true });
  const tip = timetable.locator('.nav-tip');
  await expect(tip).toBeHidden();
  await timetable.hover();
  await expect(tip).toBeVisible();
  expect(await tip.evaluate(el => getComputedStyle(el, '::after').content)).toBe('"Timetable"');
  const link = (await timetable.boundingBox())!;
  const bubble = (await tip.boundingBox())!;
  await page.mouse.move(link.x + link.width / 2, link.y + link.height + 0.5, { steps: 3 }); // the 2px gap between them
  await expect(tip).toBeVisible();
  await page.mouse.move(bubble.x + bubble.width / 2, bubble.y + bubble.height - 4, { steps: 3 }); // the tooltip itself
  await expect(tip).toBeVisible();
  await page.mouse.move(link.x + link.width / 2, link.y + link.height / 2, { steps: 3 });
  await expect(tip).toBeVisible();
  // Escape hides it while the pointer stays on the link, and moving within the link does not bring it back.
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await page.mouse.move(link.x + link.width / 2 + 3, link.y + link.height / 2 + 2, { steps: 3 });
  await expect(tip).toBeHidden();
  const coaches = main.getByRole('link', { name: 'Coaches', exact: true });
  await coaches.hover();
  await expect(coaches.locator('.nav-tip')).toBeVisible();
  await page.mouse.move(0, 500);
  await expect(coaches.locator('.nav-tip')).toBeHidden();

  // Keyboard focus shows it too; Escape hides it without moving focus, and the next link shows its own.
  await main.getByRole('link', { name: 'Zumba Studio', exact: true }).focus();
  await page.keyboard.press('Tab');
  const guide = main.getByRole('link', { name: 'Plans & Diets', exact: true });
  await expect(guide).toBeFocused();
  await expect(guide.locator('.nav-tip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeFocused();
  await expect(guide.locator('.nav-tip')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(timetable).toBeFocused();
  await expect(tip).toBeVisible();
});

test('a header tooltip ends above the signed-in row, so moving down from an icon clicks the link below it', async ({ page, request, isMobile }) => {
  test.skip(isMobile, 'Phones get the menu; the two header rows only meet from 1280 px.');
  await signInAs(page, request, 'admin');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/privacy');
  const main = page.getByRole('navigation', { name: 'Main' });
  const roleRow = page.getByRole('navigation', { name: 'Front desk & admin' });
  await expect(roleRow).toBeVisible();

  // A main-row icon with a signed-in row link straight below it.
  const below = await roleRow.getByRole('link').evaluateAll(links =>
    links.map(link => {
      const box = link.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, path: link.getAttribute('href') };
    })
  );
  let pair: { icon: Locator; x: number; target: (typeof below)[number] } | undefined;
  for (const icon of await main.getByRole('link').all()) {
    const box = (await icon.boundingBox())!;
    const x = box.x + box.width / 2;
    const target = below.find(b => b.left + 4 < x && x < b.right - 4);
    if (target) {
      pair = { icon, x, target };
      break;
    }
  }
  expect(pair, 'a main-row icon above a signed-in row link').toBeDefined();
  const { icon, x, target } = pair!;
  const tip = icon.locator('.nav-tip');

  await icon.hover();
  await expect(tip).toBeVisible();
  const bubble = (await tip.boundingBox())!;
  expect(bubble.y + bubble.height, 'tooltip bottom vs the link below').toBeLessThanOrEqual(target.top);

  // Straight down: the icon lets go of the pointer, and a click 2px inside the link's top edge opens that link's page.
  await page.mouse.move(x, target.top + 2, { steps: 8 });
  await expect(tip).toBeHidden();
  await page.mouse.click(x, target.top + 2);
  await expect(page).toHaveURL(url => url.pathname === target.path);

  // A tooltip shown only for keyboard focus never takes a click: it goes to whatever is under it.
  await page.mouse.move(5, 700);
  await icon.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(icon).toBeFocused();
  await expect(tip).toBeVisible();
  const shown = (await tip.boundingBox())!;
  const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.nav-tip') !== null, [shown.x + shown.width / 2, shown.y + shown.height / 2]);
  expect(hit, 'focus-only tooltip is hit-testable').toBe(false);
  await page.mouse.click(shown.x + shown.width / 2, shown.y + shown.height / 2);
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname, 'a click on a focus-only tooltip').toBe(target.path);
});

test('a touch tablet in landscape keeps the labelled menu; a desktop with a mouse does not need it', async ({ browser, baseURL, page, request, isMobile }) => {
  test.skip(isMobile, 'Runs its own touch tablet; phones always have the menu.');
  const labels = ['Overview', 'Strength Floor', 'Zumba Studio', 'Plans & Diets', 'Timetable', 'Memberships', 'Coaches'];

  // A mouse: icons and their tooltips from 1280 px, the menu only below that.
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
  for (const [width, menu] of [[1279, true], [1280, false]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/schedule');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible({ visible: menu });
  }

  // Touch only, so no hover and no tooltips: the menu button stays next to the icons.
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, hasTouch: true });
  try {
    const tablet = await context.newPage();
    // The all-access member has the widest account buttons, the admin the longest signed-in row.
    for (const [persona, section] of [['vip', 'My PulseFit'], ['admin', 'Front desk & admin']] as const) {
      await signInAs(tablet, request, persona);
      await tablet.goto('/schedule');
      expect(await tablet.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
      await expect(tablet.getByRole('navigation', { name: 'Main' })).toBeVisible();
      const toggle = tablet.getByRole('button', { name: 'Open menu' });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu');
      const fits = await tablet.locator('header > div').first().evaluate(bar => bar.scrollWidth <= bar.clientWidth && bar.lastElementChild!.scrollWidth <= bar.lastElementChild!.clientWidth);
      expect(fits, `${persona} header at 1280px`).toBe(true);

      await toggle.tap();
      const menu = tablet.locator('#mobile-menu');
      await expect(menu).toBeVisible();
      await expect(tablet.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
      for (const label of labels) await expect(menu.getByRole('link', { name: label, exact: true })).toHaveText(label);
      await expect(menu.getByRole('navigation', { name: section }).getByRole('link').first()).toBeVisible();
      expect(await tablet.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll').toBe(true);

      await menu.getByRole('link', { name: 'Memberships', exact: true }).tap();
      await expect(tablet).toHaveURL(/\/pricing$/);
      await expect(menu).toHaveCount(0);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  } finally {
    await context.close();
  }
});

test('a tapped header icon leaves no tooltip over the next page on a touch tablet', async ({ browser, baseURL, request, isMobile }) => {
  test.skip(isMobile, 'Runs its own touch tablet; phones have no icon-only header links.');
  const context = await browser.newContext({ baseURL, viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await signInAs(page, request, 'vip');
    await page.goto('/schedule');
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
    const bookings = page.getByRole('navigation', { name: 'My PulseFit' }).getByRole('link', { name: 'My bookings', exact: true });
    await bookings.tap();
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(bookings.locator('.nav-tip')).toBeHidden();
  } finally {
    await context.close();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme: errors, notices, badges and legal headings are readable`, async ({ page }) => {
    await useTheme(page, theme);

    await page.goto('/privacy');
    expect(await contrastOf(page.locator('main strong').first())).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page.getByText('Sunday: closed'))).toBeGreaterThanOrEqual(4.5);

    await page.goto('/pricing');
    expect(await contrastOf(page.getByText('QUESTIONS', { exact: true }))).toBeGreaterThanOrEqual(4.5);

    await page.getByRole('button', { name: 'Sign in' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('button[type="submit"]').click();
    expect(await contrastOf(dialog.locator('#auth-email-error'))).toBeGreaterThanOrEqual(4.5);

    await dialog.getByLabel('Email address', { exact: true }).fill(`nobody-${Date.now()}@example.com`);
    await dialog.getByLabel('Password', { exact: true }).fill('not-the-password-1');
    await dialog.locator('button[type="submit"]').click();
    const formError = dialog.getByRole('alert').filter({ hasText: 'The email or password is incorrect.' });
    await expect(formError).toBeVisible();
    expect(await contrastOf(formError)).toBeGreaterThanOrEqual(4.5);
    await dialog.getByRole('button', { name: 'Close dialog' }).click();

    // Accent text laid over a photo keeps its light colour in both themes.
    await page.goto('/strength');
    expect(await contrastOf(page.getByText('WORKOUT & STRENGTH FLOOR', { exact: true }))).toBeGreaterThanOrEqual(4.5);
  });
}
