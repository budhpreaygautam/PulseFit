import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { migrate } from '../src/db/database.js';
import { GoogleProfile, setGoogleVerifierForTests } from '../src/lib/google.js';
import { nextOccurrenceOf } from '../src/lib/occurrences.js';
import { TimeSession, User } from '../src/types/index.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

// Wednesday 7 Oct 2026, 10:00 at the gym (IST): open, so check-ins and floor clock-ins work.
const NOW = new Date('2026-10-07T04:30:00.000Z');

const newcomer = { name: 'Neha Rao', email: 'neha.rao@example.com', password: 'Lift2026now' };
const register = (body: object) => api().post('/api/auth/register').send(body);

/** Whether a response body carries a gender field anywhere (at any depth). */
const mentionsGender = (body: unknown) => JSON.stringify(body).includes('"gender"');

describe('gender at registration', () => {
  beforeEach(() => resetDb());

  it('accepts a sign-up without one, as the apps released in 2.3.0 send it, and stores none', async () => {
    // Exactly what the 2.3.0 sign-up form sends; installed apps keep that form until they are updated.
    const res = await register({ ...newcomer, phone: '+91 98110 12345' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.gender).toBeUndefined();
    expect(res.body.data.user.avatar_url).toBe('');
    expect('gender' in userByEmail(newcomer.email)).toBe(false);

    // The person can add it later on My account.
    const later = await api().put('/api/auth/profile').set({ Authorization: `Bearer ${res.body.data.token}` }).send({ gender: 'female' });
    expect(later.status).toBe(200);
    expect(userByEmail(newcomer.email).gender).toBe('female');
  });

  it.each([
    ['an empty', { gender: '' }],
    ['a null', { gender: null }],
    ['an unknown', { gender: 'robot' }],
    ['a non-string', { gender: 1 }],
    ['a wrongly cased', { gender: 'Female' }],
    ['the retired "prefer not to say"', { gender: 'prefer_not_to_say' }]
  ])('refuses %s gender with a VALIDATION_ERROR on gender', async (_label, extra) => {
    const res = await register({ ...newcomer, ...extra });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.issues).toEqual([{ path: 'gender', message: 'Choose your gender.' }]);
    expect(db.users.some(u => u.email === newcomer.email)).toBe(false);
  });

  it.each(['male', 'female', 'other'])('stores %s and returns it to the new member, with no photo', async gender => {
    const res = await register({ ...newcomer, gender });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ gender, avatar_url: '' });
    expect(userByEmail(newcomer.email).gender).toBe(gender);

    const me = await api().get('/api/auth/me').set({ Authorization: `Bearer ${res.body.data.token}` });
    expect(me.body.data.gender).toBe(gender);
  });
});

