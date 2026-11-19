import { expect } from '@playwright/test';
import { signInAs, tabBar, test, useAppMode } from './helpers';

// The app's Home against the owner's design handoff (docs/design/pulsefit-mobile-handoff): the
// tokens, radii and type it pins, in light and dark, plus a screenshot to compare by eye.

test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'mobile', 'app mode is the phone layout'));

for (const theme of ['light', 'dark'] as const) {
  test(`Home matches the handoff tokens in ${theme}`, async ({ page, request }, testInfo) => {
    await useAppMode(page, { theme }); await signInAs(page, request, 'member');
    await page.emulateMedia({ reducedMotion: 'reduce' });   // the screenshot shows the settled screen, not cards rising in
    await page.goto('/dashboard');
    const dark = theme === 'dark';
    await expect(page.locator('body')).toHaveCSS('background-color', dark ? 'rgb(15, 20, 29)' : 'rgb(230, 235, 242)');
    await expect(page.locator('#root > div').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const backdrop = page.locator('.app-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS('z-index', '-1');   // behind the cards (elementFromPoint skips it: pointer-events none)
    expect(await backdrop.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('radial-gradient(');
    const streak = page.getByRole('region', { name: 'Day streak' });
    const box = (await streak.boundingBox())!;
    expect(await streak.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true);
    const bar = tabBar(page);
    await expect(bar).toHaveCSS('height', '58px');
    await expect(bar).toHaveCSS('background-color', dark ? 'rgba(20, 27, 39, 0.55)' : 'rgba(255, 255, 255, 0.55)');
    await expect(bar.getByRole('link', { name: 'Home', exact: true })).toHaveCSS('color', dark ? 'rgb(163, 230, 53)' : 'rgb(63, 98, 18)');
    // Inactive tabs are --app-mu, not the handoff's --mu2 (#64748b), which is under 4.5:1 on the bar.
    await expect(bar.getByRole('link', { name: 'Classes', exact: true })).toHaveCSS('color', dark ? 'rgb(148, 163, 184)' : 'rgb(71, 85, 105)');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCSS('font-weight', '900');
    await expect(h1).toHaveCSS('font-size', '24px');
    expect(await h1.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"?Outfit/);
    await expect(streak).toHaveCSS('border-radius', '24px');
    await expect(page.getByRole('main').getByRole('button', { name: 'Pass', exact: true })).toHaveCSS('border-radius', '18px');
    expect(await page.getByRole('button', { name: 'Log workout' }).evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient(135deg, rgb(163, 230, 53), rgb(132, 204, 22))');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe('none');
    await page.screenshot({ path: testInfo.outputPath(`home-${theme}.png`) });
  });
}

test('every tab screen keeps the 20 px gutter', async ({ page, request }) => {
  await useAppMode(page); await signInAs(page, request, 'member');
  for (const path of ['/dashboard', '/schedule', '/pass', '/log-workout', '/profile']) {
    await page.goto(path);
    expect((await page.locator('.app-screen > *').first().boundingBox())!.x).toBe(20);
  }
});
