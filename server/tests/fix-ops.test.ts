import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import config from '../src/config.js';
import { addCatalogueIfMissing } from '../src/db/seed.js';
import { displayDate, gymDateTime, gymHour, toGymDate } from '../src/lib/dates.js';
import { withinOpeningHours } from '../src/lib/hours.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { GymClass, TimeSession } from '../src/types/index.js';

// Regression tests for the ops lane of the bug-fix round: opening hours at the turnstile, on the
// floor, for trials and on the timetable; reset links; locked demo personas; create-admin before
// the first start; and the demo seed.

const WED_1000 = '2026-10-14T04:30:00.000Z'; // Wed 14 Oct, 10:00 IST
const WED_2130 = '2026-10-14T16:00:00.000Z'; // Wed 14 Oct, 21:30 IST
const WED_2245 = '2026-10-14T17:15:00.000Z'; // Wed 14 Oct, 22:45 IST
const SUN_0300 = '2026-10-10T21:30:00.000Z'; // Sun 11 Oct, 03:00 IST

const ISO_DATE = /\d{4}-\d{2}-\d{2}/;
const original = {
  enforceOpeningHours: config.enforceOpeningHours,
  demoMode: config.demoMode,
  isLocal: config.isLocal,
  isProduction: config.isProduction,
  serveClient: config.serveClient,
  publicUrl: config.publicUrl,
  trustProxy: config.trustProxy
};

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}

function seedAt(iso: string) {
  at(iso);
  resetDb();
}

const checkIn = (code: string, who: string = personas.admin) =>
  api().post('/api/attendance/check-in').set(authHeader(who)).send({ code, method: 'manual' });

const clearLogsOn = (date: string) => {
  db.attendance_logs = db.attendance_logs.filter(l => toGymDate(l.check_in_time) !== date);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  Object.assign(config, original);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('turnstile and floor while the gym is closed (floor-and-turnstile-open-when-closed)', () => {
  beforeEach(() => {
    config.enforceOpeningHours = true;
  });

  it.each([
    ['on a Sunday night', SUN_0300],
    ['after closing on a weekday', WED_2245]
  ])('refuses members and trial visitors %s, but lets staff in', async (_label, iso) => {
    seedAt(iso);
    clearLogsOn(toGymDate(new Date(iso)));
    const vip = userByEmail(personas.vip);

    const member = await checkIn(vip.qr_code_token);
    expect(member.status).toBe(403);
    expect(member.body.code).toBe('GYM_CLOSED');
    expect(member.body.error).toBe('The gym is closed right now. Opening hours are Monday to Saturday, 06:00 to 22:00.');
    expect(member.body.data.member).toMatchObject({ id: vip.id, name: vip.name });

    const trial = await checkIn('PULSE-TRIAL-K7M2QX');
    expect(trial.status).toBe(403);
    expect(trial.body.code).toBe('GYM_CLOSED');
    expect(trial.body.data.trial.code).toBe('PULSE-TRIAL-K7M2QX');
    expect(db.trial_passes.find(t => t.code === 'PULSE-TRIAL-K7M2QX')!.status).toBe('issued');

    const coach = await checkIn(userByEmail(personas.trainer).qr_code_token);
    expect(coach.status).toBe(200);
    expect(coach.body.data.result).toBe('granted');
    expect(db.attendance_logs.filter(l => l.user_id === vip.id && toGymDate(l.check_in_time) === toGymDate(new Date(iso)))).toHaveLength(0);
  });

  it('refuses a member floor clock-in while closed, still allows staff and clock-out', async () => {
    seedAt(WED_2130);
    const aarav = userByEmail(personas.member);
    const onFloor = db.time_sessions.find(s => s.user_id === aarav.id && s.status === 'active')!;
    expect(onFloor).toBeDefined();
    db.time_sessions = db.time_sessions.filter(s => s.user_id !== userByEmail(personas.vip).id || s.status !== 'active');
    at(WED_2245);

    const floorBefore = (await api().get('/api/time-tracking/active-floor')).body.data.totalActive;
    const vipIn = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.vip)).send({ category: 'Workout & Strength' });
    expect(vipIn.status).toBe(403);
    expect(vipIn.body.code).toBe('GYM_CLOSED');
    expect(vipIn.body.error).toMatch(/closed right now/);
    expect((await api().get('/api/time-tracking/active-floor')).body.data.totalActive).toBe(floorBefore);

    // Someone who stayed past closing can still clock out.
    const out = await api().post('/api/time-tracking/clock-out').set(authHeader(personas.member)).send({});
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ id: onFloor.id, status: 'completed' });

    const again = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.member)).send({ category: onFloor.category });
    expect(again.status).toBe(403);
    expect(again.body.code).toBe('GYM_CLOSED');

    const coach = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.trainer)).send({ category: 'Workout & Strength' });
    expect(coach.status).toBe(201);
  });

  it('lets members in and onto the floor during opening hours', async () => {
    seedAt(WED_1000);
    clearLogsOn('2026-10-14');
    expect((await checkIn(userByEmail(personas.vip).qr_code_token)).status).toBe(200);
    db.time_sessions = db.time_sessions.filter(s => !(s.user_id === userByEmail(personas.basic).id && s.status === 'active'));
    const res = await api().post('/api/time-tracking/clock-in').set(authHeader(personas.basic)).send({ category: 'Workout & Strength' });
    expect(res.status).toBe(201);
  });

  it('applies no clock rule when ENFORCE_OPENING_HOURS is off', async () => {
    config.enforceOpeningHours = false;
    seedAt(SUN_0300);
    clearLogsOn('2026-10-11');
    expect((await checkIn(userByEmail(personas.vip).qr_code_token)).status).toBe(200);
  });
});

