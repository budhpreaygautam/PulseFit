import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import type { RequestHandler } from 'express';

// The built scripts and styles under /assets/, sent compressed (Brotli, else gzip). They are about
// three quarters smaller that way, which on a phone network is most of the wait before the first
// page shows. Each file is compressed once and kept in memory: the names carry a content hash, so a
// file never changes. A proxy in front that compresses too (Cloudflare does) passes these through
// as they are. Anything else (and a client that accepts neither encoding) goes on to express.static.

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/** Smaller files gain too little to be worth a second request header and a cache entry. */
const MIN_BYTES = 1024;
const COMPRESSIBLE = /^[\w.-]+\.(js|css|svg)$/;

type Compressed = { br: Buffer; gzip: Buffer } | null;
const cache = new Map<string, Promise<Compressed>>();

async function compress(file: string): Promise<Compressed> {
  const raw = await fs.promises.readFile(file);
  if (raw.length < MIN_BYTES) return null;
  const [br, gz] = await Promise.all([
    brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }),
    gzip(raw, { level: 9 })
  ]);
  return { br, gzip: gz };
}

/** The compressed copies of a file, made on first use; undefined when the file is not there. */
async function compressed(file: string): Promise<Compressed | undefined> {
  const stats = await fs.promises.stat(file).catch(() => null);
  if (!stats?.isFile()) return undefined;
  const key = `${file}:${stats.mtimeMs}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = compress(file);
    cache.set(key, pending);
    // A failure is not remembered: the next request tries again.
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

/** Compresses the build's scripts and styles in the background, so the first visitors after a start do not wait for it. */
export function warmCompressedAssets(root: string): void {
  const dir = path.join(root, 'assets');
  fs.readdir(dir, (error, names) => {
    if (error) return;
    for (const name of names) if (COMPRESSIBLE.test(name)) compressed(path.join(dir, name)).catch(() => undefined);
  });
}

/** Serves /assets/*.js, *.css and *.svg from the build at root() compressed, when the client accepts it. */
export function compressedAssets(root: () => string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = req.path.startsWith('/assets/') ? req.path.slice('/assets/'.length) : '';
    const match = COMPRESSIBLE.exec(name);
    const accepted = String(req.headers['accept-encoding'] ?? '');
    const encoding = /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : null;
    if (!match || !encoding) return next();

    // A file that is not (or no longer) in the build, or too small to compress, is left to
    // express.static, which answers 404 for a missing one.
    compressed(path.join(root(), 'assets', name)).then(
      copies => {
        if (!copies) return next();
        const body = copies[encoding];
        res.setHeader('Content-Encoding', encoding);
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', String(body.length));
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.type(match[1]);
        if (req.method === 'HEAD') res.end();
        else res.end(body);
      },
      () => next()
    );
  };
}
