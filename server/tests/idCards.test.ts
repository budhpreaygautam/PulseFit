import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../src/config.js';
import { api, authHeader, db, personas, resetDb, userByEmail } from './helpers.js';
import type { DatabaseSchema } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { SEEDED_CARD_NUMBERS } from '../src/db/seed/idCards.js';
import { toGymDate } from '../src/lib/dates.js';
import {
  CARD_ALPHABET,
  cardsOf,
  currentCardOf,
  findCardByNumber,
  generateCardNumber,
  normaliseCardNumber
} from '../src/lib/idCards.js';
import { IdCard } from '../src/types/index.js';

// Wednesday 7 Oct 2026, 10:00 at the gym (IST).
const NOW = new Date('2026-10-07T04:30:00.000Z');
const TODAY = '2026-10-07';
const ENFORCE_HOURS = config.enforceOpeningHours;

const CARD_NUMBER = new RegExp(`^PFC-[${CARD_ALPHABET}]{4}-[${CARD_ALPHABET}]{4}$`);
const ADMIN = { id: 'usr_admin_1', name: 'Priya Verma' };
const MAYA = 'maya.patel@example.com';

// Seeded people without a card: Dev (expired), Kabir and Isha (pending) and the admin.
const NO_CARD = [personas.expired, 'kabir.singh@example.com', 'isha.nair@example.com', personas.admin];

const issue = (userId: string, body: object = {}, who: string = personas.admin) =>
  api().post(`/api/members/${userId}/id-cards`).set(authHeader(who)).send(body);
const deactivate = (cardId: string, body: object, who: string = personas.admin) =>
  api().post(`/api/id-cards/${cardId}/deactivate`).set(authHeader(who)).send(body);
const reactivate = (cardId: string, body: object = {}, who: string = personas.admin) =>
  api().post(`/api/id-cards/${cardId}/reactivate`).set(authHeader(who)).send(body);
const list = (query = '', who: string = personas.admin) => api().get(`/api/id-cards${query}`).set(authHeader(who));
const mine = (who: string) => api().get('/api/id-cards/mine').set(authHeader(who));
const checkIn = (code: string, who: string = personas.admin) =>
  api().post('/api/attendance/check-in').set(authHeader(who)).send({ code, method: 'manual' });

const cardByNumber = (number: string) => db.id_cards.find(c => c.card_number === number)!;
const cardsFor = (email: string) => db.id_cards.filter(c => c.user_id === userByEmail(email).id);
const activeCardsFor = (email: string) => cardsFor(email).filter(c => c.status === 'active');

function setUser(email: string, patch: Record<string, unknown>) {
  db.users = db.users.map(u => (u.email === email ? { ...u, ...patch } : u));
}

function clearTodaysLogs() {
  db.attendance_logs = db.attendance_logs.filter(l => toGymDate(l.check_in_time) !== TODAY);
}

/** Nobody may ever hold two active cards. */
function expectOneActiveCardAtMost() {
  const active = db.id_cards.filter(c => c.status === 'active').map(c => c.user_id);
  expect(new Set(active).size).toBe(active.length);
}

