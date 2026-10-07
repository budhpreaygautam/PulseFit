import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../src/config.js';
import { resetAuthRateLimits } from '../src/lib/authRateLimits.js';
import { setGoogleVerifierForTests } from '../src/lib/google.js';
import { api, personas, resetDb } from './helpers.js';

describe('auth rate limits', () => {
  const original = { enabled: config.rateLimit.enabled, googleClientId: config.googleClientId };

  beforeEach(async () => {
    resetDb();
    await resetAuthRateLimits();
    config.rateLimit.enabled = true;
  });
  afterEach(async () => {
    config.rateLimit.enabled = original.enabled;
    config.googleClientId = original.googleClientId;
    setGoogleVerifierForTests(null);
    await resetAuthRateLimits();
  });

  function expectLimited(res: { status: number; body: any }) {
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(typeof res.body.error).toBe('string');
  }

  it('are off when config.rateLimit.enabled is false (the test default)', async () => {
    config.rateLimit.enabled = false;
    for (let i = 0; i < 12; i++) {
      expect((await api().post('/api/auth/login').send({ email: personas.member, password: 'wrong123' })).status).toBe(401);
    }
  });

  it('login: 10 failed attempts per 15 minutes; successful sign-ins do not count', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await api().post('/api/auth/login').send({ email: personas.member, password: 'pulse123' })).status).toBe(200);
    }
    for (let i = 0; i < 10; i++) {
      expect((await api().post('/api/auth/login').send({ email: personas.member, password: 'wrong123' })).status).toBe(401);
    }
    expectLimited(await api().post('/api/auth/login').send({ email: personas.member, password: 'pulse123' }));
  });

  it('register: 5 per hour', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await api().post('/api/auth/register').send({ name: `Person ${i}`, email: `p${i}@example.com`, password: 'Lift2026now' });
      expect(res.status).toBe(201);
    }
    expectLimited(await api().post('/api/auth/register').send({ name: 'Person 6', email: 'p6@example.com', password: 'Lift2026now' }));
  });

  it('forgot-password: 5 per hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await api().post('/api/auth/forgot-password').send({ email: personas.member })).status).toBe(200);
    }
    expectLimited(await api().post('/api/auth/forgot-password').send({ email: personas.member }));
  });

  it('google: 20 per 15 minutes', async () => {
    config.googleClientId = 'client';
    setGoogleVerifierForTests(() => Promise.reject(new Error('nope')));
    for (let i = 0; i < 20; i++) {
      expect((await api().post('/api/auth/google').send({ credential: 'x' })).status).toBe(401);
    }
    expectLimited(await api().post('/api/auth/google').send({ credential: 'x' }));
  });
});
