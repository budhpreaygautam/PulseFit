import net from 'net';

// Checks for images people upload as data URLs (profile photos) and for remote image addresses
// staff paste into forms. Dimensions come from the file headers, so no image library is needed.

export const MAX_IMAGE_DIMENSION = 2048;
export const MAX_IMAGE_BYTES = 300 * 1024;
const MAX_IMAGE_URL_LENGTH = 500;

type ImageType = 'png' | 'jpeg' | 'webp';
export type ImageCheck = { ok: true } | { ok: false; error: string };

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/;
// Base64 of MAX_IMAGE_BYTES, so an oversized string is refused before it is decoded.
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

const fail = (error: string): ImageCheck => ({ ok: false, error });

function sniff(bytes: Buffer): ImageType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

type Size = { width: number; height: number };

function pngSize(bytes: Buffer): Size | null {
  if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes: Buffer): Size | null {
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (bytes[i + 1] === 0xff && i + 2 < bytes.length) i++;
    const marker = bytes[i + 1];
    i += 2;
    // Markers without a length: TEM and RST0-7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // End of image or start of scan before any frame header.
    if (marker === 0xd9 || marker === 0xda || i + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(i);
    if (length < 2) return null;
    // SOF0-15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 7 > bytes.length) return null;
      return { height: bytes.readUInt16BE(i + 3), width: bytes.readUInt16BE(i + 5) };
    }
    i += length;
  }
  return null;
}

function webpSize(bytes: Buffer): Size | null {
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

const SIZE_READERS: Record<ImageType, (bytes: Buffer) => Size | null> = { png: pngSize, jpeg: jpegSize, webp: webpSize };

/**
 * A base64 PNG, JPEG or WebP data URL whose bytes really are that type, at most
 * MAX_IMAGE_DIMENSION pixels on each side and MAX_IMAGE_BYTES once decoded.
 */
export function validateImageDataUrl(dataUrl: string): ImageCheck {
  if (typeof dataUrl !== 'string') return fail('Choose a PNG, JPEG or WebP image.');
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || dataUrl.length - comma - 1 > MAX_BASE64_LENGTH) {
    return dataUrl.startsWith('data:image/') && comma !== -1
      ? fail('The image is too large. Use one under 300 KB.')
      : fail('Choose a PNG, JPEG or WebP image.');
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match) return fail('Choose a PNG, JPEG or WebP image.');
  const [, declared, base64] = match;
  if (base64.length % 4 !== 0) return fail('The image could not be read.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) return fail('The image is too large. Use one under 300 KB.');

  const actual = sniff(bytes);
  if (!actual || actual !== declared) return fail('The file is not the kind of image it claims to be.');
  const size = SIZE_READERS[actual](bytes);
  if (!size || size.width < 1 || size.height < 1) return fail('The image could not be read.');
  if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
    return fail(`The image is too large. Use one at most ${MAX_IMAGE_DIMENSION} × ${MAX_IMAGE_DIMENSION} pixels.`);
  }
  return { ok: true };
}

// Names that only resolve inside a network (RFC 6761/6762 and common internal suffixes).
const PRIVATE_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa'];

/**
 * An https:// image address on a public host name: no IP addresses, no localhost or internal
 * names, no credentials, at most 500 characters.
 */
export function isAllowedRemoteImageUrl(value: string): boolean {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  // The URL parser already turns numeric forms such as 2130706433 into 127.0.0.1.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || net.isIP(host) !== 0) return false;
  // A single label (intranet, printer) only resolves on a local network.
  if (!host.includes('.')) return false;
  return !PRIVATE_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}
