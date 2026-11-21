import fs from 'fs';
import { expect, type Page } from '@playwright/test';
import { signInAs, test, useAppMode, type Persona } from './helpers';

// Every page's scene (PageScene, app mode only) sits inside the page's own content, beside its heading,
// in a card or between two sections, never over text or buttons: on the phone it never pushes the page's
// heading (else its first button) below the tab bar's top edge, and on a short landscape screen it is hidden.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

// Read as text: the client's TypeScript is not part of the e2e project.
const routesText = fs.readFileSync('client/src/routes.ts', 'utf8');
const routes = Array.from(routesText.matchAll(/tab: '([^']+)',\s*path: '([^']+)'[\s\S]*?access: ('public'|'auth'|\[[^\]]*\])(,\s*appOnly: true)?/g), m => ({
  tab: m[1],
  path: m[2],
  access: m[3],
  appOnly: Boolean(m[4])
}));
if (routes.length !== (routesText.match(/tab: '/g) ?? []).length) throw new Error('routes.ts: a route entry did not parse');
const pages: string[] = JSON.parse(fs.readFileSync('client/src/lib/app-art-ids.json', 'utf8')).pages;

const persona = (access: string): Persona | null =>
  access === "'public'" ? null : access === "'auth'" || access.startsWith("['member") ? 'member' : access.includes("'trainer'") ? 'trainer' : access.includes("'admin'") ? 'admin' : (() => { throw new Error('unrecognised access: ' + access); })();

/** Where a page's scene sits: its parent, whether it overlaps it, and the text, buttons, links, fields and pictures its box covers. */
const placeOf = (page: Page, tab: string) =>
  page.locator(`[data-page-scene="${tab}"]`).evaluate(slot => {
    const main = document.querySelector('main')!;
    const s = slot.getBoundingClientRect();
    const overlaps = (r: DOMRect) => r.width > 0 && r.height > 0 && r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom;
    const covered: string[] = [];
    const texts = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = texts.nextNode(); n; n = texts.nextNode()) {
      if (!n.textContent!.trim() || slot.contains(n)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      if (Array.from(range.getClientRects()).some(overlaps)) covered.push(n.textContent!.trim().slice(0, 40));
    }
    for (const el of main.querySelectorAll('button, a, input, select, textarea, img')) {
      if (!slot.contains(el) && overlaps(el.getBoundingClientRect())) covered.push(`<${el.tagName.toLowerCase()}> ${(el.textContent ?? '').trim().slice(0, 30)}`);
    }
    const parent = slot.parentElement!;
    return {
      stripInMain: parent === main,
      besideContent: parent.children.length > 1 && Boolean(parent.textContent!.trim()),
      overlapsSection: overlaps(parent.getBoundingClientRect()),
      fitsWidth: s.left >= 0 && s.right <= window.innerWidth,
      covered
    };
  });

test('every route has a page scene id', () => {
  expect(routes.length).toBeGreaterThan(20);
  expect([...pages].sort()).toEqual(routes.map(r => r.tab).sort());
});

test('every page shows its scene inside a section, clear of text and buttons, and keeps its heading above the tab bar', async ({ page, request }) => {
  test.setTimeout(240_000);
  for (const r of routes) {
    const who = persona(r.access);
    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear()).catch(() => {});
    if (who) await signInAs(page, request, who);
    await useAppMode(page);
    await page.goto(r.path);
    await expect(page.locator(`[data-scene="page.${r.tab}"]`), r.tab).toBeVisible();
    await expect(page.locator(`[data-scene="page.${r.tab}"]`), `${r.tab}: one scene`).toHaveCount(1);
    await expect(page.locator('main h1, main button').first(), r.tab).toBeVisible();
    const h1 = page.locator('main h1').first();
    const target = (await h1.count()) ? h1 : page.locator('main button').first();
    await expect(target, r.tab).toBeVisible();
    const box = (await target.boundingBox())!;
    expect(box.y + box.height, `${r.tab} first content bottom`).toBeLessThanOrEqual(738);
    expect(await placeOf(page, r.tab), r.tab).toEqual({ stripInMain: false, besideContent: true, overlapsSection: true, fitsWidth: true, covered: [] });
  }
});

test('a page that asks to sign in shows its scene in the panel', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/bookings');
  await expect(page.locator('#main h1', { hasText: 'Please sign in' })).toBeVisible();
  await expect(page.locator('main [data-scene="page.my-bookings"]')).toBeVisible();
  await expect(page.locator('[data-page-scene]')).toHaveCount(0);
});

test('the scene is hidden on a short landscape screen', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/contact');
  await expect(page.locator('[data-page-scene]')).toBeVisible();
  await page.setViewportSize({ width: 800, height: 390 });
  await expect(page.locator('[data-page-scene]')).toBeHidden();
});

test('the website has no page scene', async ({ page }) => {
  for (const r of routes.filter(r => r.access === "'public'" && !r.appOnly)) {
    await page.goto(r.path);
    await expect(page.getByRole('heading', { level: 1 }).first(), r.tab).toBeVisible();
    await expect(page.locator('[data-page-scene]'), r.tab).toHaveCount(0);
  }
});
