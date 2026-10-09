import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import { Booking } from '../src/types/index.js';
import { gymToday, nextOccurrence } from '../src/lib/dates.js';

// Wednesday 7 October 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00Z');
const THU = '2026-10-08';

function setCapacity(classId: string, capacity: number) {
  db.classes = db.classes.map(c => (c.id === classId ? { ...c, capacity } : c));
}

function book(persona: string, class_id: string, booking_date: string) {
  return api().post('/api/bookings').set(authHeader(persona)).send({ class_id, booking_date });
}

function seededBooking(userId: string, classId: string, date: string): Booking {
  const b = db.bookings.find(x => x.user_id === userId && x.class_id === classId && x.booking_date === date);
  if (!b) throw new Error(`No seeded booking ${userId} ${classId} ${date}`);
  return b;
}

describe('classes: bookings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('POST /bookings', () => {
    it('books a class the member’s plan includes', async () => {
      const res = await book(personas.member, 'cls_zumba_thu', THU);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        class_id: 'cls_zumba_thu',
        user_id: 'usr_member_1',
        booking_date: THU,
        status: 'confirmed',
        class_title: 'Core & Cardio Burn Session',
        trainer_name: 'Simran Kaur'
      });
      expect(db.bookings.some(b => b.id === res.body.data.id)).toBe(true);
    });

    it('allows staff no bookings (MEMBERS_ONLY)', async () => {
      for (const persona of [personas.admin, personas.trainer]) {
        const res = await book(persona, 'cls_zumba_thu', THU);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('MEMBERS_ONLY');
      }
    });

    it('requires a token', async () => {
      expect((await api().post('/api/bookings').send({ class_id: 'cls_zumba_thu', booking_date: THU })).status).toBe(401);
    });

    it('validates the body', async () => {
      for (const body of [{}, { class_id: 'cls_zumba_thu' }, { class_id: 'cls_zumba_thu', booking_date: '08-10-2026' }, { class_id: 'cls_zumba_thu', booking_date: '2026-02-30' }, { class_id: 'cls_zumba_thu', booking_date: THU, user_id: 'usr_member_2' }]) {
        const res = await api().post('/api/bookings').set(authHeader(personas.member)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('404s for an unknown class', async () => {
      const res = await book(personas.member, 'cls_nope', THU);
      expect(res.status).toBe(404);
    });

    it('rejects a date on the wrong weekday (audit regression)', async () => {
      const res = await book(personas.member, 'cls_zumba_thu', '2026-10-09');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DATE_MISMATCH');
    });

    it('rejects a class that already started today and past dates (audit regression)', async () => {
      const today = await book(personas.member, 'cls_zumba_wed', '2026-10-07');
      expect(today.status).toBe(400);
      expect(today.body.code).toBe('CLASS_STARTED');
      const past = await book(personas.member, 'cls_zumba_wed', '2026-09-30');
      expect(past.body.code).toBe('CLASS_STARTED');
    });

    it('accepts a class later today', async () => {
      db.bookings = db.bookings.filter(b => !(b.user_id === 'usr_member_3' && b.class_id === 'cls_str_wed' && b.booking_date === '2026-10-07'));
      expect((await book(personas.basic, 'cls_str_wed', '2026-10-07')).status).toBe(201);
    });

    it('allows booking up to 14 days ahead and no further', async () => {
      expect((await book(personas.basic, 'cls_str_wed', '2026-10-21')).status).toBe(201);
      const res = await book(personas.member, 'cls_zumba_thu', '2026-10-22');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TOO_FAR_AHEAD');
    });

    it('uses the effective membership status, including a lapsed expiry date (audit regression)', async () => {
      const expired = await book(personas.expired, 'cls_str_thu', THU);
      expect(expired.status).toBe(403);
      expect(expired.body).toMatchObject({ code: 'MEMBERSHIP_INACTIVE', data: { status: 'expired' } });

      // Stored as 'active' but the last day of access was yesterday.
      db.users = db.users.map(u => (u.id === 'usr_member_3' ? { ...u, membership_expiry: '2026-10-06' } : u));
      const lapsed = await book(personas.basic, 'cls_str_thu', THU);
      expect(lapsed.status).toBe(403);
      expect(lapsed.body).toMatchObject({ code: 'MEMBERSHIP_INACTIVE', data: { status: 'expired' } });

      db.users = db.users.map(u => (u.id === 'usr_member_3' ? { ...u, membership_expiry: '2026-11-20', membership_status: 'frozen' } : u));
      const frozen = await book(personas.basic, 'cls_str_thu', THU);
      expect(frozen.body).toMatchObject({ code: 'MEMBERSHIP_INACTIVE', data: { status: 'frozen' } });
    });

    it('enforces plan entitlements (audit regression)', async () => {
      const proStrength = await book(personas.member, 'cls_str_thu', THU);
      expect(proStrength.status).toBe(403);
      expect(proStrength.body.code).toBe('PLAN_EXCLUDES_CATEGORY');
      const basicZumba = await book(personas.basic, 'cls_zumba_thu', THU);
      expect(basicZumba.body.code).toBe('PLAN_EXCLUDES_CATEGORY');
      expect((await book(personas.vip, 'cls_zumba_thu', THU)).status).toBe(201);
      expect((await book(personas.vip, 'cls_str_thu', THU)).status).toBe(201);
    });

    it('counts capacity per occurrence, not across weeks (audit regression)', async () => {
      // Maya already holds a spot on Thursday; capacity 2 leaves one.
      setCapacity('cls_zumba_thu', 2);
      expect((await book(personas.vip, 'cls_zumba_thu', THU)).status).toBe(201);
      const full = await book(personas.member, 'cls_zumba_thu', THU);
      expect(full.status).toBe(409);
      expect(full.body.code).toBe('CLASS_FULL');
      // The following week is a different occurrence with its own spots.
      expect((await book(personas.member, 'cls_zumba_thu', '2026-10-15')).status).toBe(201);
    });

    it('ignores a stored booked_count', async () => {
      db.classes = db.classes.map(c => (c.id === 'cls_zumba_thu' ? { ...c, booked_count: 500 } : c));
      expect((await book(personas.member, 'cls_zumba_thu', THU)).status).toBe(201);
    });

    it('counts attended bookings towards capacity but frees cancelled ones', async () => {
      setCapacity('cls_zumba_thu', 2);
      db.bookings = db.bookings.map(b =>
        b.user_id === 'usr_member_4' && b.class_id === 'cls_zumba_thu' && b.booking_date === THU ? { ...b, status: 'attended' } : b
      );
      const first = await book(personas.vip, 'cls_zumba_thu', THU);
      expect((await book(personas.member, 'cls_zumba_thu', THU)).body.code).toBe('CLASS_FULL');
      await api().delete(`/api/bookings/${first.body.data.id}`).set(authHeader(personas.vip));
      expect((await book(personas.member, 'cls_zumba_thu', THU)).status).toBe(201);
    });

    it('refuses a duplicate but allows re-booking after cancelling', async () => {
      const first = await book(personas.member, 'cls_zumba_thu', THU);
      const dup = await book(personas.member, 'cls_zumba_thu', THU);
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('ALREADY_BOOKED');
      await api().delete(`/api/bookings/${first.body.data.id}`).set(authHeader(personas.member));
      const again = await book(personas.member, 'cls_zumba_thu', THU);
      expect(again.status).toBe(201);
      expect(again.body.data.id).not.toBe(first.body.data.id);
    });

    it('answers ALREADY_BOOKED, not CLASS_FULL, to a retry once the caller’s own booking filled the class (review regression)', async () => {
      // Maya holds one spot on Thursday; capacity 2 leaves exactly one, and Aarav takes it.
      setCapacity('cls_zumba_thu', 2);
      expect((await book(personas.member, 'cls_zumba_thu', THU)).status).toBe(201);
      for (let i = 0; i < 2; i++) {
        const retry = await book(personas.member, 'cls_zumba_thu', THU);
        expect(retry.status).toBe(409);
        expect(retry.body.code).toBe('ALREADY_BOOKED');
      }
      // Someone without a spot still hears that the class is full.
      expect((await book(personas.vip, 'cls_zumba_thu', THU)).body.code).toBe('CLASS_FULL');
      expect(db.bookings.filter(b => b.class_id === 'cls_zumba_thu' && b.booking_date === THU && b.status === 'confirmed')).toHaveLength(2);
    });
  });

  describe('GET /bookings/my', () => {
    it('returns only upcoming confirmed bookings by default, soonest first (audit regression)', async () => {
      const res = await api().get('/api/bookings/my').set(authHeader(personas.member));
      expect(res.status).toBe(200);
      const rows = res.body.data;
      expect(rows.map((b: any) => b.booking_date)).toEqual(['2026-10-09', '2026-10-12', '2026-10-14']);
      for (const b of rows) {
        expect(b.status).toBe('confirmed');
        expect(b.can_cancel).toBe(true);
        expect(Date.parse(b.starts_at)).toBeGreaterThan(NOW.getTime());
        expect(b).toMatchObject({ class_title: expect.any(String), category: 'Zumba & Cardio', room: expect.any(String), trainer_name: expect.any(String), image_url: expect.any(String), duration_minutes: expect.any(Number) });
      }
    });

    it('returns past sessions, newest first, as attended or no-show', async () => {
      const res = await api().get('/api/bookings/my?scope=past').set(authHeader(personas.member));
      const rows = res.body.data;
      expect(rows.length).toBeGreaterThanOrEqual(8);
      expect(rows.every((b: any) => ['attended', 'no_show'].includes(b.status) && !b.can_cancel)).toBe(true);
      expect(rows.every((b: any) => Date.parse(b.starts_at) <= NOW.getTime())).toBe(true);
      const starts = rows.map((b: any) => b.starts_at);
      expect([...starts].sort().reverse()).toEqual(starts);
    });

    it('includes cancelled bookings only in scope=all', async () => {
      const upcoming = (await api().get('/api/bookings/my').set(authHeader(personas.member))).body.data;
      await api().delete(`/api/bookings/${upcoming[0].id}`).set(authHeader(personas.member));
      const after = (await api().get('/api/bookings/my').set(authHeader(personas.member))).body.data;
      expect(after).toHaveLength(upcoming.length - 1);
      const past = (await api().get('/api/bookings/my?scope=past').set(authHeader(personas.member))).body.data;
      expect(past.some((b: any) => b.status === 'cancelled')).toBe(false);
      const all = (await api().get('/api/bookings/my?scope=all').set(authHeader(personas.member))).body.data;
      expect(all.find((b: any) => b.id === upcoming[0].id).status).toBe('cancelled');
    });

    it('validates the scope and requires a token', async () => {
      expect((await api().get('/api/bookings/my?scope=soon').set(authHeader(personas.member))).status).toBe(400);
      expect((await api().get('/api/bookings/my')).status).toBe(401);
    });

    it('never returns another member’s bookings', async () => {
      const rows = (await api().get('/api/bookings/my?scope=all').set(authHeader(personas.member))).body.data;
      expect(rows.every((b: any) => b.user_id === 'usr_member_1')).toBe(true);
    });
  });

  describe('DELETE /bookings/:id', () => {
    it('cancels instead of deleting (audit regression)', async () => {
      const booking = seededBooking('usr_member_1', 'cls_zumba_fri', '2026-10-09');
      const res = await api().delete(`/api/bookings/${booking.id}`).set(authHeader(personas.member));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: booking.id, status: 'cancelled' });
      expect(res.body.data.cancelled_at).toBe(NOW.toISOString());
      expect(db.bookings.find(b => b.id === booking.id)!.status).toBe('cancelled');
    });

    it('refuses to cancel twice', async () => {
      const booking = seededBooking('usr_member_1', 'cls_zumba_fri', '2026-10-09');
      await api().delete(`/api/bookings/${booking.id}`).set(authHeader(personas.member));
      const res = await api().delete(`/api/bookings/${booking.id}`).set(authHeader(personas.member));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_CANCELLED');
    });

    it('refuses to cancel a class that already started (audit regression)', async () => {
      const past = db.bookings.find(b => b.user_id === 'usr_member_1' && b.booking_date < '2026-10-07')!;
      const res = await api().delete(`/api/bookings/${past.id}`).set(authHeader(personas.member));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CLASS_STARTED');
    });

    it('lets only the owner or an admin cancel', async () => {
      const booking = seededBooking('usr_member_1', 'cls_zumba_fri', '2026-10-09');
      expect((await api().delete(`/api/bookings/${booking.id}`).set(authHeader(personas.vip))).status).toBe(403);
      expect((await api().delete(`/api/bookings/${booking.id}`).set(authHeader(personas.trainer))).status).toBe(403);
      expect((await api().delete(`/api/bookings/${booking.id}`)).status).toBe(401);
      expect((await api().delete(`/api/bookings/${booking.id}`).set(authHeader(personas.admin))).status).toBe(200);
      expect((await api().delete('/api/bookings/bk_nope').set(authHeader(personas.admin))).status).toBe(404);
    });
  });

  describe('PATCH /bookings/:id/attendance', () => {
    // Rohan is booked into Coach Vikram's Wednesday 18:30 class tonight.
    const tonight = () => seededBooking('usr_member_3', 'cls_str_wed', '2026-10-07');
    const mark = (persona: string, id: string, status: string) =>
      api().patch(`/api/bookings/${id}/attendance`).set(authHeader(persona)).send({ status });

    it('opens 15 minutes before the class starts', async () => {
      const early = await mark(personas.trainer, tonight().id, 'attended');
      expect(early.status).toBe(400);
      expect(early.body.code).toBe('CLASS_NOT_STARTED');

      vi.setSystemTime(new Date('2026-10-07T12:44:00Z')); // 18:14 IST
      expect((await mark(personas.trainer, tonight().id, 'attended')).body.code).toBe('CLASS_NOT_STARTED');

      vi.setSystemTime(new Date('2026-10-07T12:45:00Z')); // 18:15 IST
      const res = await mark(personas.trainer, tonight().id, 'attended');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: tonight().id, status: 'attended' });
    });

    it('counts an attended class towards the member’s streak for that day', async () => {
      vi.setSystemTime(new Date('2026-10-07T14:00:00Z'));
      db.users = db.users.map(u => (u.id === 'usr_member_3' ? { ...u, streak_days: 4, last_active_date: '2026-10-06' } : u));
      await mark(personas.trainer, tonight().id, 'attended');
      const rohan = userByEmail(personas.basic);
      expect(rohan.last_active_date).toBe('2026-10-07');
      expect(rohan.streak_days).toBe(5);
    });

    it('records no-shows and can put a booking back to confirmed', async () => {
      vi.setSystemTime(new Date('2026-10-07T14:00:00Z'));
      const before = userByEmail(personas.basic);
      expect((await mark(personas.trainer, tonight().id, 'no_show')).body.data.status).toBe('no_show');
      // A no-show is not activity: the streak is untouched.
      const after = userByEmail(personas.basic);
      expect([after.streak_days, after.last_active_date]).toEqual([before.streak_days, before.last_active_date]);
      expect((await mark(personas.admin, tonight().id, 'confirmed')).body.data.status).toBe('confirmed');
    });

    it('is limited to admins and the class’s own trainer', async () => {
      vi.setSystemTime(new Date('2026-10-07T14:00:00Z'));
      expect((await mark(personas.member, tonight().id, 'attended')).status).toBe(403);
      expect((await api().patch(`/api/bookings/${tonight().id}/attendance`).send({ status: 'attended' })).status).toBe(401);
      // Aarav's Wednesday morning Zumba is Kavya's class, not Vikram's.
      const other = seededBooking('usr_member_1', 'cls_zumba_wed', '2026-10-07');
      const res = await mark(personas.trainer, other.id, 'attended');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_YOUR_CLASS');
      expect((await mark(personas.admin, other.id, 'attended')).status).toBe(200);
    });

    it('validates the status and the booking', async () => {
      vi.setSystemTime(new Date('2026-10-07T14:00:00Z'));
      expect((await mark(personas.trainer, tonight().id, 'cancelled')).status).toBe(400);
      expect((await mark(personas.trainer, 'bk_nope', 'attended')).status).toBe(404);
    });

    it('refuses to mark a cancelled booking', async () => {
      await api().delete(`/api/bookings/${tonight().id}`).set(authHeader(personas.basic));
      vi.setSystemTime(new Date('2026-10-07T14:00:00Z'));
      const res = await mark(personas.trainer, tonight().id, 'attended');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_CANCELLED');
    });
  });

  describe('GET /bookings/class/:classId/roster', () => {
    it('lists the next occurrence’s attendees for the class’s trainer', async () => {
      const res = await api().get('/api/bookings/class/cls_str_wed/roster').set(authHeader(personas.trainer));
      expect(res.status).toBe(200);
      expect(res.body.data.date).toBe('2026-10-07');
      expect(res.body.data.class).toMatchObject({ id: 'cls_str_wed', occurrence_date: '2026-10-07', booked_count: 2 });
      const ids = res.body.data.attendees.map((a: any) => a.user_id).sort();
      expect(ids).toEqual(['usr_member_2', 'usr_member_3']);
      expect(res.body.data.attendees[0]).toEqual({
        booking_id: expect.any(String),
        user_id: expect.any(String),
        user_name: expect.any(String),
        user_email: expect.any(String),
        user_phone: expect.any(String),
        user_avatar: expect.any(String),
        user_tier: expect.any(String),
        status: 'confirmed',
        booked_at: expect.any(String)
      });
    });

    it('filters by date instead of mixing every week (audit regression)', async () => {
      const res = await api().get('/api/bookings/class/cls_str_wed/roster?date=2026-09-30').set(authHeader(personas.trainer));
      expect(res.status).toBe(200);
      expect(res.body.data.date).toBe('2026-09-30');
      expect(res.body.data.attendees).toHaveLength(2);
      expect(res.body.data.attendees.every((a: any) => ['attended', 'no_show'].includes(a.status))).toBe(true);
      const bad = await api().get('/api/bookings/class/cls_str_wed/roster?date=2026-10-01').set(authHeader(personas.trainer));
      expect(bad.body.code).toBe('DATE_MISMATCH');
    });

    it('keeps past sessions reachable after the class moves to another weekday (review regression)', async () => {
      await api().put('/api/classes/cls_str_wed').set(authHeader(personas.admin)).send({ day_of_week: 4 });
      const past = await api().get('/api/bookings/class/cls_str_wed/roster?date=2026-09-30').set(authHeader(personas.trainer));
      expect(past.status).toBe(200);
      expect(past.body.data.date).toBe('2026-09-30');
      expect(past.body.data.attendees).toHaveLength(2);
      // Today's Wednesday session was called off by the move: it has only cancelled bookings.
      const calledOff = await api().get('/api/bookings/class/cls_str_wed/roster?date=2026-10-07').set(authHeader(personas.trainer));
      expect(calledOff.status).toBe(400);
      expect(calledOff.body.code).toBe('DATE_MISMATCH');
      const moved = await api().get('/api/bookings/class/cls_str_wed/roster?date=2026-10-08').set(authHeader(personas.trainer));
      expect(moved.status).toBe(200);
      expect(moved.body.data.attendees).toEqual([]);
      // The old session's attendance can still be corrected, but new bookings follow the new weekday.
      const old = seededBooking('usr_member_3', 'cls_str_wed', '2026-09-30');
      expect((await api().patch(`/api/bookings/${old.id}/attendance`).set(authHeader(personas.trainer)).send({ status: 'attended' })).status).toBe(200);
      expect((await book(personas.basic, 'cls_str_wed', '2026-10-14')).body.code).toBe('DATE_MISMATCH');
    });

    it('leaves out cancelled bookings', async () => {
      await api().delete(`/api/bookings/${seededBooking('usr_member_3', 'cls_str_wed', '2026-10-07').id}`).set(authHeader(personas.basic));
      const res = await api().get('/api/bookings/class/cls_str_wed/roster').set(authHeader(personas.trainer));
      expect(res.body.data.attendees.map((a: any) => a.user_id)).toEqual(['usr_member_2']);
    });

    it('is limited to admins and the class’s own trainer (audit regression)', async () => {
      const other = await api().get('/api/bookings/class/cls_zumba_thu/roster').set(authHeader(personas.trainer));
      expect(other.status).toBe(403);
      expect(other.body.code).toBe('NOT_YOUR_CLASS');
      expect((await api().get('/api/bookings/class/cls_zumba_thu/roster').set(authHeader(personas.admin))).status).toBe(200);
      expect((await api().get('/api/bookings/class/cls_str_wed/roster').set(authHeader(personas.member))).status).toBe(403);
      expect((await api().get('/api/bookings/class/cls_str_wed/roster')).status).toBe(401);
      expect((await api().get('/api/bookings/class/cls_nope/roster').set(authHeader(personas.admin))).status).toBe(404);
    });
  });
});

