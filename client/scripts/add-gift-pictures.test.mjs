import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'add-gift-pictures.mjs');

/** A 200x120 white PNG with a red block in the middle: a stand-in for an AI picture. */
function fixturePng() {
  const w = 200, h = 120;
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    if (y > 30 && y < 90) for (let x = 60; x < 140; x++) raw.fill(0, y * (w * 3 + 1) + 1 + x * 3 + 1, y * (w * 3 + 1) + 1 + x * 3 + 3);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function run(root) {
  // REMBG='' skips the cut-out tool, so the test never needs it.
  return spawnSync(process.execPath, [script], { env: { ...process.env, GIFT_PICTURES_ROOT: root, REMBG: '' }, encoding: 'utf8' });
}

const rootWith = files => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-add-'));
  fs.mkdirSync(path.join(root, 'client/src/data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'client/src/data/gift-pictures.json'), '{}\n');
  fs.mkdirSync(path.join(root, 'gift-pictures-incoming'));
  for (const f of files) fs.writeFileSync(path.join(root, 'gift-pictures-incoming', f), fixturePng());
  return root;
};

test('a fixture image becomes a 512x512 WebP and a list entry', () => {
  const root = rootWith(['mug.png']);
  const r = run(root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const webp = fs.readFileSync(path.join(root, 'client/public/gifts/mug.webp'));
  assert.equal(webp.subarray(0, 4).toString(), 'RIFF');
  assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
  // Chromium writes the extended header: canvas size minus one, 24 bits each.
  assert.equal(webp.subarray(12, 16).toString(), 'VP8X');
  assert.equal(webp.readUIntLE(24, 3) + 1, 512);
  assert.equal(webp.readUIntLE(27, 3) + 1, 512);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'client/src/data/gift-pictures.json'), 'utf8')), { gift_mug: '/gifts/mug.webp' });
});

test('a file that is not named after a gift is refused and nothing is written', () => {
  const root = rootWith(['mug.png', 'teapot.png']);
  const r = run(root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /teapot/);
  assert.equal(fs.existsSync(path.join(root, 'client/public/gifts/mug.webp')), false);
});