describe('accounts that are not asked for a gender', () => {
  const originalClientId = config.googleClientId;

  beforeEach(() => resetDb());
  afterEach(() => {
    config.googleClientId = originalClientId;
    setGoogleVerifierForTests(null);
  });

  it('a Google sign-up has none (and no generated picture)', async () => {
    config.googleClientId = 'test-client.apps.googleusercontent.com';
    setGoogleVerifierForTests(credential => Promise.resolve(JSON.parse(credential) as GoogleProfile));
    const res = await api()
      .post('/api/auth/google')
      .send({ credential: JSON.stringify({ sub: 'g-gender', email: 'google.person@gmail.com', name: 'Google Person' }) });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(true);
    expect(res.body.data.user.gender).toBeUndefined();
    expect(res.body.data.user.avatar_url).toBe('');
  });

  it('a member the desk adds has none unless the admin picks one', async () => {
    const admin = authHeader(personas.admin);
    const plain = await api().post('/api/members').set(admin).send({ name: 'Desk Added', email: 'desk.added@example.com' });
    expect(plain.status).toBe(201);
    expect(plain.body.data.member.gender).toBeUndefined();
    expect(plain.body.data.member.avatar_url).toBe('');

    const chosen = await api().post('/api/members').set(admin).send({ name: 'Desk Chosen', email: 'desk.chosen@example.com', gender: 'female' });
    expect(chosen.status).toBe(201);
    expect(chosen.body.data.member.gender).toBe('female');

    const bad = await api().post('/api/members').set(admin).send({ name: 'Desk Bad', email: 'desk.bad@example.com', gender: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect(bad.body.data.issues).toEqual([{ path: 'gender', message: 'Choose male, female or other.' }]);
    expect(db.users.some(u => u.email === 'desk.bad@example.com')).toBe(false);
  });

  it('every seeded account that registered with a password has one; the Google sign-up has none', () => {
    for (const u of db.users.filter(u => u.password_hash)) expect(u.gender, u.email).toMatch(/^(male|female|other)$/);
    expect(userByEmail('isha.nair@example.com').gender).toBeUndefined();
  });
});

describe('changing it', () => {
  beforeEach(() => resetDb());

  it('the member changes their own on My account', async () => {
    const res = await api().put('/api/auth/profile').set(authHeader(personas.member)).send({ gender: 'other' });
    expect(res.status).toBe(200);
    expect(res.body.data.gender).toBe('other');
    expect(userByEmail(personas.member).gender).toBe('other');
  });

  it('a Google-only member can set one for the first time', async () => {
    const res = await api().put('/api/auth/profile').set(authHeader('isha.nair@example.com')).send({ gender: 'female' });
    expect(res.status).toBe(200);
    expect(userByEmail('isha.nair@example.com').gender).toBe('female');
  });

  it('refuses values outside the list', async () => {
    for (const gender of ['robot', '', null, 3]) {
      const res = await api().put('/api/auth/profile').set(authHeader(personas.member)).send({ gender });
      expect(res.status, String(gender)).toBe(400);
      expect(res.body.data.issues[0].path).toBe('gender');
    }
    expect(userByEmail(personas.member).gender).toBe('male');
  });

  it('an admin sees it, changes it and can clear it back to "not given"', async () => {
    const admin = authHeader(personas.admin);
    const id = userByEmail(personas.basic).id;
    expect((await api().get(`/api/members/${id}`).set(admin)).body.data.gender).toBe('male');
    expect((await api().get('/api/members').set(admin)).body.data.find((m: any) => m.id === id).gender).toBe('male');

    const changed = await api().put(`/api/members/${id}`).set(admin).send({ gender: 'other' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.gender).toBe('other');

    const cleared = await api().put(`/api/members/${id}`).set(admin).send({ gender: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.gender).toBeUndefined();
    expect('gender' in userByEmail(personas.basic)).toBe(false);
  });

  it('an admin edit with a value outside the list is refused and changes nothing', async () => {
    const admin = authHeader(personas.admin);
    const id = userByEmail(personas.basic).id;
    for (const gender of ['x', '', 'Male', 3]) {
      const res = await api().put(`/api/members/${id}`).set(admin).send({ gender, name: 'Renamed Rohan' });
      expect(res.status, String(gender)).toBe(400);
      expect(res.body.code, String(gender)).toBe('VALIDATION_ERROR');
      expect(res.body.data.issues, String(gender)).toEqual([{ path: 'gender', message: 'Choose male, female or other.' }]);
    }
    expect(userByEmail(personas.basic)).toMatchObject({ gender: 'male', name: 'Rohan Mehra' });
  });

  it('the admin ID card list carries it, for the card the desk prints', async () => {
    const rows = (await api().get('/api/id-cards').set(authHeader(personas.admin))).body.data.rows;
    expect(rows.find((r: any) => r.user.email === personas.member).user.gender).toBe('male');
    expect(rows.find((r: any) => r.user.email === 'isha.nair@example.com').user.gender).toBeUndefined();
  });
});

describe('gender stays with the person and admins', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
    // Rohan (male, Workout & Strength) is booked into Coach Vikram's next Friday class and is on the floor.
    const friday = db.classes.find(c => c.id === 'cls_str_fri')!;
    const date = nextOccurrenceOf(friday, NOW);
    const rohan = userByEmail(personas.basic);
    db.bookings = [
      ...db.bookings.filter(b => !(b.class_id === friday.id && b.booking_date === date && b.user_id === rohan.id)),
      { id: 'bk_gender', class_id: friday.id, user_id: rohan.id, booking_date: date, status: 'confirmed', created_at: NOW.toISOString() }
    ];
    db.attendance_logs = db.attendance_logs.filter(l => !(l.user_id === rohan.id && l.check_in_time.startsWith('2026-10-07')));
  });
  afterEach(() => vi.useRealTimers());

  it('is never in what a coach receives', async () => {
    const coach = authHeader(personas.trainer);
    await api().post('/api/time-tracking/clock-in').set(authHeader(personas.basic)).send({ category: 'Workout & Strength' });

    const roster = await api().get('/api/bookings/class/cls_str_fri/roster').set(coach);
    expect(roster.status).toBe(200);
    expect(roster.body.data.attendees.some((a: any) => a.booking_id === 'bk_gender')).toBe(true);

    const clients = await api().get('/api/trainer/clients').set(coach);
    expect(clients.body.data.some((c: any) => c.user_id === userByEmail(personas.basic).id)).toBe(true);

    const checkIn = await api().post('/api/attendance/check-in').set(coach).send({ code: userByEmail(personas.member).qr_code_token });
    expect(checkIn.status).toBe(200);
    expect(checkIn.body.data.member.name).toBe('Aarav Sharma');

    // Coaches get the counts only (who is on the floor is for admins).
    const floor = await api().get('/api/time-tracking/active-floor').set(coach);
    expect(floor.body.data.workoutActive).toBeGreaterThan(0);

    const me = await api().get('/api/trainer/me').set(coach);
    expect(me.status).toBe(200);

    for (const [label, res] of Object.entries({ roster, clients, checkIn, floor, me })) expect(mentionsGender(res.body), label).toBe(false);
  });

  it('is not in the check-in answer, for admins either, granted or denied', async () => {
    const admin = authHeader(personas.admin);
    const granted = await api().post('/api/attendance/check-in').set(admin).send({ code: userByEmail(personas.basic).qr_code_token });
    expect(granted.status).toBe(200);
    expect(granted.body.data.member.name).toBe('Rohan Mehra');
    expect(userByEmail(personas.basic).gender).toBe('male');

    const denied = await api().post('/api/attendance/check-in').set(admin).send({ code: userByEmail(personas.expired).qr_code_token });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('MEMBERSHIP_EXPIRED');
    expect(denied.body.data.member.name).toBe(userByEmail(personas.expired).name);

    for (const [label, res] of Object.entries({ granted, denied })) expect(mentionsGender(res.body), label).toBe(false);
  });

  it('is never in what the public or another member receives', async () => {
    const vip = authHeader(personas.vip);
    for (const [label, call] of Object.entries({
      trainers: () => api().get('/api/trainers'),
      trainer: () => api().get('/api/trainers/trn_vikram').set(vip),
      classes: () => api().get('/api/classes'),
      class: () => api().get('/api/classes/cls_str_fri').set(vip),
      floor: () => api().get('/api/time-tracking/active-floor'),
      'classes for a member': () => api().get('/api/classes').set(vip),
      'trainers for a member': () => api().get('/api/trainers').set(vip)
    })) {
      const res = await call();
      expect(res.status, label).toBe(200);
      expect(mentionsGender(res.body), label).toBe(false);
    }
  });
});

describe('migrate', () => {
  const dicebear = 'https://api.dicebear.com/7.x/avataaars/svg?seed=AS-1a2b3c';
  const photo = 'https://images.unsplash.com/photo-1?w=300';

  beforeEach(() => resetDb());

  it('turns stored DiceBear pictures into "no photo", keeps real photos and adds no gender', () => {
    const { gender: _gender, ...older } = db.users[0];
    const session: TimeSession = {
      id: 'ses_old',
      user_id: older.id,
      user_name: older.name,
      user_email: older.email,
      user_avatar: dicebear,
      user_tier: older.membership_tier,
      category: 'Workout & Strength',
      clock_in_time: '2026-10-01T03:00:00.000Z',
      clock_out_time: '2026-10-01T04:00:00.000Z',
      duration_minutes: 60,
      status: 'completed'
    };
    const out = migrate({
      ...db.snapshot(),
      users: [{ ...older, avatar_url: dicebear }, { ...db.users[1], avatar_url: photo }],
      trainers: [{ ...db.trainers[0], avatar_url: dicebear }],
      classes: [{ ...db.classes[0], trainer_avatar: dicebear }],
      time_sessions: [session]
    });
    expect(out.users[0].avatar_url).toBe('');
    expect(out.users[0].gender).toBeUndefined();
    expect(out.users[1].avatar_url).toBe(photo);
    expect(out.trainers[0].avatar_url).toBe('');
    expect(out.classes[0].trainer_avatar).toBe('');
    expect(out.time_sessions[0].user_avatar).toBe('');
    expect(migrate(out)).toEqual(out);
  });

  it('turns the retired "prefer not to say" into "not given" and keeps the three choices', () => {
    const retired = { ...db.users[0], gender: 'prefer_not_to_say' } as unknown as User;
    const out = migrate({ ...db.snapshot(), users: [retired, { ...db.users[1], gender: 'female' }] });
    expect('gender' in out.users[0]).toBe(false);
    expect(out.users[1].gender).toBe('female');
    expect(migrate(out)).toEqual(out);
  });
});

describe('the default pictures', () => {
  const original = { serveClient: config.serveClient, clientDistPath: config.clientDistPath };
  afterEach(() => Object.assign(config, original));

  it('are static files of the client, served from the site itself', async () => {
    // Vite copies client/public into every build (client/dist for the web, dist-mobile for the apps).
    Object.assign(config, { serveClient: true, clientDistPath: fileURLToPath(new URL('../../client/public/', import.meta.url)) });
    // The ten avatars members can choose ship the same way (PUT /auth/profile accepts their paths).
    const presets = Array.from({ length: 10 }, (_, i) => `preset-${String(i + 1).padStart(2, '0')}`);
    for (const name of ['male', 'female', 'neutral', ...presets]) {
      const res = await api().get(`/avatars/${name}.svg`);
      expect(res.status, name).toBe(200);
      expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/);
      // Same origin, so the CSP's img-src 'self' covers them and the ID card canvas stays exportable.
      expect(res.headers['content-security-policy']).toMatch(/img-src 'self'/);
      // Self-contained: nothing in them loads from anywhere else.
      expect(String(res.body)).toMatch(/^<svg /);
      expect(String(res.body)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    }
  });
});
