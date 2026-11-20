import { beforeEach, describe, expect, it } from 'vitest';
import { api, authHeader, db, personas, resetDb } from './helpers.js';

// The website's service pages need an account. The only API answers a guest gets are what the public
// home page shows: GET /classes, /trainers and /plans in a guest view, an allowlist of fields. A
// signed-in account gets the full shapes, and everything else the service pages read needs a session.

const GUEST_CLASS_KEYS = [
  'capacity',
  'category',
  'day_of_week',
  'duration_minutes',
  'id',
  'is_full',
  'occurrence_date',
  'room',
  'spots_left',
  'start_time',
  'starts_at',
  'title',
  'trainer_name'
];
const GUEST_TRAINER_KEYS = ['avatar_url', 'bio', 'experience_years', 'id', 'name', 'rating', 'reviews_count', 'specialties'];
const GUEST_PLAN_KEYS = ['badge', 'categories', 'description', 'features', 'id', 'is_popular', 'name', 'price_monthly', 'tier'];

const keysOf = (value: object) => Object.keys(value).sort();
/** Guests, and anyone whose token is not a session (forged, expired or revoked), get the guest view. */
const asGuests = [() => api(), () => api().set('Authorization', 'Bearer not-a-real-token')];

beforeEach(() => resetDb());

describe('GET /classes for guests', () => {
  it('lists only the next four sessions, with only the fields the home page shows', async () => {
    const full = (await api().get('/api/classes').set(authHeader(personas.member))).body.data;
    expect(full.length).toBeGreaterThan(4);
    for (const guest of asGuests) {
      const res = await guest().get('/api/classes');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-cache');
      // Not the week's timetable: that is the Timetable page's, for signed-in accounts.
      expect(res.body.data).toHaveLength(4);
      for (const [i, occurrence] of res.body.data.entries()) {
        expect(keysOf(occurrence)).toEqual(GUEST_CLASS_KEYS);
        // The same values the signed-in timetable has, for the fields guests do get.
        expect(occurrence).toEqual(Object.fromEntries(GUEST_CLASS_KEYS.map(k => [k, full[i][k]])));
      }
      // No description (or any other field guests do not get) leaks in another field.
      const text = JSON.stringify(res.body);
      for (const c of db.classes) {
        if (c.description) expect(text).not.toContain(c.description);
        expect(text).not.toContain(c.image_url);
      }
      for (const later of full.slice(4)) expect(text).not.toContain(`"${later.id}"`);
    }
  });

  it("gives the home page's weekly class count in GET /config instead", async () => {
    expect((await api().get('/api/config')).body.data.gym.classesPerWeek).toBe(db.classes.length);
  });

  it('refuses any filter with 401, so guests cannot search the fields they do not get', async () => {
    for (const query of ['search=deadlift', 'intensity=High', 'category=Zumba%20%26%20Cardio', 'trainerId=trn_vikram', 'week_start=2026-10-05', 'day=', 'day=4']) {
      const res = await api().get(`/api/classes?${query}`);
      expect(res.status, query).toBe(401);
      expect(res.body, query).toEqual({ success: false, error: expect.any(String), code: 'UNAUTHORIZED' });
    }
  });

  it('gives signed-in accounts the full occurrences, filters included', async () => {
    const res = await api().get('/api/classes?category=Zumba%20%26%20Cardio').set(authHeader(personas.basic));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-cache');
    for (const occurrence of res.body.data) {
      expect(occurrence).toMatchObject({ description: expect.any(String), intensity: expect.any(String), image_url: expect.any(String), trainer_id: expect.any(String) });
      expect(occurrence).toHaveProperty('booked_count');
      expect(occurrence).toHaveProperty('my_booking_id');
    }
  });

  it('keeps a single class and a single coach for signed-in accounts', async () => {
    for (const url of ['/api/classes/cls_str_mon', '/api/trainers/trn_vikram']) {
      for (const guest of asGuests) {
        const res = await guest().get(url);
        expect(res.status, url).toBe(401);
        expect(res.body.data, url).toBeUndefined();
      }
      expect((await api().get(url).set(authHeader(personas.member))).status, url).toBe(200);
    }
  });
});

