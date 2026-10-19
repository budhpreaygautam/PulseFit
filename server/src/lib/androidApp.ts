import fs from 'fs';
import path from 'path';
import type { RequestHandler } from 'express';
import config from '../config.js';

// The Android app (an APK) the website offers to Android visitors. It lives in the downloads folder
// next to the database (config.downloadsDir, on the data volume in production), not in the build, so
// copying a new pulsefit.apk there puts it live at once. An optional pulsefit.json beside it,
// { versionName, versionCode, sha256 }, names the version. GET /api/config says whether there is one.

export const ANDROID_APP_URL = '/downloads/pulsefit.apk';
const APK_FILE = 'pulsefit.apk';
const META_FILE = 'pulsefit.json';

export interface AndroidAppInfo {
  url: string;
  /** versionName from pulsefit.json, when it has one. */
  version?: string;
  /** Bytes. */
  size: number;
}

const apkPath = () => path.join(config.downloadsDir, APK_FILE);

/** The version name in pulsefit.json; anything missing or malformed is ignored, never an error. */
function readVersion(file: string): string | undefined {
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8')) as { versionName?: unknown };
    const name = typeof meta.versionName === 'string' ? meta.versionName.trim() : '';
    return name && name.length <= 40 ? name : undefined;
  } catch {
    return undefined;
  }
}

// Two stats per call; pulsefit.json is read again only when one of the files has changed.
let cached: { key: string; info: AndroidAppInfo } | null = null;

/** The APK on offer, or null when the downloads folder has none. */
export function androidAppInfo(): AndroidAppInfo | null {
  const apk = fs.statSync(apkPath(), { throwIfNoEntry: false });
  if (!apk?.isFile() || apk.size === 0) return null;
  const metaFile = path.join(config.downloadsDir, META_FILE);
  const meta = fs.statSync(metaFile, { throwIfNoEntry: false });
  const key = `${apkPath()}:${apk.mtimeMs}:${apk.size}:${meta?.mtimeMs ?? ''}:${meta?.size ?? ''}`;
  if (cached?.key !== key) {
    const version = meta?.isFile() ? readVersion(metaFile) : undefined;
    cached = { key, info: { url: ANDROID_APP_URL, ...(version ? { version } : {}), size: apk.size } };
  }
  return cached.info;
}

/**
 * GET /downloads/pulsefit.apk: always a download, revalidated on every request so a new version
 * reaches people at once (ETag/Last-Modified make the check cheap). 404 when there is no APK.
 */
export const sendAndroidApp: RequestHandler = (_req, res, next) => {
  const notFound = () => res.status(404).type('text/plain').set('Cache-Control', 'no-cache').send('Not found');
  if (!androidAppInfo()) return notFound();
  res.sendFile(
    apkPath(),
    {
      cacheControl: false,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="PulseFit.apk"',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    err => {
      // A visitor who stops the download is not an error; a file removed meanwhile is a 404.
      if (!err || res.headersSent) return;
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return void notFound();
      next(err);
    }
  );
};
