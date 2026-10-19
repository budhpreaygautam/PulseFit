import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../src/config.js';
import { codeAt, currentStep } from '../src/lib/totp.js';
import { api, authHeader, db, personas, resetDb } from './helpers.js';

const PASSWORD = 'Str0ng-Lane-Pass';

async function newAccount() {
  const email = `mfa-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await api().post('/api/auth/register').send({ name: 'Mfa Tester', email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { email, token: res.body.data.token as string, id: res.body.data.user.id as string };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A code for the next 30-second step, so it is never one the server already accepted. */
const nextCode = (secret: string, offset = 1) => codeAt(secret, currentStep() + offset);

async function enableMfa(token: string) {
  const setup = await api().post('/api/auth/mfa/setup').set(bearer(token)).send({ password: PASSWORD });
  expect(setup.status).toBe(200);
  const secret = setup.body.data.secret as string;
  const enable = await api().post('/api/auth/mfa/enable').set(bearer(token)).send({ code: codeAt(secret, currentStep()) });
  expect(enable.status).toBe(200);
  return { secret, recoveryCodes: enable.body.data.recovery_codes as string[], token: enable.body.data.token as string };
}

describe('multi-factor authentication (authenticator app)', () => {
  beforeEach(() => resetDb());

  it('sets up with the password, shows a QR secret once, and needs a valid code to switch on', async () => {
    const { token } = await newAccount();
    const noPassword = await api().post('/api/auth/mfa/setup').set(bearer(token)).send({});
    expect(noPassword.status).toBe(400);
    const wrongPassword = await api().post('/api/auth/mfa/setup').set(bearer(token)).send({ password: 'nope' });
    expect(wrongPassword.body.code).toBe('WRONG_PASSWORD');

    const setup = await api().post('/api/auth/mfa/setup').set(bearer(token)).send({ password: PASSWORD });
    expect(setup.body.data.otpauth_url).toMatch(/^otpauth:\/\/totp\/PulseFit%3A.+\?secret=[A-Z2-7]+&issuer=PulseFit/);
    const bad = await api().post('/api/auth/mfa/enable').set(bearer(token)).send({ code: '000000' });
    expect(bad.body.code).toBe('INVALID_MFA_CODE');

    const enable = await api().post('/api/auth/mfa/enable').set(bearer(token)).send({ code: codeAt(setup.body.data.secret, currentStep()) });
    expect(enable.status).toBe(200);
    expect(enable.body.data.recovery_codes).toHaveLength(10);
    expect(enable.body.data.user.mfa_enabled).toBe(true);
    // Switching it on signs out other devices: the old token is revoked, the new one works.
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(bearer(enable.body.data.token))).status).toBe(200);
  });

  it('never sends the secret, pending secret or backup-code hashes in user data', async () => {
    const { token, id } = await newAccount();
    const { token: fresh } = await enableMfa(token);
    const me = await api().get('/api/auth/me').set(bearer(fresh));
    const asAdmin = await api().get(`/api/members/${id}`).set(authHeader(personas.admin));
    for (const body of [me.body, asAdmin.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/mfa_secret|mfa_pending_secret|mfa_recovery_codes|mfa_last_step|password_hash|token_version/);
    }
    expect(me.body.data.mfa_enabled).toBe(true);
    expect(me.body.data.has_password).toBe(true);
  });

  it('asks for a code after the password, and only then starts a session', async () => {
    const { email, token } = await newAccount();
    const { secret } = await enableMfa(token);

    const login = await api().post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.mfa_required).toBe(true);
    expect(login.body.data.user).toBeUndefined();
    expect(login.body.data.token).toBeUndefined();
    expect(String(login.headers['set-cookie'] ?? '')).not.toContain('pulsefit_session=');

    // The challenge token is not a session.
    expect((await api().get('/api/auth/me').set(bearer(login.body.data.mfa_token))).status).toBe(401);

    const wrong = await api().post('/api/auth/mfa/verify').send({ mfa_token: login.body.data.mfa_token, code: '123456' });
    expect(wrong.body.code).toBe('INVALID_MFA_CODE');

    const code = nextCode(secret);
    const ok = await api()
      .post('/api/auth/mfa/verify')
      .set('Origin', 'http://localhost:5173')
      .send({ mfa_token: login.body.data.mfa_token, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe(email);
    expect(String(ok.headers['set-cookie'])).toContain('pulsefit_session=');

    // The same code cannot be replayed.
    const again = await api().post('/api/auth/login').send({ email, password: PASSWORD });
    const replay = await api().post('/api/auth/mfa/verify').send({ mfa_token: again.body.data.mfa_token, code });
    expect(replay.body.code).toBe('INVALID_MFA_CODE');
  });

  it('accepts each backup code once', async () => {
    const { email, token } = await newAccount();
    const { recoveryCodes } = await enableMfa(token);
    const challenge = async () => (await api().post('/api/auth/login').send({ email, password: PASSWORD })).body.data.mfa_token;

    const first = await api().post('/api/auth/mfa/verify').send({ mfa_token: await challenge(), code: recoveryCodes[0].toUpperCase() });
    expect(first.status).toBe(200);
    expect(first.body.message).toMatch(/backup code\. 9 left/);
    const reused = await api().post('/api/auth/mfa/verify').send({ mfa_token: await challenge(), code: recoveryCodes[0] });
    expect(reused.body.code).toBe('INVALID_MFA_CODE');
  });

  it('switches off only with the password and a code', async () => {
    const { token } = await newAccount();
    const { secret, token: fresh } = await enableMfa(token);
    const noCode = await api().post('/api/auth/mfa/disable').set(bearer(fresh)).send({ password: PASSWORD, code: '000000' });
    expect(noCode.body.code).toBe('INVALID_MFA_CODE');
    const noPassword = await api().post('/api/auth/mfa/disable').set(bearer(fresh)).send({ code: nextCode(secret) });
    expect(noPassword.status).toBe(400);
    const off = await api().post('/api/auth/mfa/disable').set(bearer(fresh)).send({ password: PASSWORD, code: nextCode(secret) });
    expect(off.status).toBe(200);
    expect(off.body.data.mfa_enabled).toBe(false);
  });

  it('lets an admin switch it off for someone who lost their phone, signing them out', async () => {
    const { token, id } = await newAccount();
    const { token: fresh } = await enableMfa(token);
    const res = await api().post(`/api/members/${id}/mfa/reset`).set(authHeader(personas.admin));
    expect(res.status).toBe(200);
    expect(res.body.data.mfa_enabled).toBe(false);
    expect((await api().get('/api/auth/me').set(bearer(fresh))).status).toBe(401);
    expect((await api().post(`/api/members/${id}/mfa/reset`).set(authHeader(personas.member))).status).toBe(403);
  });

  it('a password reset does not skip the second step', async () => {
    const { email, token } = await newAccount();
    await enableMfa(token);
    const forgot = await api().post('/api/auth/forgot-password').send({ email });
    const resetToken = new URL(forgot.body.data.resetUrl).searchParams.get('token');
    const reset = await api().post('/api/auth/reset-password').send({ token: resetToken, newPassword: 'Another-Lane-77' });
    expect(reset.status).toBe(200);
    expect(reset.body.data.mfa_required).toBe(true);
    expect(reset.body.data.user).toBeUndefined();
  });

  it('keeps the shared demo accounts out of MFA', async () => {
    const res = await api().post('/api/auth/mfa/setup').set(authHeader(personas.member)).send({ password: 'pulse123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_ACCOUNT_LOCKED');
  });
});

describe('the published demo password outside demo mode', () => {
  const original = config.demoMode;
  beforeEach(() => resetDb());
  afterEach(() => {
    config.demoMode = original;
  });

  it('cannot sign in to the seeded accounts once demo mode is off', async () => {
    config.demoMode = false;
    const res = await api().post('/api/auth/login').send({ email: personas.admin, password: 'pulse123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_PASSWORD_BLOCKED');
    expect(db.users.some(u => u.email === personas.admin)).toBe(true);
  });
});
