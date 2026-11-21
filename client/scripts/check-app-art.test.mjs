import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkArt } from './check-app-art.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ids = JSON.parse(fs.readFileSync(path.join(here, '../src/lib/app-art-ids.json'), 'utf8'));
const ALL = [...ids.pages.map(p => `page.${p}`), ...ids.moments.map(m => `moment.${m}`), ...ids.states.map(s => `state.${s}`)];
const SVG = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

// Writes a complete art folder; `tweak({ scenes, credits, marker })` breaks one thing.
function fixture(tweak = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-art-'));
  const scenes = Object.fromEntries(ALL.map(id => [id, { kind: 'svg', svg: SVG, css: '' }]));
  const state = {
    scenes,
    credits: [{ ids: ALL, title: 't', creator: 'c', source: 's', licence: 'Storyset free licence' }],
    marker: 'pulsefit-app-art'
  };
  tweak(state);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `const scenes = ${JSON.stringify(state.scenes)};
export const marker = ${JSON.stringify(state.marker)};
export const credits = ${JSON.stringify(state.credits)};
export const loadScene = async id => scenes[id] ?? null;
export const loadLottie = async () => { throw new Error('unused'); };`
  );
  return dir;
}
const problemsOf = async tweak => (await checkArt(fixture(tweak))).problems.join('\n');

test('passes a complete folder', async () => {
  assert.deepEqual(await checkArt(fixture()), { ok: true, missing: [], problems: [] });
});

test('reports a missing scene', async () => {
  const r = await checkArt(fixture(s => delete s.scenes['page.home']));
  assert.ok(r.missing.includes('page.home'));
  assert.equal(r.ok, false);
});

test('refuses unsafe SVG', async () => {
  const unsafe = [
    '<script>x</script>',
    '<circle onclick="x()"/>',
    '<g x="1"onload="x()"/>',
    '<foreignObject/>',
    '<image href="http://x/y.png"/>',
    '<image href="//x/y.png"/>',
    '<rect style="fill: url(https://x/y)"/>',
    '<style>@import "x.css";</style>'
  ];
  for (const bad of unsafe) {
    const p = await problemsOf(s => (s.scenes['page.home'] = { kind: 'svg', svg: `<svg>${bad}</svg>`, css: '' }));
    assert.match(p, /page\.home/, bad);
  }
});

test('refuses Lottie with images or expressions', async () => {
  const lottie = data => s => (s.scenes['page.home'] = { kind: 'lottie', data, stillFrame: 0 });
  assert.match(await problemsOf(lottie({ assets: [{ id: 'i', p: 'img_0.png' }], layers: [] })), /page\.home/);
  assert.match(await problemsOf(lottie({ assets: [], layers: [{ ks: { o: { a: 0, k: 1, x: 'wiggle(1,2)' } } }] })), /page\.home/);
  assert.equal(await problemsOf(lottie({ assets: [], layers: [] })), '');
  const easing = { assets: [], layers: [{ ks: { o: { a: 1, k: [{ i: { x: [0.8], y: [0.8] }, o: { x: [0.2], y: [0] }, t: 0, s: [0] }] } } }] };
  assert.equal(await problemsOf(lottie(easing)), '');
});

test('accepts the AI mascot licence and refuses an unknown one', async () => {
  const withLicence = licence => s => (s.credits[0].licence = licence);
  assert.equal(await problemsOf(withLicence('AI Horde + FLUX.1 [schnell] (Apache-2.0)')), '');
  assert.match(await problemsOf(withLicence('Some other licence')), /incomplete credit/);
});

test('reports a credit for an unknown scene', async () => {
  assert.match(await problemsOf(s => s.credits[0].ids.push('page.nope')), /unknown scene page\.nope/);
});

test('refuses a missing credit', async () => {
  const p = await problemsOf(s => (s.credits[0].ids = ALL.filter(id => id !== 'moment.saved')));
  assert.match(p, /moment\.saved/);
});

test('refuses oversize files', async () => {
  const big = n => 'x'.repeat(n);
  assert.match(await problemsOf(s => (s.scenes['page.home'] = { kind: 'svg', svg: `<svg>${big(100000)}</svg>`, css: big(30000) })), /page\.home/);
  assert.match(await problemsOf(s => (s.scenes['page.home'] = { kind: 'lottie', data: { layers: [], nm: big(260000) }, stillFrame: 0 })), /page\.home/);
});

test('refuses a stand-in marker', async () => {
  assert.match(await problemsOf(s => (s.marker = 'pulsefit-app-art-stub')), /marker/);
});

test('emptyScene is stable and momentFor maps types', async () => {
  const esbuild = await import('esbuild');
  const out = await esbuild.build({ entryPoints: [path.join(here, '../src/lib/appArt.ts')], bundle: true, format: 'esm', write: false, loader: { '.json': 'json' } });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
  for (const key of ['a', 'classes', '/members', 'x'.repeat(40)]) {
    assert.equal(mod.emptyScene(key), mod.emptyScene(key));
    assert.match(mod.emptyScene(key), /^state\.empty[123]$/);
  }
  assert.equal(mod.momentFor('error'), 'failed');
  assert.equal(mod.momentFor('success'), 'saved');
  assert.equal(mod.momentFor('info'), 'info');
  assert.equal(mod.momentFor('error', 'paid'), 'paid');
});
