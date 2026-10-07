import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb } from './helpers.js';
import { addDays, dayOfWeek, gymDateTime } from '../src/lib/dates.js';
import { isMembershipActive, tierAllowsCategory } from '../src/lib/membership.js';

// Wednesday 7 October 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00Z');

const newTrainer = {
  name: 'Neha Iyer',
  email: 'neha@pulsefit.com',
  phone: '+91 98000 11122',
  specialties: ['Mobility'],
  bio: 'Mobility and recovery coach.',
  experience_years: 4
};

function addTrainerUser(id: string, email: string) {
  const base = db.users.find(u => u.id === 'usr_trainer_1')!;
  db.users = [...db.users, { ...base, id, email, name: 'Coach Two', qr_code_token: `QR-${id}` }];
}

describe('classes: trainers and trainer portal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('GET /trainers', () => {
    it('lists trainers with their real class counts', async () => {
      const res = await api().get('/api/trainers');
      expect(res.status).toBe(200);
      const counts = Object.fromEntries(res.body.data.map((t: any) => [t.id, t.classes_count]));
      expect(counts).toEqual({ trn_vikram: 4, trn_kavya: 3, trn_rohan: 2, trn_simran: 3 });
    });

    it('keeps staff contact details and the account link from everyone but admins (review regression)', async () => {
      for (const headers of [{}, authHeader(personas.member), authHeader(personas.trainer)]) {
        const res = await api().get('/api/trainers').set(headers);
        expect(res.status).toBe(200);
        for (const t of res.body.data) {
          expect(t).not.toHaveProperty('email');
          expect(t).not.toHaveProperty('phone');
          expect(t).not.toHaveProperty('user_id');
          expect(t).toHaveProperty('name');
        }
      }
      const admin = await api().get('/api/trainers').set(authHeader(personas.admin));
      expect(admin.body.data.find((t: any) => t.id === 'trn_vikram')).toMatchObject({
        email: expect.any(String),
        phone: expect.any(String),
        user_id: 'usr_trainer_1'
      });
    });

    it('reports 0 for a trainer without classes', async () => {
      await api().post('/api/trainers').set(authHeader(personas.admin)).send(newTrainer);
      const res = await api().get('/api/trainers');
      expect(res.body.data.find((t: any) => t.name === 'Neha Iyer').classes_count).toBe(0);
    });
  });

  describe('GET /trainers/:id', () => {
    it('returns the trainer with upcoming class occurrences', async () => {
      const res = await api().get('/api/trainers/trn_vikram');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Coach Vikram Rathore');
      expect(res.body.data.classes.map((c: any) => c.id)).toEqual(['cls_str_wed', 'cls_str_fri', 'cls_str_sat', 'cls_str_mon']);
      expect(res.body.data.classes[0]).toMatchObject({ occurrence_date: '2026-10-07', booked_count: 2 });
    });

    it('shows contact details and the account link only to admins (review regression)', async () => {
      const anon = await api().get('/api/trainers/trn_vikram');
      for (const key of ['email', 'phone', 'user_id']) expect(anon.body.data).not.toHaveProperty(key);
      const member = await api().get('/api/trainers/trn_vikram').set(authHeader(personas.member));
      expect(member.body.data).not.toHaveProperty('email');
      const admin = await api().get('/api/trainers/trn_vikram').set(authHeader(personas.admin));
      expect(admin.body.data).toMatchObject({ email: expect.any(String), user_id: 'usr_trainer_1' });
    });

    it('404s for an unknown trainer', async () => {
      expect((await api().get('/api/trainers/trn_nope')).status).toBe(404);
    });
  });

  describe('POST /trainers', () => {
    it('creates a trainer for an admin', async () => {
      const res = await api().post('/api/trainers').set(authHeader(personas.admin)).send(newTrainer);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ ...newTrainer, rating: 0, reviews_count: 0 });
      expect(res.body.data.id).toMatch(/^trn_/);
      expect(res.body.data.avatar_url).toMatch(/^https:/);
    });

    it('validates the fields', async () => {
      for (const patch of [{ name: 'N' }, { email: 'not-an-email' }, { bio: '' }, { experience_years: -1 }, { rating: 6 }, { specialties: 'Mobility' }, { avatar_url: 'javascript:x' }, { id: 'trn_x' }]) {
        const res = await api().post('/api/trainers').set(authHeader(personas.admin)).send({ ...newTrainer, ...patch });
        expect(res.status).toBe(400);
      }
    });

    it('refuses a duplicate email and links only trainer accounts', async () => {
      const dup = await api().post('/api/trainers').set(authHeader(personas.admin)).send({ ...newTrainer, email: 'VIKRAM@pulsefit.com' });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('EMAIL_TAKEN');
      const member = await api().post('/api/trainers').set(authHeader(personas.admin)).send({ ...newTrainer, user_id: 'usr_member_1' });
      expect(member.body.code).toBe('USER_NOT_TRAINER');
      const taken = await api().post('/api/trainers').set(authHeader(personas.admin)).send({ ...newTrainer, user_id: 'usr_trainer_1' });
      expect(taken.body.code).toBe('USER_ALREADY_LINKED');
    });

    it('requires an admin', async () => {
      expect((await api().post('/api/trainers').send(newTrainer)).status).toBe(401);
      expect((await api().post('/api/trainers').set(authHeader(personas.trainer)).send(newTrainer)).status).toBe(403);
    });
  });

  describe('PUT /trainers/:id', () => {
    it('updates the trainer and the names shown on their classes', async () => {
      const res = await api().put('/api/trainers/trn_kavya').set(authHeader(personas.admin)).send({ name: 'Kavya Sen Rao', experience_years: 8 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: 'trn_kavya', name: 'Kavya Sen Rao', experience_years: 8 });
      expect(db.classes.filter(c => c.trainer_id === 'trn_kavya').every(c => c.trainer_name === 'Kavya Sen Rao')).toBe(true);
      const cls = await api().get('/api/classes/cls_zumba_mon');
      expect(cls.body.data.trainer_name).toBe('Kavya Sen Rao');
    });

    it('rejects unknown keys and bad values, and 404s for an unknown trainer', async () => {
      expect((await api().put('/api/trainers/trn_kavya').set(authHeader(personas.admin)).send({ id: 'trn_x' })).status).toBe(400);
      expect((await api().put('/api/trainers/trn_kavya').set(authHeader(personas.admin)).send({ email: 'x' })).status).toBe(400);
      expect((await api().put('/api/trainers/trn_nope').set(authHeader(personas.admin)).send({ name: 'Somebody' })).status).toBe(404);
    });

    it('can unlink the trainer account with user_id null', async () => {
      const res = await api().put('/api/trainers/trn_vikram').set(authHeader(personas.admin)).send({ user_id: null });
      expect(res.status).toBe(200);
      expect(res.body.data.user_id).toBeUndefined();
    });
  });

  describe('DELETE /trainers/:id', () => {
    it('refuses while the trainer still has classes (audit regression)', async () => {
      const res = await api().delete('/api/trainers/trn_rohan').set(authHeader(personas.admin));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TRAINER_HAS_CLASSES');
      expect(res.body.data.classes).toEqual([
        { id: 'cls_str_tue', title: 'Functional Full-Body Strength' },
        { id: 'cls_str_thu', title: 'Lower Body & Squat Mechanics' }
      ]);
      expect(db.trainers.some(t => t.id === 'trn_rohan')).toBe(true);
    });

    it('reassigns the classes when asked', async () => {
      const res = await api().delete('/api/trainers/trn_rohan?reassign_to=trn_vikram').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true, reassigned_classes: 2 });
      expect(db.trainers.some(t => t.id === 'trn_rohan')).toBe(false);
      const cls = await api().get('/api/classes/cls_str_tue');
      expect(cls.body.data.trainer_id).toBe('trn_vikram');
      expect(cls.body.data.trainer.id).toBe('trn_vikram');
      expect(cls.body.data.trainer_name).toBe('Coach Vikram Rathore');
    });

    it('rejects an unknown or identical replacement', async () => {
      expect((await api().delete('/api/trainers/trn_rohan?reassign_to=trn_ghost').set(authHeader(personas.admin))).body.code).toBe('TRAINER_NOT_FOUND');
      expect((await api().delete('/api/trainers/trn_rohan?reassign_to=trn_rohan').set(authHeader(personas.admin))).body.code).toBe('TRAINER_NOT_FOUND');
    });

    it('deletes a trainer without classes', async () => {
      const created = await api().post('/api/trainers').set(authHeader(personas.admin)).send(newTrainer);
      const res = await api().delete(`/api/trainers/${created.body.data.id}`).set(authHeader(personas.admin));
      expect(res.body.data).toEqual({ deleted: true, reassigned_classes: 0 });
      expect((await api().delete('/api/trainers/trn_nope').set(authHeader(personas.admin))).status).toBe(404);
      expect((await api().delete('/api/trainers/trn_kavya').set(authHeader(personas.member))).status).toBe(403);
    });
  });

  describe('GET /trainer/me', () => {
    it('returns the linked trainer’s week ahead and stats', async () => {
      const res = await api().get('/api/trainer/me').set(authHeader(personas.trainer));
      expect(res.status).toBe(200);
      const { trainer, upcoming, stats } = res.body.data;
      expect(trainer.id).toBe('trn_vikram');
      expect(upcoming.map((o: any) => o.id)).toEqual(['cls_str_wed', 'cls_str_fri', 'cls_str_sat', 'cls_str_mon']);
      expect(upcoming.every((o: any) => Date.parse(o.starts_at) < NOW.getTime() + 7 * 86_400_000)).toBe(true);
      expect(stats.classes_per_week).toBe(4);
      expect(stats.booked_next_7_days).toBe(upcoming.reduce((s: number, o: any) => s + o.booked_count, 0));
      expect(stats.clients_count).toBe(2);

      const recent = db.bookings.filter(
        b => ['cls_str_mon', 'cls_str_wed', 'cls_str_fri', 'cls_str_sat'].includes(b.class_id) && b.booking_date >= '2026-09-07' && b.booking_date <= '2026-10-07'
      );
      const attended = recent.filter(b => b.status === 'attended').length;
      const missed = recent.filter(b => b.status === 'no_show').length;
      expect(stats.attendance_rate_30d).toBe(Math.round((attended / (attended + missed)) * 100));
    });

    it('reports a null attendance rate when nothing was marked', async () => {
      db.bookings = db.bookings.map(b => ({ ...b, status: b.status === 'cancelled' ? b.status : 'confirmed' }));
      const res = await api().get('/api/trainer/me').set(authHeader(personas.trainer));
      expect(res.body.data.stats.attendance_rate_30d).toBeNull();
    });

    it('answers NO_TRAINER_PROFILE for an unlinked trainer and an admin without trainer_id', async () => {
      db.trainers = db.trainers.map(({ user_id, ...t }) => t);
      const unlinked = await api().get('/api/trainer/me').set(authHeader(personas.trainer));
      expect(unlinked.status).toBe(404);
      expect(unlinked.body.code).toBe('NO_TRAINER_PROFILE');
      expect((await api().get('/api/trainer/me').set(authHeader(personas.admin))).body.code).toBe('NO_TRAINER_PROFILE');
    });

    it('lets an admin view any trainer and keeps members out', async () => {
      const res = await api().get('/api/trainer/me?trainer_id=trn_kavya').set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data.trainer.id).toBe('trn_kavya');
      expect((await api().get('/api/trainer/me').set(authHeader(personas.member))).status).toBe(403);
      expect((await api().get('/api/trainer/me')).status).toBe(401);
    });
  });

  describe('GET /trainer/clients', () => {
    it('lists the members who train with the trainer', async () => {
      const res = await api().get('/api/trainer/clients').set(authHeader(personas.trainer));
      expect(res.status).toBe(200);
      expect(res.body.data.map((c: any) => c.user_id)).toEqual(['usr_member_2', 'usr_member_3']);
      const rohan = res.body.data.find((c: any) => c.user_id === 'usr_member_3');
      const vikramClasses = ['cls_str_mon', 'cls_str_wed', 'cls_str_fri', 'cls_str_sat'];
      const attended = db.bookings.filter(b => b.user_id === 'usr_member_3' && vikramClasses.includes(b.class_id) && b.status === 'attended');
      expect(rohan).toMatchObject({
        name: 'Rohan Mehra',
        membership_tier: 'basic',
        membership_status: 'active',
        sessions_attended: attended.length,
        last_attended: attended.map(b => b.booking_date).sort().pop(),
        notes_count: 3
      });
      expect(rohan.upcoming_bookings).toBe(
        db.bookings.filter(b => b.user_id === 'usr_member_3' && vikramClasses.includes(b.class_id) && b.status === 'confirmed').length
      );
    });

    it('lets an admin see every client and keeps members out', async () => {
      const res = await api().get('/api/trainer/clients').set(authHeader(personas.admin));
      expect(res.body.data.map((c: any) => c.user_id).sort()).toEqual(['usr_member_1', 'usr_member_2', 'usr_member_3', 'usr_member_4']);
      expect((await api().get('/api/trainer/clients').set(authHeader(personas.member))).status).toBe(403);
    });
  });

  describe('trainer notes', () => {
    // Ananya books Coach Vikram's strength classes, so she is one of his clients.
    const note = { member_id: 'usr_member_2', category: 'assessment', note: 'Good cardio base.', visible_to_member: true };

    function linkTrainerUser(trainerId: string, userId: string) {
      db.trainers = db.trainers.map(t => (t.id === trainerId ? { ...t, user_id: userId } : t));
    }

    it('lists the trainer’s own notes, newest first, optionally for one member', async () => {
      const res = await api().get('/api/trainer/notes').set(authHeader(personas.trainer));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      const created = res.body.data.map((n: any) => n.created_at);
      expect([...created].sort().reverse()).toEqual(created);
      const rohan = await api().get('/api/trainer/notes?member_id=usr_member_3').set(authHeader(personas.trainer));
      expect(rohan.body.data).toHaveLength(3);
    });

    it('creates a note', async () => {
      const res = await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send(note);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ ...note, trainer_user_id: 'usr_trainer_1', trainer_name: 'Coach Vikram Rathore' });
      expect(db.trainer_notes.some(n => n.id === res.body.data.id)).toBe(true);
    });

    it('validates the note and the member', async () => {
      for (const patch of [{ category: 'diet' }, { note: '' }, { note: 'x'.repeat(2001) }, { visible_to_member: 'yes' }, { trainer_user_id: 'usr_admin_1' }]) {
        expect((await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, ...patch })).status).toBe(400);
      }
      expect((await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, member_id: 'usr_nope' })).status).toBe(404);
      expect((await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, member_id: 'usr_admin_1' })).status).toBe(404);
      expect((await api().post('/api/trainer/notes').set(authHeader(personas.member)).send(note)).status).toBe(403);
    });

    it('shows another trainer’s notes only to admins', async () => {
      addTrainerUser('usr_trainer_2', 'coach2@pulsefit.com');
      linkTrainerUser('trn_kavya', 'usr_trainer_2'); // Aarav books Kavya's Zumba classes
      const res = await api().get('/api/trainer/notes').set(authHeader('coach2@pulsefit.com'));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      const created = await api().post('/api/trainer/notes').set(authHeader('coach2@pulsefit.com')).send({ ...note, member_id: 'usr_member_1' });
      expect(created.status).toBe(201);
      expect(created.body.data.trainer_name).toBe(db.trainers.find(t => t.id === 'trn_kavya')!.name);
      const own = await api().get('/api/trainer/notes').set(authHeader(personas.trainer));
      expect(own.body.data).toHaveLength(5);
      expect(own.body.data.every((n: any) => n.trainer_user_id === 'usr_trainer_1')).toBe(true);
      const all = await api().get('/api/trainer/notes').set(authHeader(personas.admin));
      expect(all.body.data).toHaveLength(6);
      const vikram = await api().get('/api/trainer/notes?trainer_id=trn_vikram').set(authHeader(personas.admin));
      expect(vikram.body.data).toHaveLength(5);
      const kavya = await api().get('/api/trainer/notes?trainer_id=trn_kavya').set(authHeader(personas.admin));
      expect(kavya.body.data.map((n: any) => n.id)).toEqual([created.body.data.id]);
    });

    it('requires a linked trainer profile to list or write notes (review regression)', async () => {
      addTrainerUser('usr_trainer_2', 'coach2@pulsefit.com');
      const list = await api().get('/api/trainer/notes').set(authHeader('coach2@pulsefit.com'));
      expect(list.status).toBe(404);
      expect(list.body.code).toBe('NO_TRAINER_PROFILE');
      const create = await api().post('/api/trainer/notes').set(authHeader('coach2@pulsefit.com')).send(note);
      expect(create.status).toBe(404);
      expect(create.body.code).toBe('NO_TRAINER_PROFILE');
      expect(db.trainer_notes).toHaveLength(5);
    });

    it('refuses notes about members who do not book the trainer’s classes (review regression)', async () => {
      // Aarav (pro) only books Zumba classes, none of them Coach Vikram's.
      const res = await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, member_id: 'usr_member_1' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_YOUR_CLIENT');

      // A cancelled booking does not make someone a client either.
      db.bookings = [...db.bookings, {
        id: 'bk_cancelled', class_id: 'cls_str_wed', user_id: 'usr_member_1', booking_date: '2026-10-14',
        status: 'cancelled', created_at: NOW.toISOString(), cancelled_at: NOW.toISOString()
      }];
      expect((await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, member_id: 'usr_member_1' })).status).toBe(403);

      const clients = await api().get('/api/trainer/clients').set(authHeader(personas.trainer));
      expect(clients.body.data.map((c: any) => c.user_id)).not.toContain('usr_member_1');

      // Admins are not limited to one trainer's clients.
      expect((await api().post('/api/trainer/notes').set(authHeader(personas.admin)).send({ ...note, member_id: 'usr_member_1' })).status).toBe(201);
    });

    it('lets only the author or an admin delete a note', async () => {
      addTrainerUser('usr_trainer_2', 'coach2@pulsefit.com');
      const other = await api().delete('/api/trainer/notes/note_seed_1').set(authHeader('coach2@pulsefit.com'));
      expect(other.status).toBe(403);
      const own = await api().delete('/api/trainer/notes/note_seed_1').set(authHeader(personas.trainer));
      expect(own.status).toBe(200);
      expect(own.body.data).toEqual({ deleted: true });
      expect((await api().delete('/api/trainer/notes/note_seed_2').set(authHeader(personas.admin))).status).toBe(200);
      expect((await api().delete('/api/trainer/notes/note_seed_2').set(authHeader(personas.admin))).status).toBe(404);
      expect(db.trainer_notes).toHaveLength(3);
    });

    it('shows members only the notes about them that are marked visible', async () => {
      const res = await api().get('/api/notes/my').set(authHeader(personas.basic));
      expect(res.status).toBe(200);
      expect(res.body.data.map((n: any) => n.id).sort()).toEqual(['note_seed_1', 'note_seed_2']);
      expect((await api().get('/api/notes/my').set(authHeader(personas.member))).body.data).toEqual([]);
      expect((await api().get('/api/notes/my')).status).toBe(401);
    });
  });

  describe('seed data', () => {
    it('stores no class counter', () => {
      expect(db.classes.every(c => c.booked_count === undefined)).toBe(true);
    });

    it('seeds bookings consistent with entitlements, weekdays and capacity', () => {
      const today = '2026-10-07';
      expect(db.bookings.length).toBeGreaterThan(30);
      for (const b of db.bookings) {
        const cls = db.classes.find(c => c.id === b.class_id)!;
        const user = db.users.find(u => u.id === b.user_id)!;
        expect(cls).toBeTruthy();
        expect(user.role).toBe('member');
        expect(tierAllowsCategory(user.membership_tier, cls.category)).toBe(true);
        expect(dayOfWeek(b.booking_date)).toBe(cls.day_of_week);
        expect(b.booking_date >= addDays(today, -21) && b.booking_date <= addDays(today, 7)).toBe(true);
        const started = gymDateTime(b.booking_date, cls.start_time).getTime() <= NOW.getTime();
        expect(started ? ['attended', 'no_show'] : ['confirmed']).toContain(b.status);
        expect(Date.parse(b.created_at)).toBeLessThanOrEqual(NOW.getTime());
      }
      const perOccurrence = new Map<string, number>();
      for (const b of db.bookings) perOccurrence.set(`${b.class_id}|${b.booking_date}`, (perOccurrence.get(`${b.class_id}|${b.booking_date}`) ?? 0) + 1);
      for (const [key, count] of perOccurrence) {
        expect(count).toBeLessThanOrEqual(db.classes.find(c => c.id === key.split('|')[0])!.capacity);
      }
      for (const id of ['usr_member_1', 'usr_member_2', 'usr_member_3', 'usr_member_4']) {
        expect(db.bookings.some(b => b.user_id === id && b.status === 'confirmed')).toBe(true);
        expect(db.bookings.some(b => b.user_id === id && b.status === 'attended')).toBe(true);
      }
      expect(db.bookings.some(b => b.status === 'no_show')).toBe(true);
    });

    it('books no date the member’s plan does not cover, even after a plan has run out (review regression)', () => {
      // Seed on two different days; every seeded booking must fall inside its member's paid period.
      for (const now of ['2026-11-16T04:30:00Z', '2026-11-27T04:30:00Z']) {
        vi.setSystemTime(new Date(now));
        resetDb();
        for (const b of db.bookings) {
          const user = db.users.find(u => u.id === b.user_id)!;
          const cls = db.classes.find(c => c.id === b.class_id)!;
          expect(isMembershipActive(user, b.booking_date)).toBe(true);
          expect(tierAllowsCategory(user.membership_tier, cls.category)).toBe(true);
        }
        for (const b of db.bookings) {
          const user = db.users.find(u => u.id === b.user_id)!;
          expect(b.booking_date <= (user.membership_expiry ?? '')).toBe(true);
        }
      }
    });

    it('seeds Coach Vikram’s notes, some visible to the member', () => {
      expect(db.trainer_notes.every(n => n.trainer_user_id === 'usr_trainer_1')).toBe(true);
      expect(db.trainer_notes.some(n => n.visible_to_member)).toBe(true);
      expect(db.trainer_notes.some(n => !n.visible_to_member)).toBe(true);
    });
  });
});
