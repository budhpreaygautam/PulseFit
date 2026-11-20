// Checks the private art folder (client/app-art/) against the contract in src/lib/appArt.ts:
//   npm run check:art            checks client/app-art
//   npm run check:art -- <dir>   checks another folder
// Imported by mobile-sync.mjs and android-release.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_SVG_BYTES = 120_000; // svg + css
const MAX_LOTTIE_BYTES = 250_000;
const UNSAFE_SVG = /<script|\son\w+\s*=|<foreignObject|href\s*=\s*["']?\s*https?:/i;
const LICENCES = ['Storyset free licence', 'Lottie Simple License'];

const allIds = () => {
  const { pages, moments, states } = JSON.parse(fs.readFileSync(path.join(clientDir, 'src/lib/app-art-ids.json'), 'utf8'));
  return [...pages.map(p => `page.${p}`), ...moments.map(m => `moment.${m}`), ...states.map(s => `state.${s}`)];
};

// Lottie expressions live under an `x` key, which lottie_light cannot run.
const hasKey = (node, key) =>
  node !== null && typeof node === 'object' && (key in node || Object.values(node).some(v => hasKey(v, key)));

function sceneProblem(scene) {
  if (scene.kind === 'svg') {
    if (UNSAFE_SVG.test(scene.svg) || UNSAFE_SVG.test(scene.css ?? '')) return 'unsafe SVG (script, on* attribute, foreignObject or external link)';
    const bytes = Buffer.byteLength(scene.svg) + Buffer.byteLength(scene.css ?? '');
    return bytes > MAX_SVG_BYTES ? `svg + css is ${bytes} bytes (max ${MAX_SVG_BYTES})` : '';
  }
  if (scene.kind === 'lottie') {
    if (scene.data?.assets?.some(a => 'p' in a)) return 'Lottie with embedded or linked images';
    if (hasKey(scene.data, 'x')) return 'Lottie with expressions';
    const bytes = Buffer.byteLength(JSON.stringify(scene.data));
    return bytes > MAX_LOTTIE_BYTES ? `Lottie JSON is ${bytes} bytes (max ${MAX_LOTTIE_BYTES})` : '';
  }
  return `unknown scene kind "${scene.kind}"`;
}

export async function checkArt(dir) {
  const missing = [];
  const problems = [];
  let art;
  try {
    art = await import(pathToFileURL(path.join(path.resolve(dir), 'index.js')).href);
  } catch (error) {
    return { ok: false, missing, problems: [`cannot load ${dir}/index.js: ${error.message}`] };
  }
  if (art.marker !== 'pulsefit-app-art') problems.push(`marker is "${art.marker}", not "pulsefit-app-art" (stand-in art)`);
  const credited = new Set((art.credits ?? []).flatMap(c => c.ids ?? []));
  for (const c of art.credits ?? []) {
    if (!LICENCES.includes(c.licence) || !c.title || !c.creator || !c.source) problems.push(`incomplete credit "${c.title}"`);
  }
  for (const id of allIds()) {
    let scene = null;
    try {
      scene = await art.loadScene(id);
    } catch (error) {
      problems.push(`${id}: cannot load (${error.message})`);
      continue;
    }
    if (!scene) {
      missing.push(id);
      continue;
    }
    const problem = sceneProblem(scene);
    if (problem) problems.push(`${id}: ${problem}`);
    if (!credited.has(id)) problems.push(`${id}: no credit`);
  }
  return { ok: !missing.length && !problems.length, missing, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? path.join(clientDir, 'app-art');
  const { ok, missing, problems } = await checkArt(dir);
  if (ok) console.log(`App art in ${dir} is complete.`);
  else {
    console.error(`App art in ${dir} is not ready:`);
    for (const id of missing) console.error(`  missing  ${id}`);
    for (const p of problems) console.error(`  problem  ${p}`);
    process.exit(1);
  }
}
