import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import config from '../src/config.js';
import { api, authHeader, db, personas, resetDb, tokenFor, userByEmail } from './helpers.js';

const strongPassword = 'Lift2026now';

describe('POST /auth/login', () => {
  beforeEach(() => resetDb());
  afterEach(() => vi.restoreAllMocks());

  it('signs in with the right password, ignoring email case and spaces', async () => {
    const res = await api().post('/api/auth/login').send({ email: '  Member@PulseFit.com ', password: 'pulse123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: personas.member, role: 'member' });
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.user.token_version).toBeUndefined();
  });

  it('answers 401 INVALID_CREDENTIALS for a wrong password and for an unknown email alike', async () => {
    const wrong = await api().post('/api/auth/login').send({ email: personas.member, password: 'nope1234' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope1234' });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, code: 'INVALID_CREDENTIALS' });
    }
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('still runs a bcrypt compare for an unknown email so timing does not reveal accounts', async () => {
    const spy = vi.spyOn(bcrypt, 'compare');
    await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refuses password sign-in for a Google-only account (no password)', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'isha.nair@example.com', password: '' });
    expect(res.status).toBe(400);
    const res2 = await api().post('/api/auth/login').send({ email: 'isha.nair@example.com', password: 'anything1' });
    expect(res2.status).toBe(401);
    expect(res2.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects malformed bodies with 400 VALIDATION_ERROR instead of a 500', async () => {
    for (const body of [{}, { email: 42, password: 'x' }, { email: { $ne: 1 }, password: 'x' }, { email: 'a@b.co' }]) {
      const res = await api().post('/api/auth/login').send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /auth/register', () => {
  beforeEach(() => resetDb());

  it('creates a pending member with no plan and returns 201 { token, user }', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Neha Rao', email: 'Neha.Rao@Example.com', password: strongPassword, phone: '+91 98765 43210' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).toMatchObject({
      email: 'neha.rao@example.com',
      name: 'Neha Rao',
      role: 'member',
      phone: '+91 98765 43210',
      membership_tier: 'none',
      membership_status: 'pending',
      membership_expiry: null,
      streak_days: 0
    });
    expect(res.body.data.user.qr_code_token).toMatch(/^PULSE-MEM-NEHAR-[0-9A-F]{6}$/);
    expect(res.body.data.user.avatar_url).toContain('dicebear');
    expect(res.body.data.user.password_hash).toBeUndefined();

    const stored = db.users.find(u => u.email === 'neha.rao@example.com')!;
    expect(stored.password_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare(strongPassword, stored.password_hash!)).toBe(true);

    const me = await api().get('/api/auth/me').set({ Authorization: `Bearer ${res.body.data.token}` });
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('neha.rao@example.com');
  });

  it('regression: ignores tier, role, status and expiry sent by the client', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Sneaky Sam',
      email: 'sam@example.com',
      password: strongPassword,
      tier: 'vip',
      membership_tier: 'vip',
      membership_status: 'active',
      membership_expiry: '2099-01-01',
      role: 'admin'
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'member', membership_tier: 'none', membership_status: 'pending', membership_expiry: null });
  });

  it('stores an empty phone, not a placeholder, when none is given', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'No Phone', email: 'nophone@example.com', password: strongPassword });
    expect(res.status).toBe(201);
    expect(res.body.data.user.phone).toBe('');
  });

  it('answers 409 EMAIL_TAKEN for an existing email in any case', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Copy Cat', email: 'MEMBER@pulsefit.com', password: strongPassword });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    [{ name: 'A', email: 'a@example.com', password: strongPassword }, 'name'],
    [{ name: 'x'.repeat(61), email: 'a@example.com', password: strongPassword }, 'name'],
    [{ name: 'Valid Name', email: 'not-an-email', password: strongPassword }, 'email'],
    [{ name: 'Valid Name', email: 'a@example.com', password: 'short1' }, 'password'],
    [{ name: 'Valid Name', email: 'a@example.com', password: 'onlyletters' }, 'password'],
    [{ name: 'Valid Name', email: 'a@example.com', password: '1234567890' }, 'password'],
    [{ name: 'Valid Name', email: 'a@example.com', password: 'a1'.repeat(37) }, 'password'],
    [{ name: 'Valid Name', email: 'a@example.com', password: strongPassword, phone: 'call me' }, 'phone'],
    [{ name: 42, email: 'a@example.com', password: strongPassword }, 'name']
  ])('rejects invalid input %# with 400 VALIDATION_ERROR on %s', async (body, field) => {
    const res = await api().post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.issues[0].path).toBe(field);
  });
});

