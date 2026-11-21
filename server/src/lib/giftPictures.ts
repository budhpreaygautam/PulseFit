import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The built-in gift pictures: gift id -> /gifts/<slug>.webp, the one list the website and the apps share
// (client/src/data/gift-pictures.json; the Docker image copies it next to the server). Read on each use
// so a missing or damaged file just means "no pictures", never a failed start.
const LISTED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/data/gift-pictures.json');

export function giftPictures(): Record<string, string> {
  try {
    const list: unknown = JSON.parse(fs.readFileSync(process.env.PULSEFIT_GIFT_PICTURES ?? LISTED, 'utf-8'));
    return list && typeof list === 'object' ? (list as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export const isGiftPicture = (image: string) => Object.values(giftPictures()).includes(image);