describe('free trial for today after closing (trial-today-after-closing)', () => {
  const claim = (preferred_date: string, n = 1) =>
    api()
      .post('/api/trials')
      .send({ name: 'Sara Ali', email: `sara${n}@example.com`, phone: `+91 99999 1234${n}`, interest: 'Zumba & Cardio', preferred_date });

  it('refuses today once the gym has closed, and still offers the next days', async () => {
    config.enforceOpeningHours = true;
    seedAt(WED_2245);
    const today = await claim('2026-10-14');
    expect(today.status).toBe(400);
    expect(today.body.code).toBe('GYM_CLOSED');
    expect(today.body.error).toBe('The gym has closed for today. Please pick another day.');
    expect(db.trial_passes.some(t => t.email === 'sara1@example.com')).toBe(false);

    // The same person can still pick tomorrow.
    const tomorrow = await claim('2026-10-15');
    expect(tomorrow.status).toBe(201);
    expect(tomorrow.body.message).toBe('Your free trial pass is ready for 15 Oct 2026.');
  });

  it('accepts today before closing time, and at any hour when the clock rules are off', async () => {
    config.enforceOpeningHours = true;
    seedAt(WED_2130);
    expect((await claim('2026-10-14', 1)).status).toBe(201);
    config.enforceOpeningHours = false;
    at(WED_2245);
    expect((await claim('2026-10-14', 2)).status).toBe(201);
  });

  it('shows readable dates when the day is out of range', async () => {
    seedAt(WED_1000);
    const res = await claim('2026-11-30');
    expect(res.status).toBe(400);
    expect(res.body.data.issues[0]).toEqual({ path: 'preferred_date', message: 'Pick a day between 14 Oct 2026 and 28 Oct 2026.' });
  });
});

describe('pass codes (checkin-qr-token-case-sensitive, pass-code-case-sensitive)', () => {
  beforeEach(() => seedAt(WED_1000));

  it('matches a member pass code typed in lower case, like trial codes', async () => {
    clearLogsOn('2026-10-14');
    const aarav = userByEmail(personas.member);
    const res = await checkIn(aarav.qr_code_token.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.data.member.id).toBe(aarav.id);
    expect((await checkIn('pulse-trial-k7m2qx')).body.data.kind).toBe('trial');
  });
});

