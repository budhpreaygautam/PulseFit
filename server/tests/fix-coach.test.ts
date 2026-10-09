import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, authHeader, db, personas, resetDb } from './helpers.js';
import { addDays } from '../src/lib/dates.js';
import { Booking } from '../src/types/index.js';

// Regression tests for the coach portal fixes: recent sessions, the 30-day attendance window and
// the one "my clients" rule.

// Wednesday 7 October 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00Z');
const TODAY = '2026-10-07';
const VIKRAM_CLASSES = ['cls_str_mon', 'cls_str_wed', 'cls_str_fri', 'cls_str_sat'];

function booking(id: string, classId: string, userId: string, date: string, status: Booking['status']): Booking {
  return { id, class_id: classId, user_id: userId, booking_date: date, status, created_at: NOW.toISOString() };
}

interface RecentSession {
  class_id: string;
  class_title: string;
  date: string;
  start_time: string;
  starts_at: string;
  booked: number;
  unmarked: number;
}

async function recentSessions(email: string = personas.trainer, query = ''): Promise<RecentSession[]> {
  const res = await api().get(`/api/trainer/me${query}`).set(authHeader(email));
  expect(res.status).toBe(200);
  return res.body.data.recent_sessions;
}

describe('coach portal fixes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => vi.useRealTimers());

  describe('GET /trainer/me recent_sessions', () => {
    it('lists every started session of the last 14 days, newest first, not only last week’s', async () => {
      const sessions = await recentSessions();
      expect(sessions.length).toBeGreaterThan(0);
      const since = addDays(TODAY, -13);
      for (const s of sessions) {
        expect(VIKRAM_CLASSES).toContain(s.class_id);
        expect(s.date >= since && s.date <= TODAY).toBe(true);
        expect(Date.parse(s.starts_at)).toBeLessThanOrEqual(NOW.getTime());
        const live = db.bookings.filter(b => b.class_id === s.class_id && b.booking_date === s.date && b.status !== 'cancelled');
        expect(s.booked).toBe(live.length);
        expect(s.unmarked).toBe(live.filter(b => b.status === 'confirmed').length);
      }
      const starts = sessions.map(s => s.starts_at);
      expect([...starts].sort().reverse()).toEqual(starts);

      // Every booked, started session in the window is there, including ones from the week before last.
      const expected = new Set(
        db.bookings
          .filter(b => VIKRAM_CLASSES.includes(b.class_id) && b.status !== 'cancelled' && b.booking_date >= since && b.booking_date < TODAY)
          .map(b => `${b.class_id}|${b.booking_date}`)
      );
      expect(new Set(sessions.map(s => `${s.class_id}|${s.date}`))).toEqual(expected);
      expect(sessions.some(s => s.date < addDays(TODAY, -7))).toBe(true);
      // Today's 18:30 class has not started, so it is still under upcoming.
      expect(sessions.some(s => s.date === TODAY)).toBe(false);
    });

    it('keeps 14 days exactly and leaves out sessions nobody booked', async () => {
      db.bookings = [
        ...db.bookings.filter(b => !VIKRAM_CLASSES.includes(b.class_id)),
        booking('bk_t13', 'cls_str_fri', 'usr_member_3', addDays(TODAY, -12), 'attended'), // Fri 25 Sep: day 13
        // Thu 24 Sep, day 14 itself: no class of Vikram's runs on Thursdays now, so this is a session
        // held before cls_str_fri moved. It must be listed; a 13-day window would drop it.
        booking('bk_d14', 'cls_str_fri', 'usr_member_3', addDays(TODAY, -13), 'confirmed'),
        booking('bk_t14', 'cls_str_wed', 'usr_member_3', addDays(TODAY, -14), 'confirmed'), // Wed 23 Sep: day 15
        booking('bk_cxl', 'cls_str_mon', 'usr_member_3', addDays(TODAY, -2), 'cancelled')
      ];
      const sessions = await recentSessions();
      expect(sessions.map(s => `${s.class_id}|${s.date}`)).toEqual(['cls_str_fri|2026-09-25', 'cls_str_fri|2026-09-24']);
    });

    it('counts a no-show as booked and an unmarked booking as unmarked', async () => {
      const date = addDays(TODAY, -2); // Monday 5 October
      db.bookings = [
        ...db.bookings.filter(b => !(b.class_id === 'cls_str_mon' && b.booking_date === date)),
        booking('bk_a', 'cls_str_mon', 'usr_member_3', date, 'attended'),
        booking('bk_b', 'cls_str_mon', 'usr_member_2', date, 'no_show'),
        booking('bk_c', 'cls_str_mon', 'usr_member_1', date, 'confirmed')
      ];
      const monday = (await recentSessions()).find(s => s.class_id === 'cls_str_mon' && s.date === date)!;
      expect(monday).toMatchObject({ class_title: 'Barbell Strength & Hypertrophy', start_time: '18:00', booked: 3, unmarked: 1 });
    });

    it('lets the coach take attendance for an older session listed there', async () => {
      const date = addDays(TODAY, -12); // Friday 25 September, the week before last
      db.bookings = [
        ...db.bookings.filter(b => !(b.class_id === 'cls_str_fri' && b.booking_date === date)),
        booking('bk_old', 'cls_str_fri', 'usr_member_3', date, 'confirmed')
      ];
      const before = (await recentSessions()).find(s => s.date === date)!;
      expect(before.unmarked).toBe(1);

      const roster = await api().get(`/api/bookings/class/cls_str_fri/roster?date=${date}`).set(authHeader(personas.trainer));
      expect(roster.body.data.attendees.map((a: any) => a.booking_id)).toEqual(['bk_old']);
      const marked = await api().patch('/api/bookings/bk_old/attendance').set(authHeader(personas.trainer)).send({ status: 'attended' });
      expect(marked.status).toBe(200);
      expect((await recentSessions()).find(s => s.date === date)).toMatchObject({ booked: 1, unmarked: 0 });
    });

    it('lists a session held before its class moved to another weekday', async () => {
      const tuesday = addDays(TODAY, -8); // Tuesday 29 September: cls_str_mon runs on Mondays now
      db.bookings = [...db.bookings, booking('bk_moved', 'cls_str_mon', 'usr_member_3', tuesday, 'confirmed')];
      expect((await recentSessions()).find(s => s.date === tuesday)).toMatchObject({ class_id: 'cls_str_mon', booked: 1, unmarked: 1 });
    });

    it('gives an admin the recent sessions of a coach who has no login', async () => {
      expect(db.trainers.find(t => t.id === 'trn_kavya')!.user_id).toBeUndefined();
      const sessions = await recentSessions(personas.admin, '?trainer_id=trn_kavya');
      const kavyaClasses = db.classes.filter(c => c.trainer_id === 'trn_kavya').map(c => c.id);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every(s => kavyaClasses.includes(s.class_id))).toBe(true);

      // ...and the admin can mark attendance for one of them.
      const s = sessions[0];
      const roster = await api().get(`/api/bookings/class/${s.class_id}/roster?date=${s.date}`).set(authHeader(personas.admin));
      const first = roster.body.data.attendees[0];
      const res = await api().patch(`/api/bookings/${first.booking_id}/attendance`).set(authHeader(personas.admin)).send({ status: 'no_show' });
      expect(res.status).toBe(200);
    });
  });

  describe('attendance_rate_30d', () => {
    it('covers today and the 29 days before it, not 31 days', async () => {
      db.bookings = [
        ...db.bookings.filter(b => !VIKRAM_CLASSES.includes(b.class_id)),
        booking('bk_day30', 'cls_str_fri', 'usr_member_3', addDays(TODAY, -29), 'attended'), // inside: day 30
        booking('bk_day31', 'cls_str_wed', 'usr_member_3', addDays(TODAY, -30), 'no_show') // outside: day 31
      ];
      const res = await api().get('/api/trainer/me').set(authHeader(personas.trainer));
      expect(res.body.data.stats.attendance_rate_30d).toBe(100);
    });
  });

  describe('one rule for "my clients"', () => {
    const note = { category: 'general', note: 'Checked in about training goals.', visible_to_member: false };

    it('drops a member whose bookings were all cancelled from the list and the note picker alike', async () => {
      // Rohan has notes from Coach Vikram; cancel every booking he holds in Vikram's classes.
      expect(db.trainer_notes.some(n => n.member_id === 'usr_member_3')).toBe(true);
      db.bookings = db.bookings.map(b =>
        b.user_id === 'usr_member_3' && VIKRAM_CLASSES.includes(b.class_id) ? { ...b, status: 'cancelled' } : b
      );

      const clients = await api().get('/api/trainer/clients').set(authHeader(personas.trainer));
      const ids = clients.body.data.map((c: any) => c.user_id);
      expect(ids).toEqual(['usr_member_2']);
      const me = await api().get('/api/trainer/me').set(authHeader(personas.trainer));
      expect(me.body.data.stats.clients_count).toBe(ids.length);

      const refused = await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, member_id: 'usr_member_3' });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('NOT_YOUR_CLIENT');

      // His earlier notes stay readable and still say who they are about.
      const notes = await api().get('/api/trainer/notes?member_id=usr_member_3').set(authHeader(personas.trainer));
      expect(notes.body.data).toHaveLength(3);
      expect(notes.body.data.every((n: any) => n.member_name === 'Rohan Mehra')).toBe(true);
    });

    it('lets the coach write a note for every client in the list, including one who did not show', async () => {
      // Aarav's only booking in Vikram's classes was a no-show: he still booked, so he is a client.
      db.bookings = [...db.bookings, booking('bk_ns', 'cls_str_mon', 'usr_member_1', addDays(TODAY, -2), 'no_show')];
      const clients = await api().get('/api/trainer/clients').set(authHeader(personas.trainer));
      const ids: string[] = clients.body.data.map((c: any) => c.user_id);
      expect(ids).toContain('usr_member_1');
      for (const id of ids) {
        const res = await api().post('/api/trainer/notes').set(authHeader(personas.trainer)).send({ ...note, member_id: id });
        expect(res.status).toBe(201);
      }
    });

    it('never lists a non-member as a client', async () => {
      // A booking by someone who has since become staff does not make them a client.
      db.users = db.users.map(u => (u.id === 'usr_member_2' ? { ...u, role: 'trainer' } : u));
      const clients = await api().get('/api/trainer/clients').set(authHeader(personas.trainer));
      expect(clients.body.data.map((c: any) => c.user_id)).not.toContain('usr_member_2');
    });
  });
});
