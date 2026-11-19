import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, bareApi, db, personas, resetDb } from './helpers.js';
import config from '../src/config.js';
import { resetAuthRateLimits } from '../src/lib/authRateLimits.js';
import { setMailSenderForTests, type Mail } from '../src/lib/mailer.js';

const valid = {
  name: 'Sara Ali',
  email: 'Sara.Ali@example.com',
  phone: '+91 99999 12345',
  interest: 'Zumba & Cardio',
  contact_time: 'Evening',
  message: 'Do you have morning batches?',
  consent: true,
  website: ''
};

const send = (body: object, ip = '10.0.0.1') => api().post('/api/enquiries').set('X-Forwarded-For', ip).send(body);
const nextTick = () => new Promise(resolve => setImmediate(resolve));

describe('enquiries API', () => {
  let sent: Mail[];

  beforeEach(async () => {
    resetDb();
    await resetAuthRateLimits();
    sent = [];
    setMailSenderForTests(async mail => {
      sent.push(mail);
    });
    Object.assign(config.mail, { brevoApiKey: 'test-key', from: 'desk@example.com', inbox: 'desk@example.com' });
  });
  afterEach(() => {
    setMailSenderForTests(null);
    Object.assign(config.mail, { brevoApiKey: '', from: '', inbox: '' });
    config.rateLimit.enabled = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('POST /enquiries', () => {
    it('stores a guest enquiry, then emails the gym and confirms to the enquirer', async () => {
      const res = await send(valid);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, data: null });
      expect(typeof res.body.message).toBe('string');

      const stored = db.enquiries[0];
      expect(stored).toMatchObject({ status: 'new', email: 'sara.ali@example.com', message: valid.message, interest: 'Zumba & Cardio' });
      expect(stored.id).toMatch(/^enq_/);
      expect('consent' in stored || 'website' in stored).toBe(false);

      await vi.waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[0]).toMatchObject({ to: 'desk@example.com', replyTo: 'sara.ali@example.com' });
      expect(sent[0].subject).toContain('Zumba & Cardio');
      expect(sent[0].subject).toContain(valid.phone);
      expect(sent[0].subject).not.toContain('Sara');
      expect(sent[1]).toMatchObject({ to: 'sara.ali@example.com', replyTo: 'desk@example.com' });
    });

    it('escapes what people type and never repeats it to the enquirer', async () => {
      expect((await send({ ...valid, name: '<b>Sara</b>', message: '<script>x</script>\nline 2' })).status).toBe(201);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[0].html).toContain('&lt;script&gt;');
      expect(sent[0].html).not.toContain('<script>');
      expect(sent[0].html).not.toContain('<b>Sara</b>');
      for (const part of [sent[1].text, sent[1].html]) {
        expect(part).not.toContain('Sara');
        expect(part).not.toContain('script');
      }
    });

    it('refuses bad input with VALIDATION_ERROR and stores or sends nothing', async () => {
      const { consent: _omit, ...withoutConsent } = valid;
      const bodies = [
        { ...valid, name: 'S' },
        { ...valid, email: 'not-an-email' },
        { ...valid, phone: '12345' },
        { ...valid, interest: 'Yoga' },
        { ...valid, contact_time: 'Midnight' },
        { ...valid, message: 'x'.repeat(1001) },
        { ...valid, consent: false },
        withoutConsent,
        { ...valid, extra: true }
      ];
      for (const body of bodies) {
        const res = await send(body);
        expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      await nextTick();
      expect(db.enquiries).toEqual([]);
      expect(sent).toEqual([]);
    });

    it('answers a filled-in trap field like a real enquiry but keeps and sends nothing', async () => {
      const trapped = await send({ ...valid, website: 'https://spam.example' });
      await nextTick();
      expect(trapped.status).toBe(201);
      expect(db.enquiries).toEqual([]);
      expect(sent).toEqual([]);
      expect((await send(valid)).body).toEqual(trapped.body);
    });

    it('still stores enquiries when email is not set up, and sends nothing', async () => {
      config.mail.brevoApiKey = '';
      expect((await send(valid)).status).toBe(201);
      expect(db.enquiries).toHaveLength(1);
      await nextTick();
      expect(sent).toEqual([]);
    });

    it('never fails the form when the mail service fails, and logs no personal data', async () => {
      setMailSenderForTests(async () => {
        throw new Error('Brevo answered 500');
      });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await send(valid)).status).toBe(201);
      const id = db.enquiries[0].id;
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
      const logged = spy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(logged).toContain(id);
      expect(logged).toContain('Brevo answered 500');
      for (const personal of ['sara', 'Sara', '99999', valid.message]) expect(logged).not.toContain(personal);
    });

    it('confirms to the same address at most once a day', async () => {
      expect((await send(valid)).status).toBe(201);
      expect((await send({ ...valid, message: 'One more question' })).status).toBe(201);
      await vi.waitFor(() => expect(sent).toHaveLength(3));
      await nextTick();
      expect(sent.filter(m => m.to === 'desk@example.com')).toHaveLength(2);
      expect(sent.filter(m => m.to === 'sara.ali@example.com')).toHaveLength(1);
    });

    it('limits each network to 5 enquiries an hour when rate limiting is on', async () => {
      config.rateLimit.enabled = true;
      for (let i = 0; i < 5; i++) expect((await send(valid, '10.9.9.9')).status).toBe(201);
      const blocked = await send(valid, '10.9.9.9');
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
      expect((await send(valid, '10.8.8.8')).status).toBe(201);
    });

    it('answers 404 without the app header, like the rest of the API, and stores nothing', async () => {
      expect((await bareApi().post('/api/enquiries').send(valid)).status).toBe(404);
      expect(db.enquiries).toEqual([]);
    });
  });

  describe('GET /enquiries', () => {
    it('lists enquiries newest first for admins only', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-01T05:00:00.000Z'));
      await send({ ...valid, email: 'first@example.com' });
      vi.setSystemTime(new Date('2026-11-01T05:01:00.000Z'));
      await send({ ...valid, email: 'second@example.com' });

      const res = await api().get('/api/enquiries').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data.map((e: { email: string }) => e.email)).toEqual(['second@example.com', 'first@example.com']);

      expect((await api().get('/api/enquiries')).status).toBe(401);
      expect((await api().get('/api/enquiries').set(authHeader(personas.trainer))).status).toBe(403);
      expect((await api().get('/api/enquiries').set(authHeader(personas.member))).status).toBe(403);
    });

    it('drops enquiries older than 12 months: hidden at once, removed on the next enquiry', async () => {
      db.enquiries = [
        {
          id: 'enq_old',
          name: 'Old Lead',
          email: 'old@example.com',
          phone: '+91 90000 00000',
          interest: 'Not sure yet',
          contact_time: 'Any time',
          message: '',
          status: 'closed',
          created_at: new Date(Date.now() - 400 * 86_400_000).toISOString()
        }
      ];
      const list = await api().get('/api/enquiries').set(authHeader(personas.admin));
      expect(list.body.data).toEqual([]);
      await send(valid);
      expect(db.enquiries.map(e => e.id)).not.toContain('enq_old');
    });
  });

  describe('PATCH /enquiries/:id', () => {
    it('lets an admin set the status, and refuses anything else', async () => {
      await send(valid);
      const id = db.enquiries[0].id;
      const admin = authHeader(personas.admin);

      const res = await api().patch(`/api/enquiries/${id}`).set(admin).send({ status: 'contacted' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id, status: 'contacted' });
      expect(db.enquiries[0].status).toBe('contacted');

      for (const body of [{ status: 'done' }, { status: 'closed', extra: 1 }]) {
        const bad = await api().patch(`/api/enquiries/${id}`).set(admin).send(body);
        expect(bad.status).toBe(400);
        expect(bad.body.code).toBe('VALIDATION_ERROR');
      }
      const missing = await api().patch('/api/enquiries/enq_missing').set(admin).send({ status: 'closed' });
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('ENQUIRY_NOT_FOUND');
      expect((await api().patch(`/api/enquiries/${id}`).set(authHeader(personas.member)).send({ status: 'closed' })).status).toBe(403);
      expect(db.enquiries[0].status).toBe('contacted');
    });
  });
});
