import fs from 'fs';
import { expect, type Page } from '@playwright/test';
import { signInAs, test, useAppMode, type Persona } from './helpers';

// A scene under the app bar of every page (PageScene, app mode only): on the phone it never pushes the
// page's heading (else its first button) below the tab bar's top edge, and on a short landscape screen it is hidden.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

// Read as text: the client's TypeScript is not part of the e2e project.
const routesText = fs.readFileSync('client/src/routes.ts', 'utf8');
const routes = Array.from(routesText.matchAll(/tab: '([^']+)',\s*path: '([^']+)'[\s\S]*?access: ('public'|'auth'|\[[^\]]*\])/g), m => ({
  tab: m[1],
  path: m[2],
  access: m[3]
}));
if (routes.length !== (routesText.match(/tab: '/g) ?? []).length) throw new Error('routes.ts: a route entry did not parse');
const pages: string[] = JSON.parse(fs.readFileSync('client/src/lib/app-art-ids.json', 'utf8')).pages;

const persona = (access: string): Persona | null =>
  access === "'public'" ? null : access === "'auth'" || access.startsWith("['member") ? 'member' : access.includes("'trainer'") ? 'trainer' : access.includes("'admin'") ? 'admin' : (() => { throw new Error('unrecognised access: ' + access); })();

test('every route has a page scene id', () => {
  expect(routes.length).toBeGreaterThan(20);
  expect([...pages].sort()).toEqual(routes.map(r => r.tab).sort());
});

test('every page shows its scene and keeps its heading above the tab bar', async ({ page, request }) => {
  test.setTimeout(240_000);
  for (const r of routes) {
    const who = persona(r.access);
    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear()).catch(() => {});
    if (who) await signInAs(page, request, who);
    await useAppMode(page);
    await page.goto(r.path);
    await expect(page.locator(`[data-scene="page.${r.tab}"]`), r.tab).toBeVisible();
    await expect(page.locator('main h1, main button').first(), r.tab).toBeVisible();
    const h1 = page.locator('main h1').first();
    const target = (await h1.count()) ? h1 : page.locator('main button').first();
    await expect(target, r.tab).toBeVisible();
    const box = (await target.boundingBox())!;
    expect(box.y + box.height, `${r.tab} first content bottom`).toBeLessThanOrEqual(738);
  }
});

test('the strip is hidden on a short landscape screen', async ({ page }) => {
  await useAppMode(page);
  await page.goto('/contact');
  await expect(page.locator('[data-page-scene]')).toBeVisible();
  await page.setViewportSize({ width: 800, height: 390 });
  await expect(page.locator('[data-page-scene]')).toBeHidden();
});

test('the website has no page scene', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-page-scene]')).toHaveCount(0);
});

