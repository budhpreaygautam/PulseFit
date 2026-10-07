import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb } from './helpers.js';
import config from '../src/config.js';

// Wednesday 7 Oct 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00.000Z');

const valid = {
  name: 'Sara Ali',
  email: 'sara.ali@example.com',
  phone: '+91 99999 12345',
  interest: 'Zumba & Cardio',
  preferred_date: '2026-10-08'
};

const claim = (body: object, ip = '10.0.0.1') => api().post('/api/trials').set('X-Forwarded-For', ip).send(body);

describe('free trials API', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('POST /trials', () => {
    it('stores a trial pass without a token and returns it (audit regression: the form used to be fake)', async () => {
      const res = await claim(valid);
      expect(res.status).toBe(201);
      const trial = res.body.data;
      expect(trial).toMatchObject({
        name: 'Sara Ali',
        email: 'sara.ali@example.com',
        interest: 'Zumba & Cardio',
        valid_on: '2026-10-08',
        status: 'issued'
      });
      expect(trial.code).toMatch(/^PULSE-TRIAL-[A-Z0-9]{6}$/);
      expect(db.trial_passes.some(t => t.id === trial.id)).toBe(true);
    });

    it('issued code is then accepted at the turnstile on its day (audit regression)', async () => {
      const { body } = await claim({ ...valid, preferred_date: '2026-10-07' });
      const scan = await api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send({ code: body.data.code });
      expect(scan.status).toBe(200);
      expect(scan.body.data.kind).toBe('trial');
    });

    it('accepts today and today + 14, rejects outside that window', async () => {
      expect((await claim({ ...valid, preferred_date: '2026-10-07' })).status).toBe(201);
      expect((await claim({ ...valid, email: 'b@example.com', phone: '9000000001', preferred_date: '2026-10-21' })).status).toBe(201);
      for (const preferred_date of ['2026-10-06', '2026-10-22']) {
        const res = await claim({ ...valid, email: 'c@example.com', phone: '9000000002', preferred_date });
        expect(res.status, preferred_date).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.data.issues[0].path).toBe('preferred_date');
      }
    });

    it('refuses Sundays with GYM_CLOSED', async () => {
      const res = await claim({ ...valid, preferred_date: '2026-10-11' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('GYM_CLOSED');
    });

    it('allows one trial per email or phone, ever', async () => {
      expect((await claim(valid)).status).toBe(201);
      const sameEmail = await claim({ ...valid, email: 'SARA.ALI@example.com', phone: '9000000003' });
      expect(sameEmail.status).toBe(409);
      expect(sameEmail.body.code).toBe('TRIAL_ALREADY_CLAIMED');
      const samePhone = await claim({ ...valid, email: 'other@example.com', phone: '9999912345' });
      expect(samePhone.status).toBe(409);
      expect(samePhone.body.code).toBe('TRIAL_ALREADY_CLAIMED');
      // Seeded trials count too, even once redeemed.
      const seeded = db.trial_passes.find(t => t.status === 'redeemed')!;
      expect((await claim({ ...valid, email: seeded.email, phone: '9000000004' })).status).toBe(409);
    });

    it('validates every field', async () => {
      for (const patch of [
        { name: 'S' },
        { email: 'not-an-email' },
        { phone: '12345' },
        { phone: 'call me maybe' },
        { interest: 'Yoga' },
        { preferred_date: 'tomorrow' },
        { preferred_date: '2026-02-30' },
        { extra: true }
      ]) {
        const res = await claim({ ...valid, ...patch });
        expect(res.status, JSON.stringify(patch)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      const missing = await claim({ name: 'Sara Ali' });
      expect(missing.status).toBe(400);
    });

    it('gives unique codes', async () => {
      const codes = new Set(db.trial_passes.map(t => t.code));
      for (let i = 0; i < 10; i++) {
        const res = await claim({ ...valid, email: `u${i}@example.com`, phone: `90000000${10 + i}` });
        codes.add(res.body.data.code);
      }
      expect(codes.size).toBe(12);
    });

    it('limits each IP to 5 requests per hour when rate limiting is on', async () => {
      config.rateLimit.enabled = true;
      try {
        for (let i = 0; i < 5; i++) {
          const res = await claim({ ...valid, email: `r${i}@example.com`, phone: `91000000${10 + i}` }, '10.9.9.9');
          expect(res.status).toBe(201);
        }
        const blocked = await claim({ ...valid, email: 'r9@example.com', phone: '9100000099' }, '10.9.9.9');
        expect(blocked.status).toBe(429);
        expect(blocked.body.code).toBe('RATE_LIMITED');
        // Another network is unaffected.
        expect((await claim({ ...valid, email: 'r8@example.com', phone: '9100000098' }, '10.8.8.8')).status).toBe(201);
      } finally {
        config.rateLimit.enabled = false;
      }
    });
  });

  describe('GET /trials', () => {
    it('lists trials newest first for admins', async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 60_000));
      await claim(valid);
      const res = await api().get('/api/trials').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].email).toBe(valid.email);
      const created = res.body.data.map((t: any) => t.created_at);
      expect([...created].sort().reverse()).toEqual(created);
    });

    it('is admin only', async () => {
      expect((await api().get('/api/trials')).status).toBe(401);
      expect((await api().get('/api/trials').set(authHeader(personas.trainer))).status).toBe(403);
      expect((await api().get('/api/trials').set(authHeader(personas.member))).status).toBe(403);
    });
  });
});
