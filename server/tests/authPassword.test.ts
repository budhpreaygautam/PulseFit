import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../src/config.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

const NEW_PASSWORD = 'Stronger2026';

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token')!;
}

describe('PUT /auth/password', () => {
  beforeEach(() => resetDb());

  it('changes the password, returns a fresh token and revokes older tokens', async () => {
    const oldHeader = authHeader(personas.member);
    const res = await api()
      .put('/api/auth/password')
      .set(oldHeader)
      .send({ currentPassword: 'pulse123', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(personas.member);
    expect(res.body.data.user.password_hash).toBeUndefined();

    expect((await api().get('/api/auth/me').set(oldHeader)).status).toBe(401);
    expect((await api().get('/api/auth/me').set({ Authorization: `Bearer ${res.body.data.token}` })).status).toBe(200);

    expect((await api().post('/api/auth/login').send({ email: personas.member, password: 'pulse123' })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: personas.member, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('regression: requires the current password when the account has one', async () => {
    const res = await api().put('/api/auth/password').set(authHeader(personas.member)).send({ newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.issues[0].path).toBe('currentPassword');
    expect(await bcrypt.compare('pulse123', userByEmail(personas.member).password_hash!)).toBe(true);
  });

  it('answers 400 WRONG_PASSWORD for a wrong current password and keeps the old one', async () => {
    const res = await api()
      .put('/api/auth/password')
      .set(authHeader(personas.member))
      .send({ currentPassword: 'wrong123', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WRONG_PASSWORD');
    expect(userByEmail(personas.member).token_version || 0).toBe(0);
  });

  it('lets a Google-only account set a first password without a current one', async () => {
    const res = await api().put('/api/auth/password').set(authHeader('isha.nair@example.com')).send({ newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: 'isha.nair@example.com', password: NEW_PASSWORD })).status).toBe(200);
  });

  it('enforces the password rules on the server', async () => {
    for (const newPassword of ['short1', 'lettersonly', '123456789', undefined]) {
      const res = await api().put('/api/auth/password').set(authHeader(personas.member)).send({ currentPassword: 'pulse123', newPassword });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('answers 401 without a token', async () => {
    expect((await api().put('/api/auth/password').send({ newPassword: NEW_PASSWORD })).status).toBe(401);
  });
});

describe('POST /auth/forgot-password and /auth/reset-password', () => {
  const original = { demoMode: config.demoMode, isProduction: config.isProduction };

  beforeEach(() => resetDb());
  afterEach(() => {
    config.demoMode = original.demoMode;
    config.isProduction = original.isProduction;
    vi.useRealTimers();
  });

  async function requestReset(email: string = personas.member, origin?: string) {
    const req = api().post('/api/auth/forgot-password');
    if (origin) req.set('Origin', origin);
    return req.send({ email });
  }

  it('gives the same message whether or not the account exists', async () => {
    const known = await requestReset(personas.member);
    const unknown = await requestReset('ghost@example.com');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.data.message).toBe(unknown.body.data.message);
    expect(unknown.body.data.resetUrl).toBeUndefined();
    expect(db.password_resets).toHaveLength(1);
  });

  it('stores only a sha256 hash of the token, with a 30 minute expiry', async () => {
    const res = await requestReset();
    const token = tokenFromUrl(res.body.data.resetUrl);
    const [reset] = db.password_resets;
    expect(reset.user_id).toBe(userByEmail(personas.member).id);
    expect(reset.token_hash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(db.password_resets)).not.toContain(token);
    expect(Date.parse(reset.expires_at) - Date.parse(reset.created_at)).toBe(30 * 60_000);
  });

  it('builds the link on the request origin when it is allowed, else on the first configured origin', async () => {
    const allowed = config.corsOrigins[config.corsOrigins.length - 1];
    const fromAllowed = await requestReset(personas.member, allowed);
    expect(fromAllowed.body.data.resetUrl.startsWith(`${allowed}/reset-password?token=`)).toBe(true);

    const fromEvil = await requestReset(personas.member, 'https://evil.example.com');
    expect(fromEvil.body.data.resetUrl.startsWith(`${config.corsOrigins[0]}/reset-password?token=`)).toBe(true);
  });

  it('hides the link in production unless demo mode is on', async () => {
    config.isProduction = true;
    config.demoMode = false;
    const hidden = await requestReset();
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.resetUrl).toBeUndefined();
    expect(hidden.body.data.message).toBeTruthy();
    expect(db.password_resets).toHaveLength(1);

    config.demoMode = true;
    expect((await requestReset()).body.data.resetUrl).toBeTruthy();
  });

  it('rejects an invalid email with 400', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('resets the password once, returns a fresh token and revokes older tokens', async () => {
    const oldHeader = authHeader(personas.member);
    const token = tokenFromUrl((await requestReset()).body.data.resetUrl);

    const res = await api().post('/api/auth/reset-password').send({ token, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(personas.member);
    expect((await api().get('/api/auth/me').set(oldHeader)).status).toBe(401);
    expect((await api().get('/api/auth/me').set({ Authorization: `Bearer ${res.body.data.token}` })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: personas.member, password: NEW_PASSWORD })).status).toBe(200);

    const again = await api().post('/api/auth/reset-password').send({ token, newPassword: 'Another2026' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects an unknown token and a token older than 30 minutes', async () => {
    const unknown = await api().post('/api/auth/reset-password').send({ token: 'made-up', newPassword: NEW_PASSWORD });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('INVALID_RESET_TOKEN');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    const token = tokenFromUrl((await requestReset()).body.data.resetUrl);
    vi.setSystemTime(new Date('2026-10-07T10:29:00Z'));
    const otherToken = tokenFromUrl((await requestReset(personas.vip)).body.data.resetUrl);
    vi.setSystemTime(new Date('2026-10-07T10:30:01Z'));

    const expired = await api().post('/api/auth/reset-password').send({ token, newPassword: NEW_PASSWORD });
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe('INVALID_RESET_TOKEN');

    const fresh = await api().post('/api/auth/reset-password').send({ token: otherToken, newPassword: NEW_PASSWORD });
    expect(fresh.status).toBe(200);
  });

  it('only the newest link works, and changing the password retires open links', async () => {
    const first = tokenFromUrl((await requestReset()).body.data.resetUrl);
    const second = tokenFromUrl((await requestReset()).body.data.resetUrl);
    expect((await api().post('/api/auth/reset-password').send({ token: first, newPassword: NEW_PASSWORD })).body.code).toBe(
      'INVALID_RESET_TOKEN'
    );

    await api().put('/api/auth/password').set(authHeader(personas.member)).send({ currentPassword: 'pulse123', newPassword: NEW_PASSWORD });
    expect((await api().post('/api/auth/reset-password').send({ token: second, newPassword: 'Another2026' })).body.code).toBe(
      'INVALID_RESET_TOKEN'
    );
  });

  it('validates the new password on reset', async () => {
    const token = tokenFromUrl((await requestReset()).body.data.resetUrl);
    const res = await api().post('/api/auth/reset-password').send({ token, newPassword: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect((await api().post('/api/auth/reset-password').send({ token, newPassword: NEW_PASSWORD })).status).toBe(200);
  });
});