describe('check-in after a forgotten clock-out (checkin-before-stale-session-close)', () => {
  it('closes yesterday’s open floor session before counting today, so the streak carries on', async () => {
    seedAt('2026-10-08T04:30:00.000Z'); // Thu 8 Oct, 10:00 IST
    const aarav = userByEmail(personas.member);
    clearLogsOn('2026-10-08');
    const stale: TimeSession = {
      id: 'ses_forgotten',
      user_id: aarav.id,
      user_name: aarav.name,
      user_email: aarav.email,
      user_avatar: aarav.avatar_url,
      user_tier: aarav.membership_tier,
      category: 'Zumba & Cardio',
      clock_in_time: gymDateTime('2026-10-07', '18:00').toISOString(),
      clock_out_time: null,
      duration_minutes: 0,
      status: 'active'
    };
    db.time_sessions = [stale, ...db.time_sessions.filter(s => s.user_id !== aarav.id || s.status !== 'active')];
    db.users = db.users.map(u => (u.id === aarav.id ? { ...u, streak_days: 4, last_active_date: '2026-10-06' } : u));

    const res = await checkIn(aarav.qr_code_token);
    expect(res.status).toBe(200);
    // Tuesday's run of 4, plus Wednesday's floor session, plus today.
    expect(res.body.data.member.streak_days).toBe(6);
    expect(db.time_sessions.find(s => s.id === 'ses_forgotten')).toMatchObject({ status: 'completed', auto_closed: true });
    expect((await api().get('/api/auth/me').set(authHeader(personas.member))).body.data.streak_days).toBe(6);
  });
});

describe('readable dates in check-in messages (denial-messages-raw-iso-dates)', () => {
  beforeEach(() => seedAt(WED_1000));

  it('formats the expiry date and talks to the front desk about the member', async () => {
    const res = await checkIn(userByEmail(personas.expired).qr_code_token);
    expect(res.body.code).toBe('MEMBERSHIP_EXPIRED');
    expect(res.body.error).toBe("Dev Kapoor's membership expired on 1 Aug 2026. It needs to be renewed before they can come in.");
  });

  it('formats the dates of trial passes that are used or for another day', async () => {
    const redeemed = db.trial_passes.find(t => t.status === 'redeemed')!;
    const used = await checkIn(redeemed.code);
    expect(used.body.code).toBe('TRIAL_ALREADY_USED');
    expect(used.body.error).toBe(`This free trial pass was already used on ${displayDate(toGymDate(redeemed.redeemed_at!))}.`);
    expect(used.body.error).not.toMatch(ISO_DATE);

    const later = await api()
      .post('/api/trials')
      .send({ name: 'Ira Sen', email: 'ira@example.com', phone: '+91 99999 55555', interest: 'Zumba & Cardio', preferred_date: '2026-10-16' });
    expect(later.body.message).not.toMatch(ISO_DATE);
    const early = await checkIn(later.body.data.code);
    expect(early.body.code).toBe('TRIAL_NOT_VALID_TODAY');
    expect(early.body.error).toBe('This free trial pass is valid only on 16 Oct 2026.');
  });
});

