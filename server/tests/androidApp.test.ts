import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import config from '../src/config.js';
import { api, resetDb } from './helpers.js';

// The Android app download: GET /downloads/pulsefit.apk from the downloads folder next to the
// database, and androidApp in GET /api/config.

const original = {
  downloadsDir: config.downloadsDir,
  serveClient: config.serveClient,
  clientDistPath: config.clientDistPath,
  allowIndexing: config.allowIndexing,
  publicUrl: config.publicUrl
};
const downloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsefit-downloads-'));
// A stand-in for client/dist, so the app's HTML fallback is in play as it is in production.
const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsefit-dist-'));
const APK = Buffer.from('PK\u0003\u0004 not really an apk, but bytes all the same \u0000ÿ', 'latin1');

/** supertest only buffers text and JSON by itself. */
const binary = (res: NodeJS.ReadableStream, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

const getApk = () => api().get('/downloads/pulsefit.apk').buffer(true).parse(binary as never);
const androidApp = async () => (await api().get('/api/config')).body.data.androidApp;

beforeAll(() => {
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    '<!doctype html>\n<html lang="en">\n  <head>\n    <title>PulseFit</title>\n    <meta name="description" content="x" />\n    <!--app-head-->\n  </head>\n  <body><div id="root"></div></body>\n</html>\n'
  );
});

afterAll(() => {
  fs.rmSync(downloadsDir, { recursive: true, force: true });
  fs.rmSync(distDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetDb();
  fs.rmSync(downloadsDir, { recursive: true, force: true });
  Object.assign(config, { downloadsDir, serveClient: true, clientDistPath: distDir });
});

afterEach(() => {
  Object.assign(config, original);
});

describe('without an APK', () => {
  it('answers a plain 404, not the app, and /api/config reports no app', async () => {
    const res = await api().get('/downloads/pulsefit.apk');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).not.toContain('<html');
    expect(await androidApp()).toBeNull();
  });

  it('treats an empty downloads folder or an empty file as no app', async () => {
    fs.mkdirSync(downloadsDir, { recursive: true });
    expect(await androidApp()).toBeNull();
    fs.writeFileSync(path.join(downloadsDir, 'pulsefit.apk'), '');
    expect(await androidApp()).toBeNull();
    expect((await api().get('/downloads/pulsefit.apk')).status).toBe(404);
  });

  it('never serves other files from the downloads folder', async () => {
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.writeFileSync(path.join(downloadsDir, 'pulsefit.json'), '{}');
    for (const url of ['/downloads/pulsefit.json', '/downloads/', '/downloads/other.apk']) {
      const res = await api().get(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).not.toContain('<html');
    }
  });
});

describe('with an APK in the downloads folder', () => {
  beforeEach(() => {
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.writeFileSync(path.join(downloadsDir, 'pulsefit.apk'), APK);
  });

  it('sends the file as a download that is revalidated every time', async () => {
    const res = await getApk();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(res.headers['content-disposition']).toBe('attachment; filename="PulseFit.apk"');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(Number(res.headers['content-length'])).toBe(APK.length);
    expect(Buffer.compare(res.body as Buffer, APK)).toBe(0);
  });

  it('answers a repeat request for the same file with 304', async () => {
    const first = await getApk();
    const again = await api().get('/downloads/pulsefit.apk').set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
  });

  it('lets an interrupted download resume', async () => {
    const res = await getApk().set('Range', 'bytes=4-9');
    expect(res.status).toBe(206);
    expect(Buffer.compare(res.body as Buffer, APK.subarray(4, 10))).toBe(0);
  });

  it('is reported by /api/config with its size, and its version when pulsefit.json names one', async () => {
    expect(await androidApp()).toEqual({ url: '/downloads/pulsefit.apk', size: APK.length });

    fs.writeFileSync(path.join(downloadsDir, 'pulsefit.json'), JSON.stringify({ versionName: '2.2.0', versionCode: 220, sha256: 'ab'.repeat(32) }));
    expect(await androidApp()).toEqual({ url: '/downloads/pulsefit.apk', version: '2.2.0', size: APK.length });
  });

  it('ignores a malformed pulsefit.json', async () => {
    fs.writeFileSync(path.join(downloadsDir, 'pulsefit.json'), '{ not json');
    expect(await androidApp()).toEqual({ url: '/downloads/pulsefit.apk', size: APK.length });
  });

  it('picks up a new APK without a restart', async () => {
    expect((await androidApp()).size).toBe(APK.length);
    const next = Buffer.concat([APK, APK]);
    fs.writeFileSync(path.join(downloadsDir, 'pulsefit.apk'), next);
    expect((await androidApp()).size).toBe(next.length);
    expect(Buffer.compare((await getApk()).body as Buffer, next)).toBe(0);

    fs.rmSync(path.join(downloadsDir, 'pulsefit.apk'));
    expect(await androidApp()).toBeNull();
    expect((await api().get('/downloads/pulsefit.apk')).status).toBe(404);
  });

  it('is kept out of search results', async () => {
    Object.assign(config, { allowIndexing: true, publicUrl: 'https://gym.example.in' });
    expect((await api().get('/robots.txt')).text.split('\n')).toContain('Disallow: /downloads/');
  });
});