describe('ID cards', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    resetDb();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.enforceOpeningHours = ENFORCE_HOURS;
  });

  describe('seed', () => {
    it('gives the personas active cards, Maya a lost card and Rohan a replaced one; nobody else has a card', () => {
      for (const [email, number] of [
        [personas.member, SEEDED_CARD_NUMBERS.aarav],
        [personas.vip, SEEDED_CARD_NUMBERS.ananya],
        [personas.trainer, SEEDED_CARD_NUMBERS.vikram]
      ]) {
        const cards = cardsFor(email);
        expect(cards, email).toHaveLength(1);
        expect(cards[0]).toMatchObject({ card_number: number, status: 'active', deactivated_at: null, deactivation_reason: null });
      }

      const [lost] = cardsFor(MAYA);
      expect(cardsFor(MAYA)).toHaveLength(1);
      expect(lost).toMatchObject({ card_number: SEEDED_CARD_NUMBERS.mayaLost, status: 'deactivated', deactivation_reason: 'lost' });
      expect(lost.deactivation_note).toBeTruthy();
      expect(toGymDate(lost.deactivated_at!)).toBe('2026-10-02');
      expect(lost.events.map(e => e.type)).toEqual(['issued', 'deactivated']);

      const [newer, older] = cardsOf(userByEmail(personas.basic).id);
      expect(cardsFor(personas.basic)).toHaveLength(2);
      expect(newer).toMatchObject({ card_number: SEEDED_CARD_NUMBERS.rohan, status: 'active', replaces_card_id: older.id });
      expect(older).toMatchObject({
        card_number: SEEDED_CARD_NUMBERS.rohanReplaced,
        status: 'deactivated',
        deactivation_reason: 'replaced',
        deactivated_at: newer.issued_at
      });
      expect(older.events.at(-1)).toMatchObject({ type: 'deactivated', reason: 'replaced', note: `Replaced by ${SEEDED_CARD_NUMBERS.rohan}` });

      for (const email of NO_CARD) expect(cardsFor(email), email).toHaveLength(0);
    });

    it('uses readable, unique numbers issued by the seeded admin in the past, in order of issue', () => {
      const numbers = db.id_cards.map(c => c.card_number);
      expect(numbers.every(n => CARD_NUMBER.test(n))).toBe(true);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(new Set(db.id_cards.map(c => c.id)).size).toBe(db.id_cards.length);
      const issued = db.id_cards.map(c => c.issued_at);
      expect([...issued].sort()).toEqual(issued);
      for (const card of db.id_cards) {
        expect(card).toMatchObject({ issued_by_id: ADMIN.id, issued_by_name: ADMIN.name });
        expect(Date.parse(card.issued_at)).toBeLessThan(NOW.getTime());
        expect(card.events[0]).toMatchObject({ type: 'issued', at: card.issued_at, by_id: ADMIN.id, by_name: ADMIN.name });
        const times = card.events.map(e => e.at);
        expect([...times].sort()).toEqual(times);
        for (const e of card.events) expect(e).toMatchObject({ by_id: ADMIN.id, by_name: ADMIN.name });
        expect(db.users.some(u => u.id === card.user_id)).toBe(true);
      }
      expectOneActiveCardAtMost();
    });

    it('writes no cards for the catalogue-only start (--catalogue)', () => {
      seedDatabase({ demo: false });
      expect(db.id_cards).toEqual([]);
    });
  });

  describe('card numbers (lib/idCards)', () => {
    it('generates PFC-XXXX-XXXX from the readable alphabet, never repeating', () => {
      const numbers = Array.from({ length: 300 }, () => generateCardNumber());
      for (const n of numbers) expect(n).toMatch(CARD_NUMBER);
      expect(numbers.some(n => /[01IO]/.test(n.slice(4)))).toBe(false);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('draws again when a number is already on a card', () => {
      const bytesFor = (chars: string) => Buffer.from([...chars].map(ch => CARD_ALPHABET.indexOf(ch)));
      const taken = bytesFor(SEEDED_CARD_NUMBERS.aarav.replace(/^PFC|-/g, ''));
      vi.spyOn(crypto, 'randomBytes')
        .mockImplementationOnce(() => taken)
        .mockImplementationOnce(() => bytesFor('AAAABBBB'));
      expect(generateCardNumber()).toBe('PFC-AAAA-BBBB');
    });

    it('finds a card however the number is typed', () => {
      const aarav = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      for (const typed of ['pfc 7k2m 9qxd', 'PFC7K2M9QXD', ' pfc-7k2m-9qxd ', 'Pfc-7K2M 9qXd']) {
        expect(normaliseCardNumber(typed)).toBe('PFC7K2M9QXD');
        expect(findCardByNumber(typed)?.id, typed).toBe(aarav.id);
      }
      for (const typed of ['', '  ', '---', 'PFC-7K2M', 'PFC-7K2M-9QXDX']) expect(findCardByNumber(typed), typed).toBeUndefined();
    });

    it("picks the person's current card: the active one, else the latest issued, else none", () => {
      const rohan = userByEmail(personas.basic).id;
      expect(currentCardOf(rohan)!.card_number).toBe(SEEDED_CARD_NUMBERS.rohan);
      expect(currentCardOf(userByEmail(MAYA).id)!.card_number).toBe(SEEDED_CARD_NUMBERS.mayaLost);
      expect(currentCardOf(userByEmail(personas.expired).id)).toBeNull();

      // An older card brought back is current even though a newer one exists.
      db.id_cards = db.id_cards.map(c => {
        if (c.card_number === SEEDED_CARD_NUMBERS.rohan) return { ...c, status: 'deactivated' as const };
        if (c.card_number === SEEDED_CARD_NUMBERS.rohanReplaced) return { ...c, status: 'active' as const };
        return c;
      });
      expect(currentCardOf(rohan)!.card_number).toBe(SEEDED_CARD_NUMBERS.rohanReplaced);
    });
  });

  describe('GET /id-cards', () => {
    it('requires a token and the admin role', async () => {
      expect((await api().get('/api/id-cards')).status).toBe(401);
      expect((await list('', personas.member)).status).toBe(403);
      expect((await list('', personas.trainer)).status).toBe(403);
    });

    it('lists members by default, sorted by name ignoring case, with their current card and counts', async () => {
      setUser('isha.nair@example.com', { name: 'abhi lowercase' });
      const res = await list();
      expect(res.status).toBe(200);
      const { counts, rows } = res.body.data;
      const members = db.users.filter(u => u.role === 'member');
      expect(rows).toHaveLength(members.length);
      expect(rows.every((r: any) => r.user.role === 'member')).toBe(true);

      const names = rows.map((r: any) => r.user.name);
      expect(names.slice(0, 3)).toEqual(['Aarav Sharma', 'abhi lowercase', 'Ananya Gupta']);
      expect([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))).toEqual(names);

      expect(counts).toEqual({
        people: members.length,
        active: 3, // Aarav, Ananya, Rohan
        deactivated: 1, // Maya
        none: members.length - 4,
        cards_issued: 5
      });

      const rohan = rows.find((r: any) => r.user.email === personas.basic);
      expect(rohan).toMatchObject({ card_status: 'active', cards_issued: 2, card: { card_number: SEEDED_CARD_NUMBERS.rohan } });
      const maya = rows.find((r: any) => r.user.email === MAYA);
      expect(maya).toMatchObject({ card_status: 'deactivated', cards_issued: 1, card: { deactivation_reason: 'lost' } });
      const dev = rows.find((r: any) => r.user.email === personas.expired);
      expect(dev).toEqual({ user: expect.any(Object), card_status: 'none', card: null, cards_issued: 0 });
      // The full card, history included, is for the admin.
      expect(rohan.card.events.length).toBeGreaterThan(0);
    });

    it('sends only the person fields the page needs, with the membership status as it is today', async () => {
      setUser(personas.basic, { membership_status: 'active', membership_expiry: '2026-10-06' });
      const rows = (await list()).body.data.rows;
      for (const r of rows) {
        expect(Object.keys(r.user).sort()).toEqual(
          ['avatar_url', 'created_at', 'email', 'id', 'membership_expiry', 'membership_status', 'membership_tier', 'name', 'phone', 'role'].sort()
        );
      }
      expect(rows.find((r: any) => r.user.email === personas.basic).user.membership_status).toBe('expired');
    });

    it('filters by card status without changing the counts', async () => {
      const all = (await list()).body.data;
      for (const status of ['active', 'deactivated', 'none'] as const) {
        const res = await list(`?status=${status}`);
        expect(res.status).toBe(200);
        expect(res.body.data.counts).toEqual(all.counts);
        expect(res.body.data.rows.length).toBe(all.counts[status]);
        expect(res.body.data.rows.every((r: any) => r.card_status === status)).toBe(true);
      }
      expect((await list('?status=none')).body.data.rows.every((r: any) => r.card === null)).toBe(true);
      expect((await list('?status=Deactivated')).body.data.rows.map((r: any) => r.user.email)).toEqual([MAYA]);
      expect((await list('?status=ALL')).body.data.rows.length).toBe(all.counts.people);
    });

    it('filters by role, case-insensitively', async () => {
      const trainers = (await list('?role=trainer')).body.data;
      expect(trainers.rows.map((r: any) => r.user.email)).toEqual([personas.trainer]);
      expect(trainers.counts).toEqual({ people: 1, active: 1, deactivated: 0, none: 0, cards_issued: 1 });

      const admins = (await list('?role=Admin')).body.data;
      expect(admins.rows.map((r: any) => r.user.email)).toEqual([personas.admin]);
      expect(admins.rows[0].card_status).toBe('none');

      const everyone = (await list('?role=all')).body.data;
      expect(everyone.counts.people).toBe(db.users.length);
      expect(everyone.counts.cards_issued).toBe(db.id_cards.length);
    });

    it('searches name, email, phone, pass token and any card number of the person', async () => {
      const emails = async (search: string, extra = '') =>
        (await list(`?search=${encodeURIComponent(search)}${extra}`)).body.data.rows.map((r: any) => r.user.email);

      expect(await emails('maya')).toEqual([MAYA]);
      expect(await emails('DEV.KAPOOR@')).toEqual([personas.expired]);
      expect(await emails('98114')).toEqual([personas.basic]);
      expect(await emails('pulse-mem-ananya')).toEqual([personas.vip]);
      expect(await emails('pfc 7k2m')).toEqual([personas.member]);
      expect(await emails('7K2M9QXD')).toEqual([personas.member]);
      // Rohan's old, replaced card still finds him.
      expect(await emails(SEEDED_CARD_NUMBERS.rohanReplaced.toLowerCase())).toEqual([personas.basic]);
      expect(await emails(SEEDED_CARD_NUMBERS.vikram)).toEqual([]); // a coach, and the default is members
      expect(await emails(SEEDED_CARD_NUMBERS.vikram, '&role=all')).toEqual([personas.trainer]);
      expect(await emails('nobody-here')).toEqual([]);
      // Every number starts with PFC: the prefix alone must not list every card holder.
      expect(await emails('pf', '&role=all')).toEqual([]);
      expect(await emails('PFC-', '&role=all')).toEqual([]);

      const counts = (await list('?search=maya')).body.data.counts;
      expect(counts).toEqual({ people: 1, active: 0, deactivated: 1, none: 0, cards_issued: 1 });
    });

    it('rejects an unknown filter value', async () => {
      for (const q of ['?status=lost', '?role=coach', `?search=${'x'.repeat(101)}`]) {
        const res = await list(q);
        expect(res.status, q).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('GET /members/:id', () => {
    it("includes the person's cards, newest first", async () => {
      const rohan = userByEmail(personas.basic);
      const res = await api().get(`/api/members/${rohan.id}`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(res.body.data.id_cards.map((c: IdCard) => c.card_number)).toEqual([SEEDED_CARD_NUMBERS.rohan, SEEDED_CARD_NUMBERS.rohanReplaced]);
      expect(res.body.data.id_cards[0].events).toBeDefined();

      const dev = await api().get(`/api/members/${userByEmail(personas.expired).id}`).set(authHeader(personas.admin));
      expect(dev.body.data.id_cards).toEqual([]);
    });

    it('lists the later of two cards issued in the same instant first', async () => {
      // The clock is frozen, so both cards carry the same issued_at: only the order of issue can tell them apart.
      const dev = userByEmail(personas.expired);
      const first = (await issue(dev.id)).body.data.card;
      const second = (await issue(dev.id, { replace: true })).body.data.card;
      expect(first.issued_at).toBe(second.issued_at);

      const detail = await api().get(`/api/members/${dev.id}`).set(authHeader(personas.admin));
      expect(detail.body.data.id_cards.map((c: IdCard) => c.id)).toEqual([second.id, first.id]);
      expect(cardsOf(dev.id).map(c => c.id)).toEqual([second.id, first.id]);
      // With neither working, the current card is the later one.
      await deactivate(second.id, { reason: 'lost' });
      expect(currentCardOf(dev.id)?.id).toBe(second.id);
    });
  });

  describe('POST /members/:id/id-cards', () => {
    it('issues an active card to someone without one', async () => {
      const dev = userByEmail(personas.expired);
      const before = db.id_cards.length;
      const res = await issue(dev.id);
      expect(res.status).toBe(201);
      const { card, replaced } = res.body.data;
      expect(replaced).toBeNull();
      expect(card.card_number).toMatch(CARD_NUMBER);
      expect(card).toEqual({
        id: expect.stringMatching(/^card_/),
        user_id: dev.id,
        card_number: card.card_number,
        status: 'active',
        issued_at: NOW.toISOString(),
        issued_by_id: ADMIN.id,
        issued_by_name: ADMIN.name,
        deactivated_at: null,
        deactivation_reason: null,
        deactivation_note: null,
        replaces_card_id: null,
        events: [{ type: 'issued', at: NOW.toISOString(), by_id: ADMIN.id, by_name: ADMIN.name }]
      });
      expect(res.body.message).toBe(`ID card ${card.card_number} issued to Dev Kapoor.`);
      expect(db.id_cards).toHaveLength(before + 1);
      expect(db.id_cards.at(-1)).toEqual(card);
      expect(db.id_cards.map(c => c.card_number).filter(n => n === card.card_number)).toHaveLength(1);
    });

    it('issues cards to staff too', async () => {
      const res = await issue(userByEmail(personas.admin).id);
      expect(res.status).toBe(201);
      expect(res.body.message).toBe(`ID card ${res.body.data.card.card_number} issued to Priya Verma.`);
    });

    it('keeps a trimmed note on the issued event, and drops a blank one', async () => {
      const withNote = await issue(userByEmail(personas.expired).id, { note: '  Paid the card fee in cash.  ' });
      expect(withNote.body.data.card.events[0].note).toBe('Paid the card fee in cash.');

      const blank = await issue(userByEmail('kabir.singh@example.com').id, { note: '   ' });
      expect(blank.status).toBe(201);
      expect('note' in blank.body.data.card.events[0]).toBe(false);
    });

    it('409s with CARD_ALREADY_ACTIVE when the person has an active card and replace is not true', async () => {
      const aarav = userByEmail(personas.member);
      const before = structuredClone(db.id_cards);
      for (const body of [{}, { replace: false }, { note: 'again' }]) {
        const res = await issue(aarav.id, body);
        expect(res.status, JSON.stringify(body)).toBe(409);
        expect(res.body.code).toBe('CARD_ALREADY_ACTIVE');
        expect(res.body.error).toBe(
          `Aarav Sharma already has an active ID card (${SEEDED_CARD_NUMBERS.aarav}). Deactivate it first, or issue a replacement.`
        );
        expect(res.body.data.card).toMatchObject({ card_number: SEEDED_CARD_NUMBERS.aarav, status: 'active' });
      }
      expect(db.id_cards).toEqual(before);
    });

    it('replaces an active card: the old one is deactivated as replaced and the new one points back to it', async () => {
      const aarav = userByEmail(personas.member);
      const old = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      const res = await issue(aarav.id, { replace: true, note: 'Card snapped in half.' });
      expect(res.status).toBe(201);
      const { card, replaced } = res.body.data;
      expect(card).toMatchObject({ status: 'active', replaces_card_id: old.id });
      expect(card.events).toEqual([{ type: 'issued', at: NOW.toISOString(), by_id: ADMIN.id, by_name: ADMIN.name, note: 'Card snapped in half.' }]);
      expect(replaced).toMatchObject({
        id: old.id,
        card_number: SEEDED_CARD_NUMBERS.aarav,
        status: 'deactivated',
        deactivated_at: NOW.toISOString(),
        deactivation_reason: 'replaced',
        deactivation_note: `Replaced by ${card.card_number}`
      });
      expect(replaced.events).toEqual([
        ...old.events,
        { type: 'deactivated', at: NOW.toISOString(), by_id: ADMIN.id, by_name: ADMIN.name, reason: 'replaced', note: `Replaced by ${card.card_number}` }
      ]);
      expect(res.body.message).toBe(
        `ID card ${card.card_number} issued to Aarav Sharma. The old card ${SEEDED_CARD_NUMBERS.aarav} no longer works.`
      );
      expect(cardByNumber(SEEDED_CARD_NUMBERS.aarav)).toEqual(replaced);
      expect(activeCardsFor(personas.member).map(c => c.id)).toEqual([card.id]);
      expectOneActiveCardAtMost();
    });

    it('409s a replace aimed at a card that is no longer the active one, so a stale screen cannot switch off the new card', async () => {
      const aarav = userByEmail(personas.member);
      const old = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      const first = await issue(aarav.id, { replace: true, replaces_card_id: old.id });
      expect(first.status).toBe(201);
      const handedOver = first.body.data.card;

      // A second desk, still showing the old card, replaces it again.
      const stale = await issue(aarav.id, { replace: true, replaces_card_id: old.id });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('CARD_ALREADY_ACTIVE');
      expect(stale.body.error).toBe(
        `Aarav Sharma's active ID card is now ${handedOver.card_number}, not the card you chose to replace. Check their cards and try again.`
      );
      expect(stale.body.data.card.id).toBe(handedOver.id);
      expect(activeCardsFor(personas.member).map(c => c.id)).toEqual([handedOver.id]);
      expect(cardsFor(personas.member)).toHaveLength(2);

      const bad = await issue(aarav.id, { replace: true, replaces_card_id: 5 });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
    });

    it('treats replace: true without an active card as a plain issue', async () => {
      const res = await issue(userByEmail(MAYA).id, { replace: true });
      expect(res.status).toBe(201);
      expect(res.body.data.replaced).toBeNull();
      expect(res.body.data.card.replaces_card_id).toBeNull();
      expect(res.body.message).toBe(`ID card ${res.body.data.card.card_number} issued to Maya Patel.`);
      // The lost card stays as it was.
      expect(cardByNumber(SEEDED_CARD_NUMBERS.mayaLost).status).toBe('deactivated');
    });

    it('404s for an unknown person', async () => {
      const res = await issue('usr_nope');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.error).toBe('No member with that id.');
    });

    it('validates the body', async () => {
      const dev = userByEmail(personas.expired).id;
      for (const body of [{ replace: 'yes' }, { replace: 1 }, { note: 42 }, { note: 'x'.repeat(201) }, { card_number: 'PFC-AAAA-AAAA' }]) {
        const res = await issue(dev, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      expect(cardsFor(personas.expired)).toHaveLength(0);
      expect((await issue(dev, { note: 'x'.repeat(200) })).status).toBe(201);
    });

    it('is admin only', async () => {
      const dev = userByEmail(personas.expired).id;
      expect((await api().post(`/api/members/${dev}/id-cards`).send({})).status).toBe(401);
      expect((await issue(dev, {}, personas.member)).status).toBe(403);
      expect((await issue(dev, {}, personas.trainer)).status).toBe(403);
      expect(cardsFor(personas.expired)).toHaveLength(0);
    });

    it("keeps the issuing admin's name after that admin is deleted", async () => {
      const created = await api()
        .post('/api/members')
        .set(authHeader(personas.admin))
        .send({ name: 'Desk Admin', email: 'desk.admin@example.com', role: 'admin' });
      const deskAdmin = created.body.data.member;
      const res = await issue(userByEmail(personas.expired).id, {}, 'desk.admin@example.com');
      expect(res.body.data.card).toMatchObject({ issued_by_id: deskAdmin.id, issued_by_name: 'Desk Admin' });

      expect((await api().delete(`/api/members/${deskAdmin.id}`).set(authHeader(personas.admin))).status).toBe(200);
      const card = cardsFor(personas.expired)[0];
      expect(card).toMatchObject({ issued_by_name: 'Desk Admin' });
      expect(card.events[0].by_name).toBe('Desk Admin');
    });
  });

  describe('POST /id-cards/:cardId/deactivate', () => {
    it('deactivates an active card with a reason and note', async () => {
      const card = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      const res = await deactivate(card.id, { reason: 'lost', note: '  Lost at the pool.  ' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(`Card ${SEEDED_CARD_NUMBERS.aarav} is deactivated and no longer works at check-in.`);
      const expected = {
        ...card,
        status: 'deactivated',
        deactivated_at: NOW.toISOString(),
        deactivation_reason: 'lost',
        deactivation_note: 'Lost at the pool.',
        events: [...card.events, { type: 'deactivated', at: NOW.toISOString(), by_id: ADMIN.id, by_name: ADMIN.name, reason: 'lost', note: 'Lost at the pool.' }]
      };
      expect(res.body.data.card).toEqual(expected);
      expect(cardByNumber(SEEDED_CARD_NUMBERS.aarav)).toEqual(expected);
    });

    it('accepts every reason the desk can choose, with no note', async () => {
      const card = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      for (const reason of ['lost', 'stolen', 'damaged', 'returned', 'other']) {
        const res = await deactivate(card.id, { reason });
        expect(res.status, reason).toBe(200);
        expect(res.body.data.card).toMatchObject({ deactivation_reason: reason, deactivation_note: null });
        expect('note' in res.body.data.card.events.at(-1)).toBe(false);
        expect((await reactivate(card.id)).status).toBe(200);
      }
    });

    it("rejects 'replaced' and other bad bodies without touching the card", async () => {
      const card = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      for (const body of [{}, { reason: 'replaced' }, { reason: 'LOST' }, { reason: 'misplaced' }, { reason: 'lost', note: 'x'.repeat(201) }, { reason: 'lost', extra: 1 }]) {
        const res = await deactivate(card.id, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      expect(cardByNumber(SEEDED_CARD_NUMBERS.aarav)).toEqual(card);
      expect((await deactivate(card.id, { reason: 'lost', note: 'x'.repeat(200) })).status).toBe(200);
    });

    it('409s with CARD_ALREADY_DEACTIVATED for a deactivated card', async () => {
      const lost = cardByNumber(SEEDED_CARD_NUMBERS.mayaLost);
      const res = await deactivate(lost.id, { reason: 'stolen' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CARD_ALREADY_DEACTIVATED');
      expect(cardByNumber(SEEDED_CARD_NUMBERS.mayaLost)).toEqual(lost);
    });

    it('404s with CARD_NOT_FOUND for an unknown card', async () => {
      const res = await deactivate('card_nope', { reason: 'lost' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CARD_NOT_FOUND');
    });

    it('is admin only', async () => {
      const card = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      expect((await api().post(`/api/id-cards/${card.id}/deactivate`).send({ reason: 'lost' })).status).toBe(401);
      expect((await deactivate(card.id, { reason: 'lost' }, personas.member)).status).toBe(403);
      expect((await deactivate(card.id, { reason: 'lost' }, personas.trainer)).status).toBe(403);
      expect(cardByNumber(SEEDED_CARD_NUMBERS.aarav).status).toBe('active');
    });
  });

  describe('POST /id-cards/:cardId/reactivate', () => {
    it('brings a deactivated card back and keeps its history', async () => {
      const lost = cardByNumber(SEEDED_CARD_NUMBERS.mayaLost);
      const res = await reactivate(lost.id, { note: 'Found in the locker room.' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(`Card ${SEEDED_CARD_NUMBERS.mayaLost} works again.`);
      const expected = {
        ...lost,
        status: 'active',
        deactivated_at: null,
        deactivation_reason: null,
        deactivation_note: null,
        events: [...lost.events, { type: 'reactivated', at: NOW.toISOString(), by_id: ADMIN.id, by_name: ADMIN.name, note: 'Found in the locker room.' }]
      };
      expect(res.body.data.card).toEqual(expected);
      expect(cardByNumber(SEEDED_CARD_NUMBERS.mayaLost)).toEqual(expected);
      expect(res.body.data.card.events.map((e: { type: string }) => e.type)).toEqual(['issued', 'deactivated', 'reactivated']);
    });

    it('409s with CARD_ALREADY_ACTIVE for an active card', async () => {
      const res = await reactivate(cardByNumber(SEEDED_CARD_NUMBERS.aarav).id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CARD_ALREADY_ACTIVE');
    });

    it('409s with ANOTHER_CARD_ACTIVE while the person has another active card', async () => {
      const old = cardByNumber(SEEDED_CARD_NUMBERS.rohanReplaced);
      const res = await reactivate(old.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ANOTHER_CARD_ACTIVE');
      expect(res.body.error).toBe(`Rohan Mehra already has an active card (${SEEDED_CARD_NUMBERS.rohan}). Deactivate it first.`);
      expect(res.body.data.card.card_number).toBe(SEEDED_CARD_NUMBERS.rohan);
      expect(cardByNumber(SEEDED_CARD_NUMBERS.rohanReplaced)).toEqual(old);

      // Once the newer card is off, the old one may come back.
      expect((await deactivate(cardByNumber(SEEDED_CARD_NUMBERS.rohan).id, { reason: 'returned' })).status).toBe(200);
      expect((await reactivate(old.id)).status).toBe(200);
      expect(activeCardsFor(personas.basic).map(c => c.card_number)).toEqual([SEEDED_CARD_NUMBERS.rohanReplaced]);
    });

    it('validates the body, 404s for an unknown card and is admin only', async () => {
      const lost = cardByNumber(SEEDED_CARD_NUMBERS.mayaLost);
      for (const body of [{ note: 'x'.repeat(201) }, { reason: 'lost' }, { note: false }]) {
        const res = await reactivate(lost.id, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      expect((await reactivate('card_nope')).body.code).toBe('CARD_NOT_FOUND');
      expect((await api().post(`/api/id-cards/${lost.id}/reactivate`).send({})).status).toBe(401);
      expect((await reactivate(lost.id, {}, personas.member)).status).toBe(403);
      expect((await reactivate(lost.id, {}, personas.trainer)).status).toBe(403);
      expect(cardByNumber(SEEDED_CARD_NUMBERS.mayaLost)).toEqual(lost);
    });
  });

  describe('one active card per person', () => {
    it('holds on every path: issue, replace, deactivate and reactivate', async () => {
      const dev = userByEmail(personas.expired).id;
      const first = (await issue(dev)).body.data.card as IdCard;
      expectOneActiveCardAtMost();
      expect((await issue(dev)).status).toBe(409);
      expectOneActiveCardAtMost();
      const second = (await issue(dev, { replace: true })).body.data.card as IdCard;
      expectOneActiveCardAtMost();
      expect((await reactivate(first.id)).body.code).toBe('ANOTHER_CARD_ACTIVE');
      expect((await deactivate(second.id, { reason: 'stolen' })).status).toBe(200);
      expect(activeCardsFor(personas.expired)).toHaveLength(0);
      const third = (await issue(dev)).body.data.card as IdCard;
      expect((await reactivate(first.id)).body.code).toBe('ANOTHER_CARD_ACTIVE');
      expect((await reactivate(second.id)).body.code).toBe('ANOTHER_CARD_ACTIVE');
      expectOneActiveCardAtMost();
      expect(activeCardsFor(personas.expired).map(c => c.id)).toEqual([third.id]);
      expect(cardsFor(personas.expired)).toHaveLength(3);
    });
  });

  describe('GET /id-cards/mine', () => {
    const PUBLIC_FIELDS = ['card_number', 'deactivated_at', 'deactivation_reason', 'id', 'issued_at', 'status'];

    it("returns the caller's card without history, notes or staff names", async () => {
      const res = await mine(personas.member);
      expect(res.status).toBe(200);
      const card = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      expect(res.body.data).toEqual({
        card: { id: card.id, card_number: card.card_number, status: 'active', issued_at: card.issued_at, deactivated_at: null, deactivation_reason: null }
      });
    });

    it('shows a deactivated card as it is, still without the note', async () => {
      const res = await mine(MAYA);
      expect(Object.keys(res.body.data.card).sort()).toEqual(PUBLIC_FIELDS);
      expect(res.body.data.card).toMatchObject({ card_number: SEEDED_CARD_NUMBERS.mayaLost, status: 'deactivated', deactivation_reason: 'lost' });
      expect(res.body.data.card.deactivated_at).toBe(cardByNumber(SEEDED_CARD_NUMBERS.mayaLost).deactivated_at);
      expect(JSON.stringify(res.body)).not.toContain(ADMIN.name);
      expect(JSON.stringify(res.body)).not.toContain('app pass until');
    });

    it('returns the active card over a newer deactivated one, and null for someone without a card', async () => {
      expect((await mine(personas.basic)).body.data.card.card_number).toBe(SEEDED_CARD_NUMBERS.rohan);
      expect((await mine(personas.trainer)).body.data.card.card_number).toBe(SEEDED_CARD_NUMBERS.vikram);
      expect((await mine(personas.expired)).body.data).toEqual({ card: null });

      await deactivate(cardByNumber(SEEDED_CARD_NUMBERS.rohan).id, { reason: 'damaged' });
      expect((await mine(personas.basic)).body.data.card).toMatchObject({ card_number: SEEDED_CARD_NUMBERS.rohan, status: 'deactivated' });
      await reactivate(cardByNumber(SEEDED_CARD_NUMBERS.rohanReplaced).id);
      expect((await mine(personas.basic)).body.data.card).toMatchObject({ card_number: SEEDED_CARD_NUMBERS.rohanReplaced, status: 'active' });
    });

    it("is not swallowed by the card routes: an admin gets their own card, not the list", async () => {
      const res = await mine(personas.admin);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ card: null });
      expect((await api().post('/api/id-cards/mine/deactivate').set(authHeader(personas.admin)).send({ reason: 'lost' })).body.code).toBe('CARD_NOT_FOUND');
    });

    it('needs a token', async () => {
      expect((await api().get('/api/id-cards/mine')).status).toBe(401);
    });
  });

  describe('check-in with an ID card', () => {
    beforeEach(() => clearTodaysLogs());

    it('admits an active card exactly like the pass token', async () => {
      const aarav = userByEmail(personas.member);
      const logs = db.attendance_logs.length;
      const res = await checkIn(SEEDED_CARD_NUMBERS.aarav);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        result: 'granted',
        already_checked_in: false,
        kind: 'member',
        member: { id: aarav.id, name: 'Aarav Sharma', membership_status: 'active' },
        log: { user_id: aarav.id, check_in_method: 'manual', check_in_time: NOW.toISOString() }
      });
      expect(res.body.message).toBe('Welcome to PulseFit, Aarav Sharma!');
      expect(db.attendance_logs.length).toBe(logs + 1);
      expect(userByEmail(personas.member).last_active_date).toBe(TODAY);

      // The same visit, whichever of the two they show next.
      const again = await checkIn(aarav.qr_code_token);
      expect(again.body.data).toMatchObject({ already_checked_in: true, log: { id: res.body.data.log.id } });
      expect(db.attendance_logs.length).toBe(logs + 1);
    });

    it('accepts the number however it is typed', async () => {
      const aarav = userByEmail(personas.member).id;
      for (const typed of ['pfc 7k2m 9qxd', 'PFC7K2M9QXD', ' pfc-7k2m-9qxd ']) {
        const res = await checkIn(typed);
        expect(res.status, typed).toBe(200);
        expect(res.body.data.member.id).toBe(aarav);
      }
    });

    it('still applies the membership rules, and lets staff through', async () => {
      const dev = userByEmail(personas.expired);
      const card = (await issue(dev.id)).body.data.card;
      const res = await checkIn(card.card_number);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_EXPIRED');

      setUser(personas.trainer, { membership_status: 'expired', membership_expiry: '2026-01-01' });
      expect((await checkIn(SEEDED_CARD_NUMBERS.vikram)).status).toBe(200);
    });

    it('refuses a deactivated card with 403 CARD_DEACTIVATED and records nothing', async () => {
      const maya = userByEmail(MAYA);
      const lost = cardByNumber(SEEDED_CARD_NUMBERS.mayaLost);
      const logs = db.attendance_logs.length;
      const res = await checkIn('pfc m6yb 2lju');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CARD_DEACTIVATED');
      expect(res.body.error).toBe(
        `This ID card (${SEEDED_CARD_NUMBERS.mayaLost}) belongs to Maya Patel and was deactivated on 2 Oct 2026 (lost). Ask for their app pass, or issue a new card.`
      );
      expect(res.body.data.member).toMatchObject({ id: maya.id, name: 'Maya Patel', email: MAYA });
      expect(res.body.data.card).toEqual({
        card_number: SEEDED_CARD_NUMBERS.mayaLost,
        status: 'deactivated',
        deactivated_at: lost.deactivated_at,
        deactivation_reason: 'lost'
      });
      expect(db.attendance_logs.length).toBe(logs);
      expect(userByEmail(MAYA)).toMatchObject({ streak_days: maya.streak_days, last_active_date: maya.last_active_date });

      // Her app pass still works.
      expect((await checkIn(maya.qr_code_token)).status).toBe(200);
    });

    it('stops a card the moment it is deactivated, and admits it again once reactivated', async () => {
      const card = cardByNumber(SEEDED_CARD_NUMBERS.aarav);
      await deactivate(card.id, { reason: 'stolen' });
      const refused = await checkIn(SEEDED_CARD_NUMBERS.aarav, personas.trainer);
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('CARD_DEACTIVATED');
      expect(refused.body.error).toContain('deactivated on 7 Oct 2026 (stolen)');

      await reactivate(card.id);
      expect((await checkIn(SEEDED_CARD_NUMBERS.aarav, personas.trainer)).status).toBe(200);
    });

    it('words the refusal for a replaced card, and leaves out a reason of other', async () => {
      const replaced = await checkIn(SEEDED_CARD_NUMBERS.rohanReplaced);
      expect(replaced.status).toBe(403);
      expect(replaced.body.error).toContain('(replaced by a newer card)');
      expect((await checkIn(SEEDED_CARD_NUMBERS.rohan)).status).toBe(200);

      await deactivate(cardByNumber(SEEDED_CARD_NUMBERS.ananya).id, { reason: 'other' });
      const other = await checkIn(SEEDED_CARD_NUMBERS.ananya);
      expect(other.body.error).toBe(
        `This ID card (${SEEDED_CARD_NUMBERS.ananya}) belongs to Ananya Gupta and was deactivated on 7 Oct 2026. Ask for their app pass, or issue a new card.`
      );
    });

    it('refuses a deactivated card before the opening-hours and membership checks', async () => {
      // Dev's membership has expired, but the card is what the desk needs to hear about.
      const dev = userByEmail(personas.expired);
      const card = (await issue(dev.id)).body.data.card;
      await deactivate(card.id, { reason: 'returned' });
      expect((await checkIn(card.card_number)).body.code).toBe('CARD_DEACTIVATED');

      config.enforceOpeningHours = true;
      vi.setSystemTime(new Date('2026-10-07T17:30:00.000Z')); // 23:00 IST, closed
      expect((await checkIn(SEEDED_CARD_NUMBERS.mayaLost)).body.code).toBe('CARD_DEACTIVATED');
      expect((await checkIn(SEEDED_CARD_NUMBERS.aarav)).body.code).toBe('GYM_CLOSED');
    });

    it('prefers a pass token over a card number', async () => {
      setUser(personas.vip, { qr_code_token: SEEDED_CARD_NUMBERS.mayaLost });
      const res = await checkIn(SEEDED_CARD_NUMBERS.mayaLost);
      expect(res.status).toBe(200);
      expect(res.body.data.member.email).toBe(personas.vip);
    });
  });

  describe('deleting a person', () => {
    it("removes their cards, so a deleted person's card no longer opens the turnstile", async () => {
      const rohan = userByEmail(personas.basic);
      const others = db.id_cards.filter(c => c.user_id !== rohan.id);
      const res = await api().delete(`/api/members/${rohan.id}`).set(authHeader(personas.admin));
      expect(res.status).toBe(200);
      expect(db.id_cards).toEqual(others);
      const scan = await checkIn(SEEDED_CARD_NUMBERS.rohan);
      expect(scan.status).toBe(404);
      expect(scan.body.code).toBe('PASS_NOT_FOUND');
    });
  });

  describe('loading a database written before ID cards', () => {
    it('starts with no cards and keeps everything else', async () => {
      const file = path.join(os.tmpdir(), `pulsefit-legacy-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
      const { id_cards: _none, ...legacy } = db.snapshot();
      fs.writeFileSync(file, JSON.stringify(legacy), 'utf-8');
      const previous = process.env.PULSEFIT_DB_PATH;
      process.env.PULSEFIT_DB_PATH = file;
      try {
        // A fresh module instance reads the file the way a server start does.
        vi.resetModules();
        const { db: loaded } = await import('../src/db/database.js');
        expect(loaded.filePath).toBe(path.resolve(file));
        expect(loaded.id_cards).toEqual([]);
        expect(loaded.users.map(u => u.id)).toEqual(db.users.map(u => u.id));
      } finally {
        process.env.PULSEFIT_DB_PATH = previous;
        vi.resetModules();
        fs.rmSync(file, { force: true });
      }
    });

    it('restores a snapshot without id_cards with an empty list', () => {
      const { id_cards: _none, ...legacy } = db.snapshot();
      db.restore(legacy as DatabaseSchema);
      expect(db.id_cards).toEqual([]);
    });
  });
});
