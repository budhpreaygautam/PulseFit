import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import config from '../src/config.js';
import { apiLimiter, loginAccountLimiter, mfaSetupLimiter, resetAuthRateLimits } from '../src/lib/authRateLimits.js';
import { SESSION_COOKIE } from '../src/middleware/auth.js';
import { toGymDate } from '../src/lib/dates.js';
import { api, authHeader, db, personas, resetDb, tokenFor, userByEmail } from './helpers.js';

const original = {
  isProduction: config.isProduction,
  isLocal: config.isLocal,
  demoMode: config.demoMode,
  serveClient: config.serveClient,
  publicUrl: config.publicUrl,
  logResetLinks: config.logResetLinks,
  rateLimitEnabled: config.rateLimit.enabled
};

afterEach(async () => {
  Object.assign(config, {
    isProduction: original.isProduction,
    isLocal: original.isLocal,
    demoMode: original.demoMode,
    serveClient: original.serveClient,
    publicUrl: original.publicUrl,
    logResetLinks: original.logResetLinks
  });
  config.rateLimit.enabled = original.rateLimitEnabled;
  await resetAuthRateLimits();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function directives(header: string): Record<string, string[]> {
  return Object.fromEntries(
    header
      .split(';')
      .map(d => d.trim().split(/\s+/))
      .filter(parts => parts[0])
      .map(([name, ...values]) => [name, values])
  );
}

describe('Content Security Policy', () => {
  it('is sent on every response, with no inline scripts allowed', async () => {
    const res = await api().get('/api/health');
    const csp = directives(res.headers['content-security-policy']);
    expect(csp['script-src']).toContain("'self'");
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
    expect(csp['script-src']).not.toContain("'unsafe-eval'");
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
    // Razorpay Checkout and Google sign-in still load.
    expect(csp['script-src']).toEqual(expect.arrayContaining(['https://*.razorpay.com', 'https://accounts.google.com']));
    expect(csp['frame-src']).toEqual(expect.arrayContaining(['https://*.razorpay.com', 'https://accounts.google.com']));
    expect(csp['style-src']).toContain('https://fonts.googleapis.com');
    expect(csp['font-src']).toContain('https://fonts.gstatic.com');
  });

  it('the website needs no inline script: index.html loads the theme script from a file', () => {
    const client = fileURLToPath(new URL('../../client', import.meta.url));
    const html = fs.readFileSync(path.join(client, 'index.html'), 'utf8');
    expect(html.match(/<script(?![^>]*\ssrc=)[^>]*>/g) ?? []).toEqual([]);
    expect(html).toContain('<script src="/theme-init.js"></script>');
    expect(fs.existsSync(path.join(client, 'public/theme-init.js'))).toBe(true);
  });
});

describe('first password on an account without one (REAUTH_REQUIRED)', () => {
  const GOOGLE_ONLY = 'isha.nair@example.com';
  const T0 = new Date('2026-10-14T04:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    resetDb();
  });

  const minutesLater = (minutes: number) => vi.setSystemTime(new Date(T0.getTime() + minutes * 60_000));

  it('refuses a bearer token issued more than 15 minutes ago, and sets nothing', async () => {
    expect(userByEmail(GOOGLE_ONLY).password_hash).toBeFalsy();
    const token = tokenFor(GOOGLE_ONLY);
    minutesLater(16);
    const res = await api().put('/api/auth/password').set({ Authorization: `Bearer ${token}` }).send({ newPassword: 'Stronger2026' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REAUTH_REQUIRED');
    expect(res.body.error).toMatch(/sign in again/i);
    expect(userByEmail(GOOGLE_ONLY).password_hash).toBeFalsy();
  });

  it('refuses an old cookie session the same way', async () => {
    const token = tokenFor(GOOGLE_ONLY);
    minutesLater(30);
    const res = await api()
      .put('/api/auth/password')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .set('X-Requested-With', 'PulseFit')
      .send({ newPassword: 'Stronger2026' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REAUTH_REQUIRED');
  });

  it('allows it within 15 minutes of signing in', async () => {
    const token = tokenFor(GOOGLE_ONLY);
    minutesLater(14);
    const res = await api().put('/api/auth/password').set({ Authorization: `Bearer ${token}` }).send({ newPassword: 'Stronger2026' });
    expect(res.status).toBe(200);
    expect(userByEmail(GOOGLE_ONLY).password_hash).toBeTruthy();
  });

  it('does not apply to an account that already has a password (the current one is the proof)', async () => {
    const token = tokenFor(personas.basic);
    minutesLater(60);
    const res = await api()
      .put('/api/auth/password')
      .set({ Authorization: `Bearer ${token}` })
      .send({ currentPassword: 'pulse123', newPassword: 'Stronger2026' });
    expect(res.status).toBe(200);
  });
});

describe('password reset links in production', () => {
  let log: MockInstance<typeof console.log>;
  beforeEach(() => {
    resetDb();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    Object.assign(config, { isProduction: true, isLocal: false, demoMode: false, serveClient: true, publicUrl: '' });
  });

  const loggedLines = () => log.mock.calls.map(args => String(args[0])).filter(l => l.includes('/reset-password?token='));

  it('by default logs no link, creates none and tells people to ask the front desk', async () => {
    config.logResetLinks = false;
    const known = await api().post('/api/auth/forgot-password').send({ email: personas.basic });
    const unknown = await api().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(known.status).toBe(200);
    expect(known.body.data).toEqual(unknown.body.data);
    expect(known.body.data.resetUrl).toBeUndefined();
    expect(known.body.data.message).toMatch(/front desk/);
    expect(loggedLines()).toEqual([]);
    expect(db.password_resets).toHaveLength(0);
  });

  it('with LOG_RESET_LINKS logs a working link with the account id, never the email', async () => {
    config.logResetLinks = true;
    const user = userByEmail(personas.basic);
    await api().post('/api/auth/forgot-password').send({ email: personas.basic });
    const [line] = loggedLines();
    expect(line).toContain(user.id);
    expect(line).not.toContain(personas.basic);
    const token = new URL(line.slice(line.indexOf('http'))).searchParams.get('token')!;
    expect((await api().post('/api/auth/reset-password').send({ token, newPassword: 'Stronger2026' })).status).toBe(200);
  });

  it('never builds the link on the Host or X-Forwarded-Host headers without PUBLIC_URL', async () => {
    config.logResetLinks = true;
    await api()
      .post('/api/auth/forgot-password')
      .set('Host', 'evil.example.com')
      .set('X-Forwarded-Host', 'evil.example.net')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: personas.basic });
    const [line] = loggedLines();
    expect(line).not.toContain('evil.example');
    expect(line.slice(line.indexOf('http')).startsWith(`${config.corsOrigins[0]}/reset-password?token=`)).toBe(true);
  });
});

describe('check-in by member id or email', () => {
  // Wednesday 7 Oct 2026, 10:00 at the gym (IST).
  const NOW = new Date('2026-10-07T04:30:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
    db.attendance_logs = db.attendance_logs.filter(l => toGymDate(l.check_in_time) !== '2026-10-07');
  });

  const checkIn = (body: object) => api().post('/api/attendance/check-in').set(authHeader(personas.admin)).send(body);

  it('is refused for a scanned code (qr, camera, kiosk, or no method): only staff typing it may look an account up', async () => {
    const member = userByEmail(personas.member);
    for (const method of ['qr', 'camera', 'kiosk', undefined]) {
      for (const code of [member.email, member.id]) {
        const res = await checkIn({ code, ...(method ? { method } : {}) });
        expect(res.status, `${method} ${code}`).toBe(404);
        expect(res.body.code).toBe('PASS_NOT_FOUND');
      }
    }
    expect(db.attendance_logs.some(l => l.user_id === member.id && toGymDate(l.check_in_time) === '2026-10-07')).toBe(false);
  });

  it('still works when staff type it (manual), and scans still accept passes and ID cards', async () => {
    const member = userByEmail(personas.member);
    const manual = await checkIn({ code: member.email, method: 'manual' });
    expect(manual.status).toBe(200);
    expect(manual.body.data.member.id).toBe(member.id);

    const vip = userByEmail(personas.vip);
    expect((await checkIn({ code: vip.qr_code_token, method: 'camera' })).body.data.member.id).toBe(vip.id);

    const card = db.id_cards.find(c => c.status === 'active' && db.users.some(u => u.id === c.user_id && u.membership_status === 'active'));
    if (card) {
      const res = await checkIn({ code: card.card_number, method: 'qr' });
      expect(res.status).toBe(200);
      expect(res.body.data.member.id).toBe(card.user_id);
    }
  });
});

describe('attendance CSV', () => {
  beforeEach(() => resetDb());

  it('quotes cells holding a semicolon or tab, so a semicolon-locale spreadsheet cannot split out a formula', async () => {
    const member = userByEmail(personas.member);
    db.attendance_logs = [
      {
        id: 'att_csv1',
        user_id: member.id,
        user_name: 'Asha;=HYPERLINK("http://x","y")',
        user_email: 'a\t=1+1@example.com',
        user_tier: 'pro',
        check_in_time: new Date().toISOString(),
        check_in_method: 'qr'
      }
    ];
    const res = await api().get('/api/attendance/logs?format=csv').set(authHeader(personas.admin));
    expect(res.status).toBe(200);
    const row = res.text.split('\r\n')[1];
    expect(row).toContain('"Asha;=HYPERLINK(""http://x"",""y"")"');
    expect(row).toContain('"a\t=1+1@example.com"');
  });
});

describe('rate limits', () => {
  beforeEach(async () => {
    await resetAuthRateLimits();
    config.rateLimit.enabled = true;
  });

  function loginApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/login', loginAccountLimiter, (req, res) => {
      res.status(req.body.password === 'right' ? 200 : 401).json({ success: req.body.password === 'right' });
    });
    return app;
  }

  it('per account: 10 failed sign-ins per email, whatever the IP; other accounts and successes are not affected', async () => {
    const app = loginApp();
    const attempt = (email: string, password: string, ip: string) =>
      request(app).post('/login').set('X-Forwarded-For', ip).send({ email, password });

    for (let i = 0; i < 5; i++) expect((await attempt('Victim@Example.com', 'right', '198.51.100.1')).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await attempt(' victim@example.com ', 'wrong', `203.0.113.${i}`)).status).toBe(401);
    const blocked = await attempt('VICTIM@example.com', 'right', '198.51.100.99');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect((await attempt('other@example.com', 'wrong', '203.0.113.1')).status).toBe(401);
  });

  it('MFA setup is counted per signed-in account', async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: String(req.headers['x-user']) };
      next();
    });
    app.post('/mfa', mfaSetupLimiter, (_req, res) => {
      res.status(400).end();
    });
    for (let i = 0; i < 10; i++) expect((await request(app).post('/mfa').set('X-User', 'a')).status).toBe(400);
    expect((await request(app).post('/mfa').set('X-User', 'a')).status).toBe(429);
    expect((await request(app).post('/mfa').set('X-User', 'b')).status).toBe(400);
  });

  it('the whole API: 300 requests a minute per IP, never counting the health check', async () => {
    expect(apiLimiter).toBeTypeOf('function');
    const ip = '192.0.2.77';
    for (let i = 0; i < 310; i++) expect((await api().get('/api/health').set('X-Forwarded-For', ip)).status).toBe(200);
    for (let i = 0; i < 300; i++) expect((await api().get('/api/plans').set('X-Forwarded-For', ip)).status).not.toBe(429);
    const limited = await api().get('/api/plans').set('X-Forwarded-For', ip);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect((await api().get('/api/plans').set('X-Forwarded-For', '192.0.2.78')).status).not.toBe(429);
  });

  it('are all off when config.rateLimit.enabled is false', async () => {
    config.rateLimit.enabled = false;
    for (let i = 0; i < 305; i++) expect((await api().get('/api/plans').set('X-Forwarded-For', '192.0.2.90')).status).not.toBe(429);
  });
});