describe('POST /auth/demo-login', () => {
  const original = config.demoMode;
  beforeEach(() => resetDb());
  afterEach(() => {
    config.demoMode = original;
  });

  it.each([
    ['member', personas.member],
    ['vip', personas.vip],
    ['trainer', personas.trainer],
    ['admin', personas.admin]
  ])('signs in the %s persona in demo mode', async (role, email) => {
    const res = await api().post('/api/auth/demo-login').send({ role });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.token).toBeTruthy();
  });

  it('defaults to the member persona and rejects unknown roles', async () => {
    expect((await api().post('/api/auth/demo-login').send({})).body.data.user.email).toBe(personas.member);
    const bad = await api().post('/api/auth/demo-login').send({ role: 'superadmin' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('regression: answers 404 DEMO_DISABLED (no admin token) when demo mode is off', async () => {
    config.demoMode = false;
    const res = await api().post('/api/auth/demo-login').send({ role: 'admin' });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'DEMO_DISABLED' });
    expect(res.body.data).toBeUndefined();
  });
});

describe('GET /auth/me', () => {
  beforeEach(() => resetDb());

  it('returns the safe user for a valid token', async () => {
    const res = await api().get('/api/auth/me').set(authHeader(personas.vip));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: personas.vip, membership_tier: 'vip' });
    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.body.data.google_sub).toBeUndefined();
  });

  it('answers 401 without a token or with a forged one', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    const forged = await api().get('/api/auth/me').set({ Authorization: 'Bearer abc.def.ghi' });
    expect(forged.status).toBe(401);
    expect(forged.body.code).toBe('UNAUTHORIZED');
  });

  it('reports an expired stored membership as expired', async () => {
    const res = await api().get('/api/auth/me').set(authHeader(personas.expired));
    expect(res.body.data.membership_status).toBe('expired');
  });
});

describe('PUT /auth/profile', () => {
  beforeEach(() => resetDb());

  it('updates name, phone and avatar and returns the safe user', async () => {
    const res = await api()
      .put('/api/auth/profile')
      .set(authHeader(personas.member))
      .send({ name: '  Aarav S. ', phone: '+91 99999 00000', avatar_url: 'https://images.example.com/me.png' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Aarav S.', phone: '+91 99999 00000', avatar_url: 'https://images.example.com/me.png' });
    expect(res.body.data.password_hash).toBeUndefined();
    expect(userByEmail(personas.member).name).toBe('Aarav S.');
  });

  it('accepts a small data-URL photo and an empty phone', async () => {
    const res = await api()
      .put('/api/auth/profile')
      .set(authHeader(personas.member))
      .send({ avatar_url: 'data:image/png;base64,iVBORw0KGgo=', phone: '' });
    expect(res.status).toBe(200);
    expect(res.body.data.avatar_url).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(res.body.data.phone).toBe('');
  });

  it('regression: rejects membership_tier / membership_status / password fields with 400 and changes nothing', async () => {
    const before = userByEmail(personas.basic);
    for (const body of [
      { membership_tier: 'vip' },
      { membership_status: 'active' },
      { name: 'Rohan', membership_expiry: '2099-01-01' },
      { role: 'admin' },
      { newPassword: 'Hacked123' }
    ]) {
      const res = await api().put('/api/auth/profile').set(authHeader(personas.basic)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    const after = userByEmail(personas.basic);
    expect(after).toEqual(before);
  });

  it.each([
    [{ avatar_url: 'http://insecure.example.com/a.png' }],
    [{ avatar_url: 'javascript:alert(1)' }],
    [{ avatar_url: 'data:image/svg+xml;base64,PHN2Zz4=' }],
    [{ avatar_url: `data:image/png;base64,${'A'.repeat(350_001)}` }],
    [{ name: 'X' }],
    [{ phone: 'not a phone' }]
  ])('rejects invalid field values %#', async body => {
    const res = await api().put('/api/auth/profile').set(authHeader(personas.member)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('answers 401 without a token', async () => {
    expect((await api().put('/api/auth/profile').send({ name: 'Nobody' })).status).toBe(401);
  });

  it('only ever changes the caller', async () => {
    await api().put('/api/auth/profile').set(authHeader(personas.member)).send({ name: 'Changed Name' });
    expect(userByEmail(personas.vip).name).toBe('Ananya Gupta');
  });
});

describe('removed endpoints', () => {
  beforeEach(() => resetDb());

  it('regression: POST /auth/firebase-sync no longer exists and issues no token', async () => {
    const res = await api().post('/api/auth/firebase-sync').send({ email: personas.admin, uid: 'x', tier: 'vip' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
  });
});

describe('seeded auth demo data', () => {
  beforeEach(() => resetDb());

  it('adds a pending email sign-up and a pending Google sign-up created in the last week', async () => {
    const kabir = userByEmail('kabir.singh@example.com');
    const isha = userByEmail('isha.nair@example.com');
    for (const u of [kabir, isha]) {
      expect(u).toMatchObject({ role: 'member', membership_tier: 'none', membership_status: 'pending', membership_expiry: null });
      const ageDays = (Date.now() - Date.parse(u.created_at)) / 86_400_000;
      expect(ageDays).toBeGreaterThan(0);
      expect(ageDays).toBeLessThan(7);
    }
    expect(isha.password_hash).toBeUndefined();
    expect(isha.google_sub).toBeTruthy();
    const tokens = db.users.map(u => u.qr_code_token);
    expect(new Set(tokens).size).toBe(tokens.length);

    const login = await api().post('/api/auth/login').send({ email: 'kabir.singh@example.com', password: 'pulse123' });
    expect(login.status).toBe(200);
    expect(tokenFor('kabir.singh@example.com')).toBeTruthy();
  });
});