describe('classes: gym-time dates between 00:00 and 05:30 IST (review regression)', () => {
  // Thursday 8 October 2026, 01:30 at the gym, while it is still Wednesday 7 October in UTC.
  const EARLY = new Date('2026-10-07T20:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EARLY);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  it('uses the gym date for the timetable', async () => {
    expect(gymToday(EARLY)).toBe('2026-10-08');
    expect(nextOccurrence(4, '08:00', EARLY)).toBe('2026-10-08');
    const res = await api().get('/api/classes');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((c: any) => [c.id, c.occurrence_date]));
    expect(byId.cls_zumba_thu).toBe('2026-10-08');
    expect(byId.cls_str_thu).toBe('2026-10-08');
    // Wednesday's classes are over in gym time, so they move to next week.
    expect(byId.cls_str_wed).toBe('2026-10-14');
    expect(byId.cls_zumba_wed).toBe('2026-10-14');
    expect(res.body.data[0].id).toBe('cls_zumba_thu');
  });

  it('accepts today’s class and counts the 14-day window from the gym date', async () => {
    const today = await book(personas.member, 'cls_zumba_thu', '2026-10-08');
    expect(today.status).toBe(201);
    // 14 days from Thursday 8 October is Thursday 22 October; a UTC "today" would stop at the 21st.
    expect((await book(personas.member, 'cls_zumba_thu', '2026-10-22')).status).toBe(201);
    expect((await book(personas.member, 'cls_zumba_thu', '2026-10-29')).body.code).toBe('TOO_FAR_AHEAD');
    // Wednesday 7 October is yesterday at the gym.
    expect((await book(personas.member, 'cls_zumba_wed', '2026-10-07')).body.code).toBe('CLASS_STARTED');

    const mine = await api().get('/api/bookings/my').set(authHeader(personas.member));
    expect(mine.body.data[0]).toMatchObject({ id: today.body.data.id, booking_date: '2026-10-08', can_cancel: true });
  });

  it('defaults the roster to today’s session', async () => {
    const res = await api().get('/api/bookings/class/cls_zumba_thu/roster').set(authHeader(personas.admin));
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2026-10-08');
  });
});
