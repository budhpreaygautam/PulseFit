import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb } from './helpers.js';

// Wednesday 7 October 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00Z');

function setCapacity(classId: string, capacity: number) {
  db.classes = db.classes.map(c => (c.id === classId ? { ...c, capacity } : c));
}

describe('classes: timetable and class admin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('GET /classes', () => {
    it('lists every class at its next occurrence that has not started, sorted by start', async () => {
      const res = await api().get('/api/classes');
      expect(res.status).toBe(200);
      const list = res.body.data;
      expect(list).toHaveLength(12);
      const starts = list.map((o: any) => o.starts_at);
      expect([...starts].sort()).toEqual(starts);
      for (const o of list) {
        expect(Date.parse(o.starts_at)).toBeGreaterThan(NOW.getTime());
        expect(o).toHaveProperty('occurrence_date');
        expect(o.spots_left).toBe(o.capacity - o.booked_count);
        expect(o.is_full).toBe(o.booked_count >= o.capacity);
        expect(o.my_booking_id).toBeNull();
      }
      // Wednesday's 07:30 class already ran today, so it rolls to next week; 18:30 is still today.
      expect(list.find((o: any) => o.id === 'cls_zumba_wed').occurrence_date).toBe('2026-10-14');
      expect(list.find((o: any) => o.id === 'cls_str_wed').occurrence_date).toBe('2026-10-07');
      expect(list[0].id).toBe('cls_str_wed');
    });

    it('counts capacity per occurrence from bookings and ignores any stored counter (audit regression)', async () => {
      db.classes = db.classes.map(c => (c.id === 'cls_str_wed' ? { ...c, booked_count: 999 } : c));
      const res = await api().get('/api/classes');
      const strWed = res.body.data.find((o: any) => o.id === 'cls_str_wed');
      const expected = db.bookings.filter(
        b => b.class_id === 'cls_str_wed' && b.booking_date === '2026-10-07' && (b.status === 'confirmed' || b.status === 'attended')
      ).length;
      expect(expected).toBeGreaterThan(0);
      expect(strWed.booked_count).toBe(expected);
    });

    it('marks the classes the signed-in member booked', async () => {
      const res = await api().get('/api/classes').set(authHeader(personas.member));
      const zumbaFri = res.body.data.find((o: any) => o.id === 'cls_zumba_fri');
      const booking = db.bookings.find(b => b.class_id === 'cls_zumba_fri' && b.user_id === 'usr_member_1' && b.booking_date === '2026-10-09');
      expect(zumbaFri.my_booking_id).toBe(booking!.id);
      expect(res.body.data.find((o: any) => o.id === 'cls_str_fri').my_booking_id).toBeNull();
    });

    it('filters by day, category, trainer, intensity and search (including the trainer name)', async () => {
      expect((await api().get('/api/classes?day=4')).body.data.map((o: any) => o.id).sort()).toEqual(['cls_str_thu', 'cls_zumba_thu']);
      const zumba = (await api().get('/api/classes').query({ category: 'Zumba & Cardio' })).body.data;
      expect(zumba).toHaveLength(6);
      expect(zumba.every((o: any) => o.category === 'Zumba & Cardio')).toBe(true);
      expect((await api().get('/api/classes?category=All')).body.data).toHaveLength(12);
      expect((await api().get('/api/classes?trainerId=trn_vikram')).body.data).toHaveLength(4);
      expect((await api().get('/api/classes?intensity=extreme')).body.data.every((o: any) => o.intensity === 'Extreme')).toBe(true);
      expect((await api().get('/api/classes?search=vikram')).body.data).toHaveLength(4);
      expect((await api().get('/api/classes?day=')).body.data).toHaveLength(12);
    });

    it('returns the occurrences of a given week, including ones that already happened', async () => {
      const res = await api().get('/api/classes?week_start=2026-10-05');
      expect(res.status).toBe(200);
      const dates = res.body.data.map((o: any) => o.occurrence_date);
      expect(dates.every((d: string) => d >= '2026-10-05' && d <= '2026-10-11')).toBe(true);
      expect(res.body.data.find((o: any) => o.id === 'cls_zumba_mon').occurrence_date).toBe('2026-10-05');
      const attended = db.bookings.filter(
        b => b.class_id === 'cls_zumba_mon' && b.booking_date === '2026-10-05' && b.status === 'attended'
      ).length;
      expect(res.body.data.find((o: any) => o.id === 'cls_zumba_mon').booked_count).toBe(attended);
    });

    it('rejects a week_start that is not a Monday and a bad day', async () => {
      const res = await api().get('/api/classes?week_start=2026-10-07');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect((await api().get('/api/classes?week_start=2026-13-01')).status).toBe(400);
      expect((await api().get('/api/classes?day=7')).status).toBe(400);
    });

    it('always shows the current trainer name and avatar', async () => {
      db.trainers = db.trainers.map(t => (t.id === 'trn_kavya' ? { ...t, name: 'Kavya Sen-Rao', avatar_url: 'https://example.com/k.png' } : t));
      const res = await api().get('/api/classes');
      const zumbaMon = res.body.data.find((o: any) => o.id === 'cls_zumba_mon');
      expect(zumbaMon.trainer_name).toBe('Kavya Sen-Rao');
      expect(zumbaMon.trainer_avatar).toBe('https://example.com/k.png');
    });
  });

  describe('GET /classes/:id', () => {
    it('returns the next occurrence with the trainer', async () => {
      const res = await api().get('/api/classes/cls_str_mon');
      expect(res.status).toBe(200);
      expect(res.body.data.occurrence_date).toBe('2026-10-12');
      expect(res.body.data.trainer.id).toBe('trn_vikram');
    });

    it('returns a specific date and rejects one on the wrong weekday', async () => {
      const res = await api().get('/api/classes/cls_str_mon?date=2026-09-28');
      expect(res.status).toBe(200);
      expect(res.body.data.occurrence_date).toBe('2026-09-28');
      const bad = await api().get('/api/classes/cls_str_mon?date=2026-09-29');
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('DATE_MISMATCH');
    });

    it('shows the trainer’s contact details and account link only to admins (review regression)', async () => {
      const anon = await api().get('/api/classes/cls_str_mon');
      expect(anon.body.data.trainer).toMatchObject({ id: 'trn_vikram', name: 'Coach Vikram Rathore' });
      for (const key of ['email', 'phone', 'user_id']) expect(anon.body.data.trainer).not.toHaveProperty(key);
      const member = await api().get('/api/classes/cls_str_mon').set(authHeader(personas.member));
      expect(member.body.data.trainer).not.toHaveProperty('email');
      const admin = await api().get('/api/classes/cls_str_mon').set(authHeader(personas.admin));
      expect(admin.body.data.trainer).toMatchObject({ email: expect.any(String), phone: expect.any(String), user_id: 'usr_trainer_1' });
    });

    it('still opens a past session on the class’s old weekday (review regression)', async () => {
      await api().put('/api/classes/cls_str_wed').set(authHeader(personas.admin)).send({ day_of_week: 4 });
      const res = await api().get('/api/classes/cls_str_wed?date=2026-09-30');
      expect(res.status).toBe(200);
      expect(res.body.data.occurrence_date).toBe('2026-09-30');
      // A Wednesday with no bookings is not a session of this class any more.
      expect((await api().get('/api/classes/cls_str_wed?date=2026-10-21')).body.code).toBe('DATE_MISMATCH');
    });

    it('404s for an unknown class', async () => {
      const res = await api().get('/api/classes/cls_nope');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /classes', () => {
    const valid = {
      title: 'Lunchtime Kettlebells',
      category: 'Workout & Strength',
      trainer_id: 'trn_rohan',
      day_of_week: 2,
      start_time: '13:00',
      duration_minutes: 40,
      room: 'Strength Arena',
      capacity: 12,
      intensity: 'Medium',
      description: 'Swings, cleans and presses.',
      image_url: 'https://images.example.com/kb.jpg',
      calories_burn_est: 400
    };

    it('creates a class for an admin', async () => {
      const res = await api().post('/api/classes').set(authHeader(personas.admin)).send(valid);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ ...valid, trainer_name: 'Karan Joshi' });
      expect(res.body.data.id).toMatch(/^cls_/);
      expect(res.body.data.booked_count).toBeUndefined();
      expect(db.classes.some(c => c.id === res.body.data.id)).toBe(true);
    });

    it('rejects an unknown trainer (audit regression: no "Pulse Coach" fallback)', async () => {
      const res = await api().post('/api/classes').set(authHeader(personas.admin)).send({ ...valid, trainer_id: 'trn_ghost' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TRAINER_NOT_FOUND');
    });

    it.each([
      ['capacity 0', { capacity: 0 }],
      ['capacity 201', { capacity: 201 }],
      ['negative capacity', { capacity: -5 }],
      ['weekday 7', { day_of_week: 7 }],
      ['bad time', { start_time: '25:00' }],
      ['short duration', { duration_minutes: 10 }],
      ['long duration', { duration_minutes: 181 }],
      ['unknown category', { category: 'Yoga' }],
      ['unknown intensity', { intensity: 'Insane' }],
      ['javascript url', { image_url: 'javascript:alert(1)' }],
      ['unknown key', { booked_count: 3 }]
    ])('rejects %s', async (_label, patch) => {
      const res = await api().post('/api/classes').set(authHeader(personas.admin)).send({ ...valid, ...patch });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('requires an admin', async () => {
      expect((await api().post('/api/classes').send(valid)).status).toBe(401);
      expect((await api().post('/api/classes').set(authHeader(personas.member)).send(valid)).status).toBe(403);
      expect((await api().post('/api/classes').set(authHeader(personas.trainer)).send(valid)).status).toBe(403);
    });
  });

  describe('PUT /classes/:id', () => {
    it('updates a subset of fields and refreshes the trainer', async () => {
      const res = await api().put('/api/classes/cls_str_tue').set(authHeader(personas.admin)).send({ title: 'Full-Body Strength', trainer_id: 'trn_vikram' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: 'cls_str_tue', title: 'Full-Body Strength', trainer_id: 'trn_vikram', trainer_name: 'Coach Vikram Rathore' });
      expect(db.classes.find(c => c.id === 'cls_str_tue')!.trainer_name).toBe('Coach Vikram Rathore');
    });

    it('keeps the id immutable (audit regression)', async () => {
      const res = await api().put('/api/classes/cls_str_tue').set(authHeader(personas.admin)).send({ id: 'cls_hijack' });
      expect(res.status).toBe(400);
      expect(db.classes.some(c => c.id === 'cls_str_tue')).toBe(true);
    });

    it('validates fields and the trainer', async () => {
      expect((await api().put('/api/classes/cls_str_tue').set(authHeader(personas.admin)).send({ capacity: 0 })).status).toBe(400);
      const res = await api().put('/api/classes/cls_str_tue').set(authHeader(personas.admin)).send({ trainer_id: 'trn_ghost' });
      expect(res.body.code).toBe('TRAINER_NOT_FOUND');
      expect((await api().put('/api/classes/cls_nope').set(authHeader(personas.admin)).send({ title: 'Something' })).status).toBe(404);
    });

    it('refuses to drop capacity below an upcoming session’s bookings (audit regression)', async () => {
      // cls_str_wed tonight has Rohan and Ananya booked.
      const res = await api().put('/api/classes/cls_str_wed').set(authHeader(personas.admin)).send({ capacity: 1 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CAPACITY_BELOW_BOOKINGS');
      expect(res.body.data.max_booked).toBe(2);
      expect((await api().put('/api/classes/cls_str_wed').set(authHeader(personas.admin)).send({ capacity: 2 })).status).toBe(200);
    });

    it('cancels upcoming bookings when the class moves to another weekday', async () => {
      const res = await api().put('/api/classes/cls_str_wed').set(authHeader(personas.admin)).send({ day_of_week: 4 });
      expect(res.status).toBe(200);
      const future = db.bookings.filter(b => b.class_id === 'cls_str_wed' && b.booking_date >= '2026-10-07');
      expect(future.length).toBeGreaterThan(0);
      expect(future.every(b => b.status === 'cancelled' && b.cancelled_at)).toBe(true);
      expect(db.bookings.some(b => b.class_id === 'cls_str_wed' && b.booking_date < '2026-10-07' && b.status === 'attended')).toBe(true);
    });

    it('requires an admin', async () => {
      expect((await api().put('/api/classes/cls_str_tue').set(authHeader(personas.trainer)).send({ title: 'Mine now' })).status).toBe(403);
    });
  });

  describe('DELETE /classes/:id', () => {
    it('cancels future confirmed bookings and keeps the history', async () => {
      const futureConfirmed = db.bookings.filter(b => b.class_id === 'cls_str_wed' && b.status === 'confirmed').length;
      const pastCount = db.bookings.filter(b => b.class_id === 'cls_str_wed' && b.status !== 'confirmed').length;
      expect(futureConfirmed).toBeGreaterThan(0);

      const res = await api().delete('/api/classes/cls_str_wed').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ cancelled_bookings: futureConfirmed });
      expect(db.classes.some(c => c.id === 'cls_str_wed')).toBe(false);
      const left = db.bookings.filter(b => b.class_id === 'cls_str_wed');
      expect(left.filter(b => b.status === 'cancelled')).toHaveLength(futureConfirmed);
      expect(left.filter(b => b.status !== 'cancelled')).toHaveLength(pastCount);
      expect((await api().get('/api/classes/cls_str_wed')).status).toBe(404);
    });

    it('still lists past bookings of a deleted class in the member’s history', async () => {
      await api().delete('/api/classes/cls_str_wed').set(authHeader(personas.admin));
      const res = await api().get('/api/bookings/my?scope=past').set(authHeader(personas.basic));
      const row = res.body.data.find((b: any) => b.class_id === 'cls_str_wed');
      expect(row.class_title).toBe('Upper Body Push & Pull Strength');
    });

    it('requires an admin and an existing class', async () => {
      expect((await api().delete('/api/classes/cls_str_wed').set(authHeader(personas.member))).status).toBe(403);
      expect((await api().delete('/api/classes/cls_nope').set(authHeader(personas.admin))).status).toBe(404);
    });
  });

  it('uses the computed capacity in is_full', async () => {
    setCapacity('cls_str_wed', 2);
    const res = await api().get('/api/classes/cls_str_wed');
    expect(res.body.data).toMatchObject({ booked_count: 2, spots_left: 0, is_full: true });
  });
});