describe('classes inside opening hours (classes-outside-opening-hours)', () => {
  const valid = {
    title: 'Lunchtime Kettlebells',
    category: 'Workout & Strength',
    trainer_id: 'trn_rohan',
    day_of_week: 2,
    start_time: '13:00',
    duration_minutes: 40,
    room: 'Strength Arena',
    capacity: 12
  };
  const create = (patch: object) => api().post('/api/classes').set(authHeader(personas.admin)).send({ ...valid, ...patch });
  const update = (id: string, patch: object) => api().put(`/api/classes/${id}`).set(authHeader(personas.admin)).send(patch);

  beforeEach(() => seedAt(WED_1000));

  it.each([
    ['on a Sunday', { day_of_week: 0 }, 'day_of_week'],
    ['before opening', { start_time: '05:30' }, 'start_time'],
    ['starting after closing', { start_time: '23:30', duration_minutes: 60 }, 'start_time'],
    ['running past closing', { start_time: '21:30', duration_minutes: 45 }, 'end_time']
  ])('refuses a class %s with 400 VALIDATION_ERROR on %s', async (_label, patch, path) => {
    const before = db.classes.length;
    const res = await create(patch);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data.issues[0].path).toBe(path);
    expect(res.body.error).toBe(`${path}: ${res.body.data.issues[0].message}`);
    expect(db.classes).toHaveLength(before);
  });

  it('names every problem with a slot (Sunday at 23:30)', async () => {
    const res = await create({ day_of_week: 0, start_time: '23:30', duration_minutes: 60 });
    expect(res.body.data.issues.map((i: { path: string }) => i.path)).toEqual(['day_of_week', 'start_time']);
  });

  it('accepts a class that starts at opening or ends exactly at closing', async () => {
    expect((await create({ start_time: '06:00' })).status).toBe(201);
    expect((await create({ day_of_week: 6, start_time: '21:00', duration_minutes: 60 })).status).toBe(201);
  });

  it('refuses an update that moves a class out of hours and leaves its bookings alone', async () => {
    const bookings = JSON.stringify(db.bookings);
    const sunday = await update('cls_str_wed', { day_of_week: 0 });
    expect(sunday.status).toBe(400);
    expect(sunday.body.data.issues[0].path).toBe('day_of_week');
    const late = await update('cls_str_wed', { duration_minutes: 180, start_time: '20:00' });
    expect(late.body.data.issues[0].path).toBe('end_time');
    const longer = await update('cls_str_wed', { duration_minutes: 180 });
    expect(longer.status).toBe(200); // 18:30 + 3 h ends at 21:30
    expect(db.classes.find(c => c.id === 'cls_str_wed')!.day_of_week).toBe(3);
    expect(JSON.stringify(db.bookings)).toBe(bookings);
  });

  it('keeps an older class outside the hours listed and lets it be renamed', async () => {
    const legacy: GymClass = { ...db.classes.find(c => c.id === 'cls_str_tue')!, id: 'cls_legacy_sun', day_of_week: 0, start_time: '23:00' };
    db.classes = [...db.classes, legacy];
    expect((await api().get('/api/classes')).body.data.some((c: { id: string }) => c.id === 'cls_legacy_sun')).toBe(true);
    expect((await update('cls_legacy_sun', { title: 'Late Lifting' })).status).toBe(200);
    expect((await update('cls_legacy_sun', { start_time: '23:15' })).status).toBe(400);
  });

  it('seeds only classes inside opening hours', () => {
    for (const c of db.classes) {
      const start = Number(c.start_time.slice(0, 2)) * 60 + Number(c.start_time.slice(3));
      const end = start + c.duration_minutes;
      const endTime = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      expect(withinOpeningHours(c.day_of_week, c.start_time, endTime), c.title).toBe(true);
    }
  });
});

