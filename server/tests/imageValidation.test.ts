import { beforeEach, describe, expect, it } from 'vitest';
import { isAllowedRemoteImageUrl, validateImageDataUrl } from '../src/lib/imageValidation.js';
import { api, authHeader, db, personas, resetDb } from './helpers.js';

const u32be = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const u16be = (n: number) => Buffer.from([n >> 8, n & 0xff]);
const u24le = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);

function png(width: number, height: number, padding = 0): Buffer {
  const ihdr = Buffer.concat([u32be(width), u32be(height), Buffer.from([8, 6, 0, 0, 0])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    u32be(13),
    Buffer.from('IHDR'),
    ihdr,
    u32be(0), // CRC: not checked
    Buffer.alloc(padding)
  ]);
}

function jpeg(width: number, height: number, sof = 0xc0): Buffer {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), u16be(16), Buffer.from('JFIF\0'), Buffer.alloc(9)]);
  const dqt = Buffer.concat([Buffer.from([0xff, 0xdb]), u16be(67), Buffer.alloc(65)]);
  const frame = Buffer.concat([Buffer.from([0xff, sof]), u16be(17), Buffer.from([8]), u16be(height), u16be(width), Buffer.alloc(10)]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, dqt, frame, Buffer.from([0xff, 0xd9])]);
}

function riff(chunk: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(4 + 8 + data.length);
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from('RIFF'), size, Buffer.from('WEBP'), Buffer.from(chunk), chunkSize, data]);
}

const webpVp8x = (w: number, h: number) => riff('VP8X', Buffer.concat([Buffer.from([0, 0, 0, 0]), u24le(w - 1), u24le(h - 1)]));
const webpVp8l = (w: number, h: number) => {
  const bits = Buffer.alloc(4);
  bits.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0);
  return riff('VP8L', Buffer.concat([Buffer.from([0x2f]), bits, Buffer.alloc(4)]));
};
const webpVp8 = (w: number, h: number) => {
  const dims = Buffer.alloc(4);
  dims.writeUInt16LE(w);
  dims.writeUInt16LE(h, 2);
  return riff('VP8 ', Buffer.concat([Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]), dims, Buffer.alloc(4)]));
};

const dataUrl = (type: string, bytes: Buffer) => `data:image/${type};base64,${bytes.toString('base64')}`;

describe('validateImageDataUrl', () => {
  it('accepts small PNG, JPEG (baseline and progressive) and WebP (VP8X, VP8L, VP8) images', () => {
    for (const [type, bytes] of [
      ['png', png(64, 48)],
      ['jpeg', jpeg(640, 480)],
      ['jpeg', jpeg(2048, 2048, 0xc2)],
      ['webp', webpVp8x(300, 200)],
      ['webp', webpVp8l(128, 1)],
      ['webp', webpVp8(2048, 100)]
    ] as const) {
      expect(validateImageDataUrl(dataUrl(type, bytes)), `${type} ${bytes.length}`).toEqual({ ok: true });
    }
  });

  it('refuses bytes that are not the declared type', () => {
    expect(validateImageDataUrl(dataUrl('jpeg', png(10, 10))).ok).toBe(false);
    expect(validateImageDataUrl(dataUrl('png', jpeg(10, 10))).ok).toBe(false);
    expect(validateImageDataUrl(dataUrl('png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).ok).toBe(false);
  });

  it('refuses other image types and anything that is not a base64 data URL', () => {
    for (const value of [
      dataUrl('svg+xml', Buffer.from('<svg/>')),
      dataUrl('gif', Buffer.from('GIF89a')),
      'data:image/png,rawbytes',
      'data:image/png;base64,***',
      'https://example.com/a.png',
      ''
    ]) {
      expect(validateImageDataUrl(value).ok, value.slice(0, 40)).toBe(false);
    }
  });

  it('refuses images over 2048 pixels on a side', () => {
    for (const [type, bytes] of [
      ['png', png(2049, 10)],
      ['jpeg', jpeg(10, 4000)],
      ['webp', webpVp8x(5000, 5000)],
      ['webp', webpVp8l(2049, 2)]
    ] as const) {
      const result = validateImageDataUrl(dataUrl(type, bytes));
      expect(result.ok, type).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/2048/);
    }
  });

  it('refuses more than 300 KB once decoded', () => {
    expect(validateImageDataUrl(dataUrl('png', png(100, 100, 300 * 1024 - 100))).ok).toBe(true);
    const big = validateImageDataUrl(dataUrl('png', png(100, 100, 300 * 1024 + 1)));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toMatch(/300 KB/);
  });

  it('refuses truncated headers', () => {
    expect(validateImageDataUrl(dataUrl('png', png(10, 10).subarray(0, 20))).ok).toBe(false);
    expect(validateImageDataUrl(dataUrl('jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).ok).toBe(false);
    expect(validateImageDataUrl(dataUrl('webp', webpVp8x(10, 10).subarray(0, 24))).ok).toBe(false);
  });
});

describe('isAllowedRemoteImageUrl', () => {
  it('accepts https addresses on public host names', () => {
    for (const url of [
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=PF-abc123',
      'https://cdn.example.co.in/coach.webp'
    ]) {
      expect(isAllowedRemoteImageUrl(url), url).toBe(true);
    }
  });

  it('refuses http, other schemes, IP literals, local and internal names, credentials and long addresses', () => {
    for (const url of [
      'http://images.example.com/a.png',
      'javascript:alert(1)',
      'data:image/png;base64,iVBORw0KGgo=',
      'ftp://example.com/a.png',
      'https://127.0.0.1/a.png',
      'https://2130706433/a.png',
      'https://0x7f.1/a.png',
      'https://10.0.0.5/a.png',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/a.png',
      'https://[fd00::1]/a.png',
      'https://localhost/a.png',
      'https://api.localhost/a.png',
      'https://printer.local/a.png',
      'https://metadata.google.internal/a.png',
      'https://nas.lan/a.png',
      'https://router.home.arpa/a.png',
      'https://intranet/a.png',
      'https://user:pass@example.com/a.png',
      `https://example.com/${'a'.repeat(490)}.png`,
      'not a url'
    ]) {
      expect(isAllowedRemoteImageUrl(url), url).toBe(false);
    }
  });
});

describe('trainer avatar and class image addresses', () => {
  beforeEach(() => resetDb());

  it('refuses plain http and private hosts, and keeps accepting public https images', async () => {
    const admin = authHeader(personas.admin);
    for (const avatar_url of ['http://insecure.example.com/a.png', 'https://192.168.1.10/a.png', 'https://localhost/a.png']) {
      const res = await api().put('/api/trainers/trn_vikram').set(admin).send({ avatar_url });
      expect(res.status, avatar_url).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    const ok = await api().put('/api/trainers/trn_vikram').set(admin).send({ avatar_url: 'https://images.example.com/vikram.jpg' });
    expect(ok.status).toBe(200);

    const cls = db.classes[0];
    for (const image_url of ['http://images.example.com/x.jpg', 'https://10.1.2.3/x.jpg']) {
      const res = await api().put(`/api/classes/${cls.id}`).set(admin).send({ image_url });
      expect(res.status, image_url).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await api().put(`/api/classes/${cls.id}`).set(admin).send({ image_url: 'https://images.example.com/x.jpg' })).status).toBe(200);
  });
});
