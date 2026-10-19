import { beforeEach, describe, expect, it } from 'vitest';
import { api, authHeader, personas, resetDb, tokenFor } from './helpers.js';

const WEB = 'http://localhost:5173';
const ANDROID = 'https://localhost';
const IOS = 'capacitor://localhost';

const sessionCookie = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? []).find(c => c.startsWith('pulsefit_session='));

const login = (origin?: string) => {
  const req = api().post('/api/auth/login');
  if (origin) req.set('Origin', origin);
  return req.send({ email: personas.member, password: 'pulse123' });
};

describe('sessions: httpOnly cookie for the website, bearer token for the apps', () => {
  beforeEach(() => resetDb());

  it('gives the website an httpOnly, SameSite=Lax cookie on /api and no token in the body', async () => {
    const res = await login(WEB);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeUndefined();
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('gives the Android and iOS apps a bearer token and no cookie', async () => {
    for (const origin of [ANDROID, IOS]) {
      const res = await login(origin);
      expect(res.status).toBe(200);
      expect(typeof res.body.data.token).toBe('string');
      expect(sessionCookie(res)).toBeUndefined();
    }
  });

  it('accepts the session cookie on reads', async () => {
    const cookie = `pulsefit_session=${tokenFor(personas.member)}`;
    const res = await api().get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(personas.member);
  });

  it('refuses a cookie-authenticated write without X-Requested-With (CSRF), and allows it with the header', async () => {
    const cookie = `pulsefit_session=${tokenFor(personas.member)}`;
    const blocked = await api().put('/api/auth/profile').set('Cookie', cookie).send({ name: 'Forged Name' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('CSRF_REJECTED');

    const allowed = await api().put('/api/auth/profile').set('Cookie', cookie).set('X-Requested-With', 'PulseFit').send({ name: 'Real Name' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.name).toBe('Real Name');
  });

  it('does not ask bearer-token requests for the CSRF header', async () => {
    const res = await api().put('/api/auth/profile').set(authHeader(personas.member)).send({ name: 'App User' });
    expect(res.status).toBe(200);
  });

  it('logout clears the cookie', async () => {
    const res = await api().post('/api/auth/logout').set('X-Requested-With', 'PulseFit');
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('allows the CSRF header in CORS preflights from the apps', async () => {
    const res = await api()
      .options('/api/auth/me')
      .set('Origin', ANDROID)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-requested-with');
    expect(res.headers['access-control-allow-origin']).toBe(ANDROID);
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('x-requested-with');
  });
});