describe('locked demo personas (demo-persona-password-grief)', () => {
  let log: MockInstance<typeof console.log>;
  beforeEach(() => {
    seedAt(WED_1000);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it.each(Object.entries(personas).filter(([role]) => ['member', 'vip', 'trainer', 'admin'].includes(role)))(
    'refuses a password change for the %s persona and keeps everyone signed in',
    async (_role, email) => {
      const header = authHeader(email);
      const res = await api().put('/api/auth/password').set(header).send({ currentPassword: 'pulse123', newPassword: 'Grief1234' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_ACCOUNT_LOCKED');
      expect(res.body.error).toMatch(/shared demo account/);
      expect((await api().get('/api/auth/me').set(header)).status).toBe(200);
      expect((await api().post('/api/auth/login').send({ email, password: 'pulse123' })).status).toBe(200);
    }
  );

  it('issues no reset link for a persona and answers exactly like an unknown email', async () => {
    const persona = await api().post('/api/auth/forgot-password').send({ email: personas.member });
    const ghost = await api().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(persona.status).toBe(200);
    expect(persona.body).toEqual(ghost.body);
    expect(db.password_resets).toHaveLength(0);
    expect(log.mock.calls.some(args => String(args[0]).includes('/reset-password?token='))).toBe(false);
  });

  it('refuses to redeem a reset link for a persona', async () => {
    const token = 'issued-before-demo-mode';
    const member = userByEmail(personas.member);
    db.password_resets = [
      {
        id: 'pwr_old',
        user_id: member.id,
        token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        created_at: new Date().toISOString()
      }
    ];
    const res = await api().post('/api/auth/reset-password').send({ token, newPassword: 'Grief1234' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEMO_ACCOUNT_LOCKED');
    expect(await bcrypt.compare('pulse123', userByEmail(personas.member).password_hash!)).toBe(true);
  });

  it('leaves the same accounts alone when demo mode is off', async () => {
    config.demoMode = false;
    const res = await api().put('/api/auth/password').set(authHeader(personas.member)).send({ currentPassword: 'pulse123', newPassword: 'Mine2026ok' });
    expect(res.status).toBe(200);
    const reset = await api().post('/api/auth/forgot-password').send({ email: personas.vip });
    expect(reset.body.data.resetUrl).toBeTruthy();
  });
});

describe('reset link address (reset-link-localhost-origin)', () => {
  let log: MockInstance<typeof console.log>;
  beforeEach(() => {
    seedAt(WED_1000);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const loggedLine = () => log.mock.calls.map(args => String(args[0])).find(l => l.includes('/reset-password?token='))!;
  const loggedLink = () => loggedLine().slice(loggedLine().indexOf('http'));
  const CAUTION = '(address taken from the request; check it before handing it out)';
  const production = () =>
    Object.assign(config, { isProduction: true, isLocal: false, demoMode: false, serveClient: true, publicUrl: '' });

  it('regression: a production server that serves the client links to its own address, not localhost', async () => {
    Object.assign(config, { isProduction: true, isLocal: false, demoMode: false, serveClient: true, publicUrl: '' });
    const res = await api()
      .post('/api/auth/forgot-password')
      .set('Host', 'gym.example.com')
      .set('X-Forwarded-Proto', 'https') // TRUST_PROXY=1 in tests, as behind a reverse proxy
      .set('Origin', 'https://gym.example.com')
      .send({ email: personas.basic });
    expect(res.body.data.resetUrl).toBeUndefined();
    expect(loggedLink().startsWith('https://gym.example.com/reset-password?token=')).toBe(true);
    // Without PUBLIC_URL anyone can set that address, so staff are asked to check it.
    expect(loggedLine()).toContain(CAUTION);
  });

  it('behind a trusted reverse proxy, links to the forwarded host, not the upstream address', async () => {
    production();
    await api()
      .post('/api/auth/forgot-password')
      .set('Host', '127.0.0.1:5004') // what nginx's proxy_pass sends by default
      .set('X-Forwarded-Host', 'gym.example.com')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: personas.basic });
    expect(loggedLink().startsWith('https://gym.example.com/reset-password?token=')).toBe(true);
  });

  it('ignores X-Forwarded-Host when TRUST_PROXY is off', async () => {
    production();
    config.trustProxy = false;
    await api()
      .post('/api/auth/forgot-password')
      .set('Host', 'gym.example.com')
      .set('X-Forwarded-Host', 'evil.example.net')
      .send({ email: personas.basic });
    expect(loggedLink()).toMatch(/^https?:\/\/gym\.example\.com\/reset-password\?token=/);
  });

  it('never builds a link on a host header that is not a plain host name', async () => {
    production();
    await api()
      .post('/api/auth/forgot-password')
      .set('Host', 'gym.example.com')
      .set('X-Forwarded-Host', 'evil.example.net/phish?next=')
      .send({ email: personas.basic });
    expect(loggedLink()).not.toContain('evil.example.net');
    expect(loggedLink().startsWith(`${config.corsOrigins[0]}/reset-password?token=`)).toBe(true);
  });

  it('prefers PUBLIC_URL over anything the request says', async () => {
    Object.assign(config, { serveClient: true, publicUrl: 'https://pulsefit.example.in' });
    const res = await api().post('/api/auth/forgot-password').set('Host', 'evil.example.com').send({ email: personas.basic });
    expect(res.body.data.resetUrl.startsWith('https://pulsefit.example.in/reset-password?token=')).toBe(true);
    expect(loggedLine()).not.toContain(CAUTION);
  });

  it('falls back to the configured client origin in local development with Vite', async () => {
    Object.assign(config, { serveClient: false, publicUrl: '' });
    const res = await api().post('/api/auth/forgot-password').set('Host', 'evil.example.com').send({ email: personas.basic });
    expect(res.body.data.resetUrl.startsWith(`${config.corsOrigins[0]}/reset-password?token=`)).toBe(true);
  });
});

describe('create-admin before the first start (create-admin-before-first-start-empties-gym)', () => {
  it('loads the catalogue into a database that has only an admin, keeping the admin', () => {
    seedAt(WED_1000);
    db.reset();
    const admin = ownerAccount();
    db.users = [admin];
    expect(db.isEmpty()).toBe(false);

    expect(addCatalogueIfMissing()).toBe(true);
    expect(db.membership_plans.length).toBeGreaterThan(0);
    expect(db.classes.length).toBeGreaterThan(0);
    expect(db.exercises.length).toBeGreaterThan(0);
    expect(db.trainers.length).toBeGreaterThan(0);
    expect(db.trainers.every(t => !t.user_id)).toBe(true);
    expect(db.users).toEqual([admin]);
    expect(db.bookings).toHaveLength(0);

    // A gym that has its catalogue is left alone.
    const classes = db.classes.length;
    db.classes = db.classes.slice(1);
    expect(addCatalogueIfMissing()).toBe(false);
    expect(db.classes).toHaveLength(classes - 1);
  });

  // What create-admin writes into a new database file.
  function ownerAccount() {
    return {
      id: 'usr_owner',
      email: 'owner@example.com',
      name: 'Gym Owner',
      role: 'admin' as const,
      avatar_url: '',
      phone: '',
      membership_tier: 'none' as const,
      membership_status: 'pending' as const,
      membership_expiry: null,
      qr_code_token: 'PULSE-MEM-OWNER-ABC123',
      created_at: new Date().toISOString(),
      streak_days: 0,
      last_active_date: null,
      token_version: 0
    };
  }
});

describe('demo seed (seed-checkins-after-activity, seed-persona-linkage-photos)', () => {
  const minutesOfDay = (iso: string) => {
    const date = toGymDate(iso);
    return Math.round((Date.parse(iso) - gymDateTime(date, '00:00').getTime()) / 60_000);
  };

  it.each([
    ['just after opening on a Monday', '2026-10-12T00:37:00.000Z'], // Mon 06:07 IST
    ['just after midnight on a Monday', '2026-10-11T18:37:00.000Z'], // Mon 00:07 IST
    ['on a Wednesday morning', WED_1000],
    ['on a Thursday afternoon', '2026-10-15T10:10:00.000Z'], // Thu 15:40 IST
    ['on a Sunday', '2026-10-11T05:00:00.000Z']
  ])('passes the turnstile before every class and floor session, inside opening hours, when seeded %s', (_label, iso) => {
    seedAt(iso);
    const now = Date.parse(iso);
    const memberLogs = db.attendance_logs.filter(l => !l.trial_pass_id);
    const firstCheckIn = new Map<string, number>();
    for (const l of memberLogs) {
      const key = `${l.user_id}|${toGymDate(l.check_in_time)}`;
      expect(firstCheckIn.has(key), `one check-in per member and day: ${key}`).toBe(false);
      firstCheckIn.set(key, Date.parse(l.check_in_time));
      expect(minutesOfDay(l.check_in_time)).toBeGreaterThanOrEqual(6 * 60);
      expect(minutesOfDay(l.check_in_time)).toBeLessThan(22 * 60);
      expect(Date.parse(l.check_in_time)).toBeLessThanOrEqual(now);
    }

    const activities: [string, number, string][] = [
      ...db.time_sessions.map(s => [s.user_id, Date.parse(s.clock_in_time), `floor ${s.clock_in_time}`] as [string, number, string]),
      ...db.bookings
        .filter(b => b.status === 'attended')
        .map(b => [b.user_id, gymDateTime(b.booking_date, b.start_time!).getTime(), `${b.id} ${b.booking_date}`] as [string, number, string])
    ];
    expect(activities.length).toBeGreaterThan(10);
    for (const [userId, startsAt, label] of activities) {
      const checkedIn = firstCheckIn.get(`${userId}|${toGymDate(startsAt)}`);
      expect(checkedIn, `check-in for ${label}`).toBeDefined();
      expect(checkedIn!, `check-in before ${label}`).toBeLessThanOrEqual(startsAt);
    }
    for (const s of db.time_sessions) {
      expect(gymHour(s.clock_in_time)).toBeGreaterThanOrEqual(6);
      const end = s.clock_out_time ? minutesOfDay(s.clock_out_time) : minutesOfDay(new Date(now).toISOString());
      expect(end).toBeLessThanOrEqual(22 * 60);
    }
  });

  it('puts completed floor sessions in each member’s usual visit window', () => {
    seedAt(WED_1000);
    const aarav = userByEmail(personas.member); // an evening regular
    const rohan = userByEmail(personas.basic); // comes in before work
    const done = (id: string) => db.time_sessions.filter(s => s.user_id === id && s.status === 'completed');
    expect(done(aarav.id).length).toBeGreaterThan(0);
    for (const s of done(aarav.id)) expect(gymHour(s.clock_in_time)).toBeGreaterThanOrEqual(17);
    for (const s of done(rohan.id)) expect(gymHour(s.clock_in_time)).toBeLessThan(9);
  });

  it('gives every person their own photo and first name, and links the coach to their login', () => {
    seedAt(WED_1000);
    const photoId = (url: string) => url.split('?')[0];
    const people = [
      ...db.users.map(u => ({ name: u.name, photo: u.avatar_url })),
      ...db.trainers.filter(t => !t.user_id).map(t => ({ name: t.name, photo: t.avatar_url }))
    ];
    const photos = people.map(p => photoId(p.photo)).filter(p => p.startsWith('https://images.unsplash.com/'));
    expect(new Set(photos).size).toBe(photos.length);
    const firstNames = people.map(p => p.name.replace(/^Coach /, '').split(' ')[0]);
    expect(new Set(firstNames).size).toBe(firstNames.length);

    for (const t of db.trainers.filter(t => t.user_id)) {
      const login = db.users.find(u => u.id === t.user_id)!;
      expect(t.email).toBe(login.email);
      expect(photoId(t.avatar_url)).toBe(photoId(login.avatar_url));
    }
    // Class cards show the coach's current photo.
    for (const c of db.classes) {
      const coach = db.trainers.find(t => t.id === c.trainer_id)!;
      expect(c.trainer_name).toBe(coach.name);
      expect(photoId(c.trainer_avatar!)).toBe(photoId(coach.avatar_url));
    }
  });
});
