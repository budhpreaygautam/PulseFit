// npm run gift:add: turns the pictures in gift-pictures-incoming/ (repo root, git-ignored) into the gift tiles.
// Each file is named <slug>.png|jpg|webp, where gift_<slug with - as _> is a gift in server/src/db/rewardDefaults.ts.
// Per picture: cut-out with rembg when available (REMBG = its path, else `rembg` on PATH; REMBG='' skips it),
// then onto the shared white 512x512 tile (the same size, centring and soft shadow for every gift, as the
// to-tile.cjs tool does), written to client/public/gifts/<slug>.webp, and the gift added to client/src/data/gift-pictures.json.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.GIFT_PICTURES_ROOT ?? path.resolve(here, '../..');
const incoming = path.join(root, 'gift-pictures-incoming');
const listFile = path.join(root, 'client/src/data/gift-pictures.json');
const outDir = path.join(root, 'client/public/gifts');

const fail = message => {
  console.error(message);
  process.exit(1);
};

const known = new Set([...fs.readFileSync(path.resolve(here, '../../server/src/db/rewardDefaults.ts'), 'utf8').matchAll(/\['(gift_\w+)'/g)].map(m => m[1]));
if (!fs.existsSync(incoming)) fail(`Put the pictures in ${incoming} first (named <slug>.png, .jpg or .webp).`);
const files = fs.readdirSync(incoming).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
if (files.length === 0) fail(`No pictures in ${incoming}.`);

const jobs = files.map(file => {
  const slug = file.replace(/\.[^.]+$/, '');
  return { file, slug, id: `gift_${slug.replace(/-/g, '_')}` };
});
const unknown = jobs.filter(j => !known.has(j.id));
if (unknown.length) fail(`Not a gift: ${unknown.map(j => j.file).join(', ')}. Name each file after its gift, e.g. sticker-pack.png.`);

function cutOut(input) {
  const rembg = process.env.REMBG ?? 'rembg';
  if (!rembg) return input;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gift-cut-')), 'cut.png');
  // birefnet-general (MIT): rembg's default model (BRIA RMBG-2.0) is non-commercial; this one keeps white and clear items whole.
  const r = spawnSync(rembg, ['i', '-m', 'birefnet-general', input, out], { encoding: 'utf8' });
  if (r.status === 0 && fs.existsSync(out)) return out;
  console.warn(`No cut-out for ${path.basename(input)} (rembg not available); using it as it is.`);
  return input;
}

const { chromium } = createRequire(import.meta.url)('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage();
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const tiles = [];
try {
  for (const { file, slug, id } of jobs) {
    const bytes = fs.readFileSync(cutOut(path.join(incoming, file)));
    const mime = bytes[0] === 0x89 ? 'image/png' : bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/jpeg';
    const result = await page.evaluate(
      async ({ src, fill }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight;
        const probe = document.createElement('canvas');
        probe.width = w;
        probe.height = h;
        const pc = probe.getContext('2d', { willReadFrequently: true });
        pc.drawImage(img, 0, 0);
        const data = pc.getImageData(0, 0, w, h).data;
        // The item = pixels that are neither transparent nor near-white background.
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] > 24 && !(data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236)) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return { error: 'no item found (blank or all white)' };
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        const S = 512, box = S * fill, scale = Math.min(box / bw, box / bh);
        const dw = bw * scale, dh = bh * scale, dx = (S - dw) / 2, dy = (S - dh) / 2 - S * 0.02;
        const out = document.createElement('canvas');
        out.width = out.height = S;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, S, S);
        const cy = dy + dh + S * 0.012, rx = dw * 0.42, ry = Math.max(6, S * 0.022);
        const grad = ctx.createRadialGradient(S / 2, cy, 0, S / 2, cy, rx);
        grad.addColorStop(0, 'rgba(15,23,42,0.16)');
        grad.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.save();
        ctx.translate(S / 2, cy);
        ctx.scale(1, ry / rx);
        ctx.translate(-S / 2, -cy);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(S / 2, cy, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x0, y0, bw, bh, dx, dy, dw, dh);
        return { url: out.toDataURL('image/webp', 0.85) };
      },
      { src: `data:${mime};base64,${bytes.toString('base64')}`, fill: 0.74 }
    );
    if (result.error) fail(`${file}: ${result.error}`);
    tiles.push({ slug, id, webp: Buffer.from(result.url.split(',')[1], 'base64') });
  }
} finally {
  await browser.close();
}

// Write only once every picture worked, so a bad file never leaves a half-added set.
fs.mkdirSync(outDir, { recursive: true });
for (const { slug, id, webp } of tiles) {
  fs.writeFileSync(path.join(outDir, `${slug}.webp`), webp);
  list[id] = `/gifts/${slug}.webp`;
  console.log(`${id} -> /gifts/${slug}.webp (${webp.length} bytes)`);
}
fs.writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`);