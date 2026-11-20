import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../src/config.js';
import { PaymentOrder } from '../src/types/index.js';
import { api, authHeader, bareApi, db, personas, resetDb, tokenFor, userByEmail } from './helpers.js';

// Who can read what through the API. Two layers:
// - Without the app's X-Requested-With header the API answers like an unknown route
//   (requireAppHeader in middleware/auth.ts). A deterrent against opening API addresses directly,
//   not a security boundary: anyone can add the header.
// - What an answer contains: the real protection. Guests and coaches get no one's private details
//   beyond what their screens show, and members only their own data.

const original = { razorpay: { ...config.razorpay }, youpi: { ...config.youpi }, serveClient: config.serveClient, clientDistPath: config.clientDistPath };

beforeEach(() => resetDb());

afterEach(() => {
  Object.assign(config.razorpay, original.razorpay);
  Object.assign(config.youpi, original.youpi);
  Object.assign(config, { serveClient: original.serveClient, clientDistPath: original.clientDistPath });
});

describe('API requests without the app header', () => {
  it.each(['/api/config', '/api/plans', '/api/classes', '/api/trainers', '/api/exercises', '/api/time-tracking/active-floor'])(
    'GET %s answers 404 like an unknown route, and 200 with the header',
    async url => {
      const blocked = await bareApi().get(url);
      expect(blocked.status).toBe(404);
      expect(blocked.body).toEqual({ success: false, error: `No API route for GET ${url}.`, code: 'NOT_FOUND' });
      expect(blocked.headers['x-robots-tag']).toBe('noindex, nofollow');

      const allowed = await api().get(url);
      expect(allowed.status).toBe(200);
      expect(allowed.body.success).toBe(true);
    }
  );

  it('answers 404 to a signed-in request too, with a bearer token or the session cookie', async () => {
    const bearer = await bareApi().get('/api/auth/me').set(authHeader(personas.member));
    const cookie = await bareApi().get('/api/auth/me').set('Cookie', `pulsefit_session=${tokenFor(personas.member)}`);
    for (const res of [bearer, cookie]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toContain(personas.member);
    }
    expect((await api().get('/api/auth/me').set(authHeader(personas.member))).body.data.email).toBe(personas.member);
  });

  it('refuses a write before it does anything', async () => {
    const email = 'no-header@example.com';
    const res = await bareApi().post('/api/auth/register').send({ name: 'No Header', email, password: 'Stronger2026', gender: 'female' });
    expect(res.status).toBe(404);
    expect(db.users.some(u => u.email === email)).toBe(false);
  });

  it('accepts only the exact value the app sends', async () => {
    expect((await bareApi().get('/api/plans').set('X-Requested-With', 'XMLHttpRequest')).status).toBe(404);
    expect((await bareApi().get('/api/plans').set('X-Requested-With', 'PulseFit')).status).toBe(200);
  });

  it('leaves the pages and robots.txt alone', async () => {
    expect((await bareApi().get('/robots.txt')).status).toBe(200);
  });
});

describe('what answers without the app header', () => {
  it('the health check (Railway, deploy/install-release.sh)', async () => {
    const res = await bareApi().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect((await bareApi().head('/api/health')).status).toBe(200);
  });

  function insertOrder(fields: Partial<PaymentOrder> & Pick<PaymentOrder, 'id'>): PaymentOrder {
    const plan = db.membership_plans.find(p => p.tier === 'basic')!;
    const order: PaymentOrder = {
      user_id: userByEmail(personas.expired).id,
      tier: 'basic',
      billing_cycle: 'monthly',
      amount_inr: plan.price_monthly,
      currency: 'INR',
      status: 'created',
      created_at: new Date().toISOString(),
      ...fields
    };
    db.payment_orders = [...db.payment_orders, order];
    return order;
  }

  it('the Razorpay webhook (server to server)', async () => {
    Object.assign(config.razorpay, { webhookSecret: 'bare-webhook-secret' });
    const order = insertOrder({ id: 'order_bare_rzp' });
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_bare_1', order_id: order.id, amount: order.amount_inr * 100, currency: 'INR', status: 'captured' } } }
    });
    const signature = crypto.createHmac('sha256', 'bare-webhook-secret').update(raw).digest('hex');
    const res = await bareApi().post('/api/payment/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).send(raw);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true });
    expect(db.payment_orders.find(o => o.id === order.id)!.status).toBe('paid');
  });

  it('the YouPI webhook (server to server)', async () => {
    Object.assign(config.youpi, { webhookSecret: 'bare-youpi-secret' });
    const order = insertOrder({ id: 'ypo_bare', provider: 'youpi', provider_payment_id: 'yp_bare_1' });
    const raw = JSON.stringify({ event: 'SUCCESS', paymentId: 'yp_bare_1', orderId: order.id, amountPaise: order.amount_inr * 100, currency: 'INR' });
    const signature = `sha256=${crypto.createHmac('sha256', 'bare-youpi-secret').update(raw).digest('hex')}`;
    const res = await bareApi().post('/api/payment/youpi/webhook').set('Content-Type', 'application/json').set('X-Gateway-Signature', signature).send(raw);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true });
    expect(db.payment_orders.find(o => o.id === order.id)!.status).toBe('paid');
  });

  it('CORS preflights from the website and the apps, which never carry the header themselves', async () => {
    for (const origin of ['http://localhost:5173', 'https://localhost', 'capacitor://localhost']) {
      const res = await bareApi()
        .options('/api/classes')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,x-requested-with');
      expect(res.status, origin).toBe(204);
      expect(res.headers['access-control-allow-origin'], origin).toBe(origin);
      expect(String(res.headers['access-control-allow-headers']).toLowerCase(), origin).toContain('x-requested-with');

      // The request that follows the preflight carries the header, as the apps send it.
      const real = await api().get('/api/classes').set('Origin', origin);
      expect(real.status, origin).toBe(200);
      expect(real.headers['access-control-allow-origin'], origin).toBe(origin);
    }
  });

  it('not an OPTIONS request from a site the allowlist refuses: it cannot tell real routes from unknown ones', async () => {
    const unknown = await bareApi().options('/api/does-not-exist').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(unknown.status).toBe(404);
    for (const url of ['/api/guide', '/api/members/usr_x', '/api/attendance/logs', '/api/classes']) {
      const res = await bareApi().options(url).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
      expect(res.status, url).toBe(404);
      expect(res.body, url).toEqual({ success: false, error: `No API route for OPTIONS ${url}.`, code: 'NOT_FOUND' });
      expect(res.headers.allow, url).toBeUndefined();
      expect(res.headers['access-control-allow-origin'], url).toBeUndefined();
    }
  });

  it('exempt paths ignoring case and a trailing slash, as Express routes them', async () => {
    for (const url of ['/api/HEALTH', '/api/health/', '/api/Health/']) {
      const res = await bareApi().get(url);
      expect(res.status, url).toBe(200);
      expect(res.body.data.status, url).toBe('ok');
    }
    // The webhooks are reached (and refuse the missing signature) rather than hidden behind the 404.
    Object.assign(config.razorpay, { webhookSecret: 'bare-webhook-secret' });
    Object.assign(config.youpi, { webhookSecret: 'bare-youpi-secret' });
    for (const url of ['/api/Payment/Webhook/', '/api/PAYMENT/youpi/WEBHOOK', '/api/payment/youpi/webhook/']) {
      const res = await bareApi().post(url).set('Content-Type', 'application/json').send('{}');
      expect(res.status, url).not.toBe(404);
      expect(res.body.code, url).not.toBe('NOT_FOUND');
    }
    // Anything else under them is not exempt.
    expect((await bareApi().get('/api/health/extra')).status).toBe(404);
  });
});

describe('source maps', () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsefit-dist-maps-'));
  fs.mkdirSync(path.join(distDir, 'assets'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><head><title>x</title></head><body></body></html>');
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log(1);\n');
  fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js.map'), '{"version":3,"sourcesContent":["original source"]}');
  fs.writeFileSync(path.join(distDir, 'index-abc123.js.map'), '{"version":3,"sourcesContent":["original source"]}');
  fs.writeFileSync(path.join(distDir, 'assets', 'map-abc123.js'), 'console.log(2);\n');

  afterAll(() => fs.rmSync(distDir, { recursive: true, force: true }));

  it('are never served, even when a build contains some', async () => {
    Object.assign(config, { serveClient: true, clientDistPath: distDir });
    expect((await bareApi().get('/assets/index-abc123.js')).status).toBe(200);
    // A file whose name merely contains "map" is not a source map.
    expect((await bareApi().get('/assets/map-abc123.js')).status).toBe(200);
    for (const url of [
      '/assets/index-abc123.js.map',
      '/assets/index-abc123.js.MAP',
      '/index-abc123.js.map',
      '/assets/index-abc123.js.map?x=1',
      // express.static decodes the address before it opens the file, and file systems forgive a
      // trailing slash (and on Windows a trailing dot or space, or an NTFS stream name).
      '/assets/index-abc123.js%2Emap',
      '/assets/index-abc123.js%2emap',
      '/assets/index-abc123.js.ma%70',
      '/assets/index-abc123.js.map/',
      '/assets/index-abc123.js.map.',
      '/assets/index-abc123.js.map%20',
      '/assets/index-abc123.js.map::$DATA'
    ]) {
      const res = await bareApi().get(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).not.toContain('original source');
    }
  });
});

describe('personal data in answers', () => {
  // Fields that never leave the server, or (gender) only to the person and admins.
  const SECRET_KEYS = ['password_hash', 'token_version', 'google_sub', 'mfa_secret', 'mfa_pending_secret', 'mfa_recovery_codes', 'mfa_last_step', 'gender'];

  function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach(v => keysOf(v, keys));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        keys.add(k);
        keysOf(v, keys);
      }
    }
    return keys;
  }

  /** Emails, phone numbers, pass codes and account ids of every account except `except`, found in the body. */
  function othersIn(body: unknown, except?: string): string[] {
    const text = JSON.stringify(body);
    return db.users
      .filter(u => u.email !== except)
      .flatMap(u => [u.email, u.phone, u.qr_code_token, u.id])
      .filter(v => v && text.includes(JSON.stringify(v)));
  }

  function expectNoSecrets(label: string, body: unknown) {
    const keys = keysOf(body);
    for (const key of SECRET_KEYS) expect(keys.has(key), `${label}: ${key}`).toBe(false);
  }

  it('the public pages name no account: no emails, phone numbers, pass codes, ids or secrets', async () => {
    for (const url of [
      '/api/config',
      '/api/plans',
      '/api/classes',
      '/api/trainers',
      '/api/exercises',
      '/api/time-tracking/active-floor'
    ]) {
      const res = await api().get(url);
      expect(res.status, url).toBe(200);
      expect(othersIn(res.body), url).toEqual([]);
      expectNoSecrets(url, res.body);
    }
    // A single class or coach is for signed-in accounts (checked for a coach below).
    for (const url of ['/api/classes/cls_str_fri', '/api/trainers/trn_vikram']) expect((await api().get(url)).status, url).toBe(401);
  });

  it("a coach's dashboards carry no one's contact details or secrets; the roster and check-in carry what their screens show", async () => {
    const coach = authHeader(personas.trainer);
    for (const url of ['/api/trainer/me', '/api/trainer/clients', '/api/trainer/notes', '/api/time-tracking/active-floor', '/api/classes', '/api/classes/cls_str_fri', '/api/trainers', '/api/trainers/trn_vikram']) {
      const res = await api().get(url).set(coach);
      expect(res.status, url).toBe(200);
      // Client ids are how a coach picks whom a note is about; nothing else of theirs is listed.
      const found = othersIn(res.body, personas.trainer).filter(v => !v.startsWith('usr_'));
      expect(found, url).toEqual([]);
      expectNoSecrets(url, res.body);
    }

    // The roster gives coaches names only (email and phone are null); check-in shows the email.
    const roster = await api().get('/api/bookings/class/cls_str_fri/roster').set(coach);
    expect(roster.status).toBe(200);
    expectNoSecrets('roster', roster.body);
    for (const a of roster.body.data.attendees) {
      expect(Object.keys(a).sort()).toEqual(['booked_at', 'booking_id', 'status', 'user_avatar', 'user_email', 'user_id', 'user_name', 'user_phone', 'user_tier']);
      expect([a.user_email, a.user_phone]).toEqual([null, null]);
    }
    const checkIn = await api().post('/api/attendance/check-in').set(coach).send({ code: userByEmail(personas.member).qr_code_token });
    expect(checkIn.status).toBe(200);
    expectNoSecrets('check-in', checkIn.body);
    expect(Object.keys(checkIn.body.data.member).sort()).toEqual([
      'avatar_url',
      'email',
      'id',
      'membership_expiry',
      'membership_status',
      'membership_tier',
      'name',
      'streak_days'
    ]);
  });

  it.each([personas.member, personas.basic, personas.vip])("a member's own pages carry only their own data (%s)", async email => {
    for (const url of [
      '/api/auth/me',
      '/api/bookings/my?scope=all',
      '/api/attendance/my',
      '/api/payments/my',
      '/api/notes/my',
      '/api/workouts',
      '/api/workouts/analytics',
      '/api/time-tracking/my-stats',
      '/api/id-cards/mine',
      '/api/classes',
      '/api/time-tracking/active-floor'
    ]) {
      const res = await api().get(url).set(authHeader(email));
      expect(res.status, url).toBe(200);
      expect(othersIn(res.body, email), url).toEqual([]);
      for (const key of SECRET_KEYS.filter(k => k !== 'gender')) expect(keysOf(res.body).has(key), `${url}: ${key}`).toBe(false);
    }
  });
});
