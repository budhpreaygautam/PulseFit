import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { gymToday, toGymDate } from '../src/lib/dates.js';

// Wednesday 7 Oct 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00.000Z');
const TODAY = '2026-10-07';

function clearTodaysLogs() {
  db.attendance_logs = db.attendance_logs.filter(l => toGymDate(l.check_in_time) !== TODAY);
}

function setUser(email: string, patch: Record<string, unknown>) {
  db.users = db.users.map(u => (u.email === email ? { ...u, ...patch } : u));
}

const checkIn = (body: object, who: string = personas.admin) =>
  api().post('/api/attendance/check-in').set(authHeader(who)).send(body);

describe('attendance API', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
    clearTodaysLogs();
  });
  afterEach(() => vi.useRealTimers());

  describe('POST /attendance/check-in', () => {
    it('grants an active member by QR token, logs the visit and counts the streak day', async () => {
      const before = userByEmail(personas.member);
      const logsBefore = db.attendance_logs.length;
      const res = await checkIn({ code: before.qr_code_token, method: 'qr' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        result: 'granted',
        already_checked_in: false,
        kind: 'member',
        member: {
          id: before.id,
          name: before.name,
          email: before.email,
          membership_tier: 'pro',
          membership_status: 'active',
          membership_expiry: before.membership_expiry
        },
        log: { user_id: before.id, check_in_method: 'qr', check_in_time: NOW.toISOString() }
      });
      expect(res.body.data.member.password_hash).toBeUndefined();
      expect(db.attendance_logs.length).toBe(logsBefore + 1);
      const after = userByEmail(personas.member);
      expect(after.last_active_date).toBe(TODAY);
      expect(res.body.data.member.streak_days).toBe(after.streak_days);
    });

    it('matches by member id and by email (case-insensitive), and accepts tokenOrId', async () => {
      const vip = userByEmail(personas.vip);
      expect((await checkIn({ code: vip.id })).body.data.member.id).toBe(vip.id);
      const rohan = userByEmail(personas.basic);
      expect((await checkIn({ code: `  ${rohan.email.toUpperCase()} ` })).body.data.member.id).toBe(rohan.id);
      const maya = userByEmail('maya.patel@example.com');
      const legacy = await checkIn({ tokenOrId: maya.qr_code_token, method: 'manual' });
      expect(legacy.status).toBe(200);
      expect(legacy.body.data.log.check_in_method).toBe('manual');
    });

    it('a second scan the same gym day lets them in without a new log or streak day (audit regression)', async () => {
      const token = userByEmail(personas.member).qr_code_token;
      const first = await checkIn({ code: token });
      const streak = userByEmail(personas.member).streak_days;
      const logs = db.attendance_logs.length;

      vi.setSystemTime(new Date(NOW.getTime() + 8 * 3600_000)); // 18:00 the same day
      const second = await checkIn({ code: token });
      expect(second.status).toBe(200);
      expect(second.body.data.already_checked_in).toBe(true);
      expect(second.body.data.log.id).toBe(first.body.data.log.id);
      expect(db.attendance_logs.length).toBe(logs);
      expect(userByEmail(personas.member).streak_days).toBe(streak);
    });

    it('uses the gym day, not the UTC day: 00:30 IST is a new day', async () => {
      const token = userByEmail(personas.member).qr_code_token;
      vi.setSystemTime(new Date('2026-10-07T18:00:00.000Z')); // 23:30 IST on the 7th
      await checkIn({ code: token });
      vi.setSystemTime(new Date('2026-10-07T19:00:00.000Z')); // 00:30 IST on the 8th, still the 7th in UTC
      const next = await checkIn({ code: token });
      expect(next.body.data.already_checked_in).toBe(false);
      expect(userByEmail(personas.member).last_active_date).toBe('2026-10-08');
    });

    it('builds a streak over consecutive days', async () => {
      const token = userByEmail(personas.member).qr_code_token;
      setUser(personas.member, { streak_days: 3, last_active_date: '2026-10-06' });
      const res = await checkIn({ code: token });
      expect(res.body.data.member.streak_days).toBe(4);
    });

    it('denies an expired member with 403 MEMBERSHIP_EXPIRED and data.member (audit regression for the old e2e test)', async () => {
      const dev = userByEmail(personas.expired);
      const logs = db.attendance_logs.length;
      const res = await checkIn({ code: dev.qr_code_token });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_EXPIRED');
      expect(res.body.data.member).toMatchObject({ id: dev.id, name: dev.name, membership_status: 'expired', membership_expiry: '2026-08-01' });
      expect(res.body.error).toContain('2026-08-01');
      expect(db.attendance_logs.length).toBe(logs);
    });

    it('treats a stored active status past its expiry as expired (audit regression)', async () => {
      setUser(personas.basic, { membership_status: 'active', membership_expiry: '2026-10-06' });
      const res = await checkIn({ code: userByEmail(personas.basic).qr_code_token });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_EXPIRED');
      expect(res.body.data.member.membership_status).toBe('expired');
    });

    it('still admits a member on the last day of access', async () => {
      setUser(personas.basic, { membership_expiry: TODAY });
      expect((await checkIn({ code: userByEmail(personas.basic).qr_code_token })).status).toBe(200);
    });

    it('denies frozen and pending members', async () => {
      setUser(personas.basic, { membership_status: 'frozen', frozen_since: '2026-10-01' });
      const frozen = await checkIn({ code: userByEmail(personas.basic).qr_code_token });
      expect(frozen.status).toBe(403);
      expect(frozen.body.code).toBe('MEMBERSHIP_FROZEN');
      expect(frozen.body.data.member.membership_status).toBe('frozen');

      setUser(personas.vip, { membership_status: 'pending', membership_tier: 'none', membership_expiry: null });
      const pending = await checkIn({ code: userByEmail(personas.vip).qr_code_token });
      expect(pending.status).toBe(403);
      expect(pending.body.code).toBe('MEMBERSHIP_PENDING');
    });

    it('lets staff through regardless of membership', async () => {
      setUser(personas.trainer, { membership_status: 'expired', membership_expiry: '2026-01-01' });
      const res = await checkIn({ code: userByEmail(personas.trainer).qr_code_token });
      expect(res.status).toBe(200);
    });

    it('404s with PASS_NOT_FOUND for an unknown code', async () => {
      const res = await checkIn({ code: 'PULSE-MEM-NOBODY-0000' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PASS_NOT_FOUND');
    });

    it('prefers a QR token match over an id or email match', async () => {
      const vip = userByEmail(personas.vip);
      setUser(personas.member, { qr_code_token: vip.id });
      const res = await checkIn({ code: vip.id });
      expect(res.body.data.member.email).toBe(personas.member);
    });

    it('validates the body', async () => {
      for (const body of [{}, { code: '   ' }, { code: 'x', method: 'teleport' }, { code: 'x', extra: 1 }]) {
        const res = await checkIn(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('allows admins and trainers only', async () => {
      const token = userByEmail(personas.vip).qr_code_token;
      expect((await api().post('/api/attendance/check-in').send({ code: token })).status).toBe(401);
      expect((await checkIn({ code: token }, personas.member)).status).toBe(403);
      expect((await checkIn({ code: token }, personas.trainer)).status).toBe(200);
    });

    describe('trial passes', () => {
      const trial = () => db.trial_passes.find(t => t.status === 'issued')!;

      it('admits a trial code once, on its day only', async () => {
        const t = trial();
        expect(t.valid_on).toBe(TODAY);
        const res = await checkIn({ code: t.code.toLowerCase() });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ result: 'granted', kind: 'trial', already_checked_in: false, trial: { id: t.id, status: 'redeemed' } });
        expect(res.body.data.member).toBeUndefined();
        expect(res.body.data.log).toMatchObject({ user_id: t.id, trial_pass_id: t.id, user_name: t.name });
        expect(db.trial_passes.find(x => x.id === t.id)!.redeemed_at).toBe(NOW.toISOString());

        const again = await checkIn({ code: t.code });
        expect(again.status).toBe(403);
        expect(again.body.code).toBe('TRIAL_ALREADY_USED');
        expect(again.body.data.trial.id).toBe(t.id);
      });

      it('rejects a trial on another day', async () => {
        const t = trial();
        db.trial_passes = db.trial_passes.map(x => (x.id === t.id ? { ...x, valid_on: '2026-10-09' } : x));
        const res = await checkIn({ code: t.code });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('TRIAL_NOT_VALID_TODAY');
        expect(res.body.data.trial.valid_on).toBe('2026-10-09');
        expect(db.trial_passes.find(x => x.id === t.id)!.status).toBe('issued');
      });

      it('rejects the seeded, already redeemed trial', async () => {
        const used = db.trial_passes.find(t => t.status === 'redeemed')!;
        const res = await checkIn({ code: used.code });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('TRIAL_ALREADY_USED');
      });
    });
  });

  describe('GET /attendance/logs', () => {
    it('pages the logs newest first with a total', async () => {
      const res = await api().get('/api/attendance/logs?limit=5&offset=2').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(db.attendance_logs.length);
      expect(res.body.data.items).toHaveLength(5);
      const all = [...db.attendance_logs].sort((a, b) => b.check_in_time.localeCompare(a.check_in_time));
      expect(res.body.data.items.map((l: any) => l.id)).toEqual(all.slice(2, 7).map(l => l.id));
    });

    it('defaults to 50 items', async () => {
      const res = await api().get('/api/attendance/logs').set(authHeader(personas.admin));
      expect(res.body.data.items.length).toBe(Math.min(50, db.attendance_logs.length));
    });

    it('filters by gym date and user', async () => {
      await checkIn({ code: userByEmail(personas.member).qr_code_token });
      const today = await api().get(`/api/attendance/logs?date=${TODAY}`).set(authHeader(personas.admin));
      expect(today.body.data.total).toBe(1);
      const id = userByEmail(personas.vip).id;
      const mine = await api().get(`/api/attendance/logs?user_id=${id}&limit=200`).set(authHeader(personas.admin));
      expect(mine.body.data.items.every((l: any) => l.user_id === id)).toBe(true);
      expect(mine.body.data.total).toBe(db.attendance_logs.filter(l => l.user_id === id).length);
    });

    it('validates the query', async () => {
      for (const q of ['limit=0', 'limit=201', 'offset=-1', 'date=07-10-2026', 'format=xml']) {
        const res = await api().get(`/api/attendance/logs?${q}`).set(authHeader(personas.admin));
        expect(res.status, q).toBe(400);
      }
    });

    it('exports every matching row as CSV, neutralising formulas', async () => {
      db.trial_passes = db.trial_passes.map(t => (t.status === 'issued' ? { ...t, name: '=HYPERLINK("x","y")' } : t));
      await checkIn({ code: db.trial_passes.find(t => t.status === 'issued')!.code });
      const res = await api().get('/api/attendance/logs?format=csv&limit=1').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      expect(res.headers['content-disposition']).toContain('attachment');
      const lines = res.text.trim().split('\r\n');
      expect(lines[0]).toBe('id,gym_date,check_in_time,kind,user_id,user_name,user_email,user_tier,check_in_method');
      expect(lines.length - 1).toBe(db.attendance_logs.length);
      expect(lines[1]).toContain(`"'=HYPERLINK(""x"",""y"")"`);
      expect(lines[1]).toContain(',trial,');
    });

    it('is admin only', async () => {
      expect((await api().get('/api/attendance/logs')).status).toBe(401);
      expect((await api().get('/api/attendance/logs').set(authHeader(personas.trainer))).status).toBe(403);
      expect((await api().get('/api/attendance/logs').set(authHeader(personas.member))).status).toBe(403);
    });
  });

  describe('GET /attendance/my', () => {
    it("returns only the caller's logs, newest first", async () => {
      const me = userByEmail(personas.member);
      await checkIn({ code: me.qr_code_token });
      const res = await api().get('/api/attendance/my').set(authHeader(personas.member));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(db.attendance_logs.filter(l => l.user_id === me.id).length);
      expect(res.body.data.every((l: any) => l.user_id === me.id)).toBe(true);
      expect(res.body.data[0].check_in_time).toBe(NOW.toISOString());
    });

    it('caps the list at 100', async () => {
      const me = userByEmail(personas.member);
      db.attendance_logs = Array.from({ length: 120 }, (_, i) => ({
        id: `att_x${i}`, user_id: me.id, check_in_time: new Date(NOW.getTime() - i * 86_400_000).toISOString(), check_in_method: 'qr' as const
      }));
      const res = await api().get('/api/attendance/my').set(authHeader(personas.member));
      expect(res.body.data).toHaveLength(100);
      expect(res.body.data[0].id).toBe('att_x0');
    });

    it('needs a token', async () => {
      expect((await api().get('/api/attendance/my')).status).toBe(401);
    });
  });
});

describe('members seed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('writes about four weeks of plausible check-ins relative to today', () => {
    const today = gymToday();
    const memberLogs = db.attendance_logs.filter(l => !l.trial_pass_id);
    expect(memberLogs.length).toBeGreaterThan(40);
    const dates = memberLogs.map(l => toGymDate(l.check_in_time));
    expect(dates.every(d => d <= today && d > '2026-09-08')).toBe(true);
    for (const log of memberLogs) {
      const t = new Date(log.check_in_time);
      expect(t.getTime()).toBeLessThanOrEqual(NOW.getTime());
      const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .format(t)
        .split(':')
        .map(Number);
      expect(h * 60 + m).toBeGreaterThanOrEqual(6 * 60);
      expect(h * 60 + m).toBeLessThan(22 * 60);
      expect(new Date(`${toGymDate(t)}T00:00:00Z`).getUTCDay()).not.toBe(0); // closed Sundays
      const user = db.users.find(u => u.id === log.user_id)!;
      expect(user.role).toBe('member');
      expect(toGymDate(t) <= user.membership_expiry!).toBe(true);
    }
    // One visit per member per day at most.
    const keys = memberLogs.map(l => `${l.user_id}:${toGymDate(l.check_in_time)}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Nothing for Dev after his expiry.
    expect(memberLogs.some(l => l.user_id === userByEmail(personas.expired).id)).toBe(false);
  });

  it('adds one trial valid today and one already redeemed, with its check-in', () => {
    expect(db.trial_passes).toHaveLength(2);
    const issued = db.trial_passes.find(t => t.status === 'issued')!;
    const redeemed = db.trial_passes.find(t => t.status === 'redeemed')!;
    expect(issued.valid_on).toBe(TODAY);
    expect(redeemed.valid_on < TODAY).toBe(true);
    for (const t of [issued, redeemed]) expect(t.code).toMatch(/^PULSE-TRIAL-[A-Z0-9]{6}$/);
    expect(db.attendance_logs.some(l => l.trial_pass_id === redeemed.id)).toBe(true);
  });
});