describe('GET /trainers for guests', () => {
  it('lists the four coaches the home page shows, two specialties each, and nothing else', async () => {
    // A fifth coach: the home page shows the first four, so guests get those only.
    const added = await api()
      .post('/api/trainers')
      .set(authHeader(personas.admin))
      .send({ name: 'Neha Iyer', email: 'neha@pulsefit.com', bio: 'Mobility coach.', specialties: ['Mobility', 'Yoga', 'Pilates'], instagram: '@neha' });
    expect(added.status).toBe(201);
    const full = (await api().get('/api/trainers').set(authHeader(personas.member))).body.data;
    expect(full).toHaveLength(5);

    for (const guest of asGuests) {
      const res = await guest().get('/api/trainers');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect(res.body.data).toHaveLength(4);
      for (const [i, trainer] of res.body.data.entries()) {
        expect(keysOf(trainer)).toEqual(GUEST_TRAINER_KEYS);
        expect(trainer).toEqual({ ...Object.fromEntries(GUEST_TRAINER_KEYS.map(k => [k, full[i][k]])), specialties: full[i].specialties.slice(0, 2) });
      }
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('Neha Iyer');
      for (const t of db.trainers) {
        expect(text).not.toContain(t.email);
        if (t.instagram) expect(text).not.toContain(t.instagram);
      }
    }
  });

  it('gives signed-in accounts every coach with their class counts', async () => {
    const res = await api().get('/api/trainers').set(authHeader(personas.trainer));
    expect(res.headers['cache-control']).toBe('private, no-cache');
    expect(res.body.data).toHaveLength(db.trainers.length);
    for (const trainer of res.body.data) {
      expect(trainer).toMatchObject({ instagram: expect.any(String), classes_count: expect.any(Number) });
      expect(trainer.specialties).toEqual(db.trainers.find(t => t.id === trainer.id)!.specialties);
    }
  });
});

describe('GET /plans for guests', () => {
  it('lists each plan with its monthly price and the first four features, without annual prices', async () => {
    const full = (await api().get('/api/plans').set(authHeader(personas.member))).body.data;
    expect(full.some((p: { features: string[] }) => p.features.length > 4)).toBe(true);
    for (const guest of asGuests) {
      const res = await guest().get('/api/plans');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect(res.body.data.map((p: { tier: string }) => p.tier)).toEqual(full.map((p: { tier: string }) => p.tier));
      for (const [i, plan] of res.body.data.entries()) {
        // badge and is_popular are optional on a plan; nothing outside the allowlist is ever sent.
        expect(GUEST_PLAN_KEYS).toEqual(expect.arrayContaining(keysOf(plan)));
        expect(keysOf(plan)).toEqual(expect.arrayContaining(['categories', 'description', 'features', 'id', 'name', 'price_monthly', 'tier']));
        expect(plan).toEqual({
          ...Object.fromEntries(keysOf(plan).map(k => [k, full[i][k]])),
          features: full[i].features.slice(0, 4)
        });
        expect(plan).not.toHaveProperty('price_annual');
      }
    }
  });

  it('gives signed-in accounts the whole catalogue', async () => {
    const res = await api().get('/api/plans').set(authHeader(personas.expired));
    expect(res.headers['cache-control']).toBe('private, no-cache');
    for (const plan of res.body.data) {
      const stored = db.membership_plans.find(p => p.id === plan.id)!;
      expect(plan).toEqual(stored);
    }
  });
});

describe('everything else a service page reads', () => {
  it('needs a session', async () => {
    for (const url of ['/api/guide', '/api/classes/cls_str_mon', '/api/trainers/trn_vikram', '/api/bookings/my', '/api/payments/my']) {
      const res = await api().get(url);
      expect(res.status, url).toBe(401);
      expect(res.body.data, url).toBeUndefined();
    }
  });
});
