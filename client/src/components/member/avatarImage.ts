import { Gender } from '../../types/index.js';

// The API accepts a profile photo as a data URL of at most 350 000 characters inside a 512 KB
// JSON body, so photos are shrunk in the browser before upload.
export const AVATAR_MAX_SIZE = 256;
export const AVATAR_MAX_CHARS = 350_000;

/**
 * The picture for someone without a photo, shipped with the app (client/public/avatars), so
 * nothing about them goes to another service. Only the person and admins receive a gender; every
 * other view (coaches, the public, the check-in scanner) passes none and gets the neutral one.
 */
export function defaultAvatar(gender?: Gender | null): string {
  const file = gender === 'male' || gender === 'female' ? gender : 'neutral';
  return `${import.meta.env.BASE_URL}avatars/${file}.svg`;
}

/**
 * The ten avatars a member can choose on My account instead of a photo. The API accepts exactly these
 * paths as avatar_url; they are absolute because the stored value is shared by the website and the apps.
 */
export const PRESET_AVATARS = [
  'Short dark hair and a lime sweatband',
  'Auburn ponytail',
  'Buzz cut and a full beard',
  'Big curly hair',
  'Plum hijab',
  'Red baseball cap',
  'Hair in a bun and round glasses',
  'Bald with a grey beard and a sweatband',
  'Long straight black hair',
  'Wavy auburn hair and a gym towel'
].map((label, i) => ({ label, src: `/avatars/preset-${String(i + 1).padStart(2, '0')}.svg` }));

/** Their photo when they have one (it always wins), else the default picture. */
export const avatarOf = (person: { avatar_url?: string | null; gender?: Gender | null }): string =>
  person.avatar_url || defaultAvatar(person.gender);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image. Try a PNG, JPEG or WebP photo.'));
    };
    img.src = url;
  });
}

/** Resize to fit within 256×256 and encode as JPEG, lowering quality until it fits the API limit. */
export async function resizeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPEG or WebP).');
  const img = await loadImage(file);
  const scale = Math.min(1, AVATAR_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process the image.');
  // JPEG has no transparency; paint white behind transparent PNGs instead of black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= AVATAR_MAX_CHARS) return dataUrl;
  }
  throw new Error('That photo is too detailed to upload. Please choose a different one.');
}
