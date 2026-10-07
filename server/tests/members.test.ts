import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';

// Wednesday 7 Oct 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00.000Z');

describe('members admin API', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('GET /members', () => {
    it('requires a token and the admin role', async () => {
      expect((await api().get('/api/members')).status).toBe(401);
      expect((await api().get('/api/members').set(authHeader(personas.member))).status).toBe(403);
      expect((await api().get('/api/members').set(authHeader(personas.trainer))).status).toBe(403);
    });

    it('lists only members by default, as SafeUsers', async () => {
      const res = await api().get('/api/members').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((u: any) => u.role === 'member')).toBe(true);
      expect(res.body.data.some((u: any) => u.password_hash || u.token_version !== undefined)).toBe(false);
    });

    it('returns everyone with role=all and filters by role/tier', async () => {
      const all = await api().get('/api/members?role=all').set(authHeader(personas.admin));
      expect(all.body.data.length).toBe(db.users.length);
      const legacy = await api().get('/api/members?role=All').set(authHeader(personas.admin));
      expect(legacy.body.data.length).toBe(db.users.length);
      const trainers = await api().get('/api/members?role=trainer').set(authHeader(personas.admin));
      expect(trainers.body.data.map((u: any) => u.email)).toEqual([personas.trainer]);
      const vip = await api().get('/api/members?tier=vip').set(authHeader(personas.admin));
      expect(vip.body.data.map((u: any) => u.email)).toEqual([personas.vip]);
    });

    it('filters by effective status (an active member past expiry is expired)', async () => {
      db.users = db.users.map(u => (u.email === personas.basic ? { ...u, membership_expiry: '2026-10-06' } : u));
      const expired = await api().get('/api/members?status=expired').set(authHeader(personas.admin));
      const emails = expired.body.data.map((u: any) => u.email);
      expect(emails).toContain(personas.basic);
      expect(emails).toContain(personas.expired);
      expect(expired.body.data.every((u: any) => u.membership_status === 'expired')).toBe(true);
      const active = await api().get('/api/members?status=active').set(authHeader(personas.admin));
      expect(active.body.data.map((u: any) => u.email)).not.toContain(personas.basic);
    });

    it('searches by name, email, phone and pass token', async () => {
      const byName = await api().get('/api/members?search=aarav').set(authHeader(personas.admin));
      expect(byName.body.data.map((u: any) => u.email)).toEqual([personas.member]);
      const byToken = await api().get('/api/members?search=PULSE-MEM-MAYA').set(authHeader(personas.admin));
      expect(byToken.body.data).toHaveLength(1);
      const byPhone = await api().get('/api/members?search=98116').set(authHeader(personas.admin));
      expect(byPhone.body.data[0].email).toBe(personas.expired);
    });

    it('rejects an unknown filter value', async () => {
      const res = await api().get('/api/members?tier=gold').set(authHeader(personas.admin));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /members/:id', () => {
    it('returns the profile with counts, recent attendance and payments', async () => {
      const member = userByEmail(personas.member);
      const res = await api().get(`/api/members/${member.id}`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.email).toBe(personas.member);
      expect(d.password_hash).toBeUndefined();
      expect(typeof d.bookings_count).toBe('number');
      expect(typeof d.workouts_count).toBe('number');
      expect(typeof d.upcoming_bookings).toBe('number');
      expect(d.attendance_count).toBe(db.attendance_logs.filter(l => l.user_id === member.id).length);
      expect(d.recent_attendance.length).toBe(Math.min(10, d.attendance_count));
      const times = d.recent_attendance.map((l: any) => l.check_in_time);
      expect([...times].sort().reverse()).toEqual(times);
      expect(Array.isArray(d.payments)).toBe(true);
    });

    it('404s for an unknown id and is admin only', async () => {
      expect((await api().get('/api/members/usr_nope').set(authHeader(personas.admin))).status).toBe(404);
      const own = userByEmail(personas.member).id;
      expect((await api().get(`/api/members/${own}`).set(authHeader(personas.member))).status).toBe(403);
    });
  });

  describe('POST /members', () => {
    it('creates a member and returns the temp password inside data (audit regression)', async () => {
      const res = await api()
        .post('/api/members')
        .set(authHeader(personas.admin))
        .send({ name: 'Kiran Rao', email: 'Kiran.Rao@Example.com', phone: '+91 90000 11111', membership_tier: 'pro', expiry_months: 1 });
      expect(res.status).toBe(201);
      expect(res.body.tempPassword).toBeUndefined();
      const { member, tempPassword } = res.body.data;
      expect(typeof tempPassword).toBe('string');
      expect(tempPassword.length).toBeGreaterThanOrEqual(10);
      expect(tempPassword).not.toMatch(/^pulse\d{3}$/);
      expect(member).toMatchObject({
        email: 'kiran.rao@example.com',
        role: 'member',
        membership_tier: 'pro',
        membership_status: 'active',
        // 1 month from 7 Oct: the last day of access is 6 Nov.
        membership_expiry: '2026-11-06',
        streak_days: 0
      });
      expect(member.password_hash).toBeUndefined();
      expect(member.qr_code_token).toMatch(/^PULSE-MEM-KIRAN-[0-9A-F]{6}$/);

      const login = await api().post('/api/auth/login').send({ email: 'kiran.rao@example.com', password: tempPassword });
      expect(login.status).toBe(200);
    });

    it('defaults to a pending account with no plan', async () => {
      const res = await api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'Zoya Khan', email: 'zoya@example.com' });
      expect(res.status).toBe(201);
      expect(res.body.data.member).toMatchObject({ role: 'member', membership_tier: 'none', membership_status: 'pending', membership_expiry: null });
    });

    it('a tier without months stays pending', async () => {
      const res = await api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'Zoya Khan', email: 'zoya@example.com', membership_tier: 'vip' });
      expect(res.body.data.member.membership_status).toBe('pending');
    });

    it('gives unique pass tokens, even for names without Latin letters (audit regression)', async () => {
      const a = await api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'अर्जुन सिंह', email: 'a1@example.com' });
      const b = await api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'अर्जुन सिंह', email: 'a2@example.com' });
      expect(a.body.data.member.qr_code_token).toMatch(/^PULSE-MEM-ATHL-/);
      expect(a.body.data.member.qr_code_token).not.toBe(b.body.data.member.qr_code_token);
    });

    it('409s on an email already in use', async () => {
      const res = await api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'Copy Cat', email: personas.member.toUpperCase() });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('validates role, tier, expiry_months and unknown fields instead of 500ing (audit regression)', async () => {
      const base = { name: 'Valid Name', email: 'valid@example.com' };
      for (const extra of [
        { role: 'owner' },
        { membership_tier: 'gold' },
        { expiry_months: 'abc' },
        { expiry_months: 25 },
        { expiry_months: -1 },
        { expiry_months: 1.5 },
        { membership_status: 'active' }
      ]) {
        const res = await api().post('/api/members').set(authHeader(personas.admin)).send({ ...base, ...extra });
        expect(res.status, JSON.stringify(extra)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      const noEmail = await api().post('/api/members').set(authHeader(personas.admin)).send({ name: 'No Email' });
      expect(noEmail.status).toBe(400);
      expect(noEmail.body.data.issues[0].path).toBe('email');
    });

    it('is admin only', async () => {
      const res = await api().post('/api/members').set(authHeader(personas.trainer)).send({ name: 'X Y', email: 'xy@example.com' });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /members/:id', () => {
    it('updates fields and returns a SafeUser', async () => {
      const id = userByEmail(personas.basic).id;
      const res = await api()
        .put(`/api/members/${id}`)
        .set(authHeader(personas.admin))
        .send({ name: 'Rohan M.', membership_tier: 'vip', membership_expiry: '2027-01-31' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Rohan M.', membership_tier: 'vip', membership_expiry: '2027-01-31' });
      expect(res.body.data.password_hash).toBeUndefined();
      expect(userByEmail(personas.basic).name).toBe('Rohan M.');
    });

    it('rejects an empty name and a malformed expiry (audit regression)', async () => {
      const id = userByEmail(personas.basic).id;
      for (const body of [{ name: '   ' }, { membership_expiry: '31/01/2027' }, { membership_expiry: '2027-02-30' }, { membership_status: 'gone' }, { email: 'x@y.z' }]) {
        const res = await api().put(`/api/members/${id}`).set(authHeader(personas.admin)).send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(userByEmail(personas.basic).name).toBe('Rohan Mehra');
    });

    it('can clear the expiry and tracks frozen_since with the status', async () => {
      const id = userByEmail(personas.basic).id;
      const frozen = await api().put(`/api/members/${id}`).set(authHeader(personas.admin)).send({ membership_status: 'frozen' });
      expect(frozen.body.data).toMatchObject({ membership_status: 'frozen', frozen_since: '2026-10-07' });
      const cleared = await api().put(`/api/members/${id}`).set(authHeader(personas.admin)).send({ membership_status: 'pending', membership_expiry: null });
      expect(cleared.body.data).toMatchObject({ membership_status: 'pending', membership_expiry: null, frozen_since: null });
    });

    it('stops an admin changing their own role', async () => {
      const id = userByEmail(personas.admin).id;
      const res = await api().put(`/api/members/${id}`).set(authHeader(personas.admin)).send({ role: 'member' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CANNOT_CHANGE_OWN_ROLE');
      expect(userByEmail(personas.admin).role).toBe('admin');
      // Re-sending the same role is not a change.
      expect((await api().put(`/api/members/${id}`).set(authHeader(personas.admin)).send({ role: 'admin', name: 'Priya V.' })).status).toBe(200);
    });

    it('lets an admin promote and demote other users', async () => {
      const trainerId = userByEmail(personas.trainer).id;
      const promoted = await api().put(`/api/members/${trainerId}`).set(authHeader(personas.admin)).send({ role: 'admin' });
      expect(promoted.body.data.role).toBe('admin');
      const demoted = await api().put(`/api/members/${trainerId}`).set(authHeader(personas.admin)).send({ role: 'trainer' });
      expect(demoted.status).toBe(200);
      expect(demoted.body.data.role).toBe('trainer');
    });

    it('404s for an unknown member', async () => {
      expect((await api().put('/api/members/usr_nope').set(authHeader(personas.admin)).send({ name: 'Ab Cd' })).status).toBe(404);
    });
  });

  describe('DELETE /members/:id', () => {
    it('removes the member and their personal records but keeps payments', async () => {
      const id = userByEmail(personas.member).id;
      const now = new Date().toISOString();
      db.trainer_notes = [
        ...db.trainer_notes,
        { id: 'note_t1', trainer_user_id: 'usr_trainer_1', trainer_name: 'Coach Vikram Rathore', member_id: id, category: 'general', note: 'x', visible_to_member: true, created_at: now }
      ];
      db.password_resets = [...db.password_resets, { id: 'pr_t1', user_id: id, token_hash: 'h', expires_at: now, created_at: now }];
      db.payments = [
        ...db.payments,
        {
          id: 'pay_t1', invoice_number: 'PF-2026-999999', user_id: id, user_name: 'Aarav Sharma', user_email: personas.member,
          order_id: 'order_t1', razorpay_payment_id: 'pay_rzp', tier: 'pro', plan_name: 'Zumba & Cardio Pass', billing_cycle: 'monthly',
          amount_inr: 1999, currency: 'INR', status: 'paid', period_start: '2026-10-01', period_end: '2026-10-31', created_at: now, source: 'seed'
        }
      ];
      db.time_sessions = [
        ...db.time_sessions,
        { id: 'ts_t1', user_id: id, user_name: 'Aarav Sharma', user_email: personas.member, user_tier: 'pro', category: 'Zumba & Cardio', clock_in_time: now, clock_out_time: null, duration_minutes: 0, status: 'active' }
      ];
      expect(db.attendance_logs.some(l => l.user_id === id)).toBe(true);
      expect(db.workouts.some(w => w.user_id === id)).toBe(true);
      const workoutIds = new Set(db.workouts.filter(w => w.user_id === id).map(w => w.id));
      const memberHeader = authHeader(personas.member);

      const res = await api().delete(`/api/members/${id}`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true });

      expect(db.users.some(u => u.id === id)).toBe(false);
      expect(db.bookings.some(b => b.user_id === id)).toBe(false);
      expect(db.workouts.some(w => w.user_id === id)).toBe(false);
      expect(db.workout_sets.some(s => s.workout_id && workoutIds.has(s.workout_id))).toBe(false);
      expect(db.attendance_logs.some(l => l.user_id === id)).toBe(false);
      expect(db.time_sessions.some(s => s.user_id === id)).toBe(false);
      expect(db.trainer_notes.some(n => n.member_id === id)).toBe(false);
      expect(db.password_resets.some(r => r.user_id === id)).toBe(false);
      expect(db.payments.some(p => p.id === 'pay_t1')).toBe(true);

      // Their old token no longer works.
      expect((await api().get('/api/auth/me').set(memberHeader)).status).toBe(401);
    });

    it('unlinks a deleted trainer account from its trainer profile', async () => {
      const id = userByEmail(personas.trainer).id;
      const res = await api().delete(`/api/members/${id}`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(db.trainers.some(t => t.user_id === id)).toBe(false);
    });

    it('stops an admin deleting themselves', async () => {
      const id = userByEmail(personas.admin).id;
      const res = await api().delete(`/api/members/${id}`).set(authHeader(personas.admin));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CANNOT_DELETE_SELF');
      expect(db.users.some(u => u.id === id)).toBe(true);
    });

    it('lets an admin delete another admin while one remains', async () => {
      const trainerId = userByEmail(personas.trainer).id;
      await api().put(`/api/members/${trainerId}`).set(authHeader(personas.admin)).send({ role: 'admin' });
      const res = await api().delete(`/api/members/${trainerId}`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(db.users.filter(u => u.role === 'admin')).toHaveLength(1);
    });

    it('404s for an unknown id and is admin only', async () => {
      expect((await api().delete('/api/members/usr_nope').set(authHeader(personas.admin))).status).toBe(404);
      const id = userByEmail(personas.vip).id;
      expect((await api().delete(`/api/members/${id}`).set(authHeader(personas.member))).status).toBe(403);
      expect(db.users.some(u => u.id === id)).toBe(true);
    });
  });

  describe('POST /members/:id/reset-password', () => {
    it('sets a new temp password and revokes old tokens', async () => {
      const id = userByEmail(personas.vip).id;
      const oldHeader = authHeader(personas.vip);
      expect((await api().get('/api/auth/me').set(oldHeader)).status).toBe(200);

      const res = await api().post(`/api/members/${id}/reset-password`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      const { tempPassword } = res.body.data;
      expect(typeof tempPassword).toBe('string');
      expect(tempPassword.length).toBeGreaterThanOrEqual(10);

      expect((await api().get('/api/auth/me').set(oldHeader)).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: personas.vip, password: 'pulse123' })).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: personas.vip, password: tempPassword })).status).toBe(200);
    });

    it('is admin only and 404s for an unknown id', async () => {
      const id = userByEmail(personas.vip).id;
      expect((await api().post(`/api/members/${id}/reset-password`)).status).toBe(401);
      expect((await api().post(`/api/members/${id}/reset-password`).set(authHeader(personas.trainer))).status).toBe(403);
      expect((await api().post('/api/members/usr_nope/reset-password').set(authHeader(personas.admin))).status).toBe(404);
    });
  });
});
