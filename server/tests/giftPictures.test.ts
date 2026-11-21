import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, authHeader, db, personas, resetDb } from './helpers.js';
import { defaultGifts } from '../src/db/rewardDefaults.js';
import { DatabaseSchema, migrate } from '../src/db/database.js';

// The AI pictures the owner adds later: client/src/data/gift-pictures.json maps a gift id to /gifts/<slug>.webp.
// These tests point the server at a temporary copy of that file.
const file = path.join(os.tmpdir(), `gift-pictures-${process.pid}.json`);
const setPictures = (pictures: Record<string, string>) => fs.writeFileSync(file, JSON.stringify(pictures));

const body = (image: string) => ({ name: 'Picture test', description: '', image, level: 'small', points_cost: 100, kind: 'item', stock: 1 });
const create = (image: string) => api().post('/api/rewards/gifts').set(authHeader(personas.admin)).send(body(image));

beforeEach(() => {
  process.env.PULSEFIT_GIFT_PICTURES = file;
  setPictures({});
  resetDb();
});
afterEach(() => {
  delete process.env.PULSEFIT_GIFT_PICTURES;
  fs.rmSync(file, { force: true });
});

describe('gift pictures', () => {
  it('with no pictures every default gift keeps its emoji and no path is accepted', async () => {
    expect(defaultGifts().every(g => !g.image.startsWith('/'))).toBe(true);
    expect((await create('/gifts/mug.webp')).status).toBe(400);
  });

  it('accepts exactly the paths in the list and refuses any other path or address', async () => {
    setPictures({ gift_mug: '/gifts/mug.webp' });
    const ok = await create('/gifts/mug.webp');
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data.image).toBe('/gifts/mug.webp');
    for (const bad of ['/gifts/other.webp', '/gifts/../x.webp', 'https://example.com/mug.webp', '//example.com/gifts/mug.webp']) {
      expect((await create(bad)).status, bad).toBe(400);
    }
  });

  it('a new database gives a default gift its picture', () => {
    setPictures({ gift_mug: '/gifts/mug.webp' });
    const mug = defaultGifts().find(g => g.id === 'gift_mug')!;
    expect(mug.image).toBe('/gifts/mug.webp');
    expect(defaultGifts().find(g => g.id === 'gift_cap')!.image).not.toMatch(/^\//);
  });

  it('the start-up upgrade swaps only gifts still on their default emoji', () => {
    const [mug, cap] = ['gift_mug', 'gift_cap'].map(id => ({ ...db.gifts.find(g => g.id === id)! }));
    cap.image = '🎩'; // the admin chose their own emoji
    setPictures({ gift_mug: '/gifts/mug.webp', gift_cap: '/gifts/cap.webp' });
    const data = { membership_plans: [], users: [], trainers: [], classes: [], time_sessions: [], gifts: [mug, cap] } as unknown as DatabaseSchema;
    const out = migrate(data).gifts;
    expect(out.find(g => g.id === 'gift_mug')!.image).toBe('/gifts/mug.webp');
    expect(out.find(g => g.id === 'gift_cap')!.image).toBe('🎩');
    expect(migrate({ ...data, gifts: out } as DatabaseSchema).gifts).toEqual(out);
  });
});