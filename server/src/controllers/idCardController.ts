import { Response } from 'express';
import { z } from 'zod';
import db from '../db/database.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler, conflict, notFound, ok, parse } from '../lib/http.js';
import { activeCardOf, cardsByUser, currentCard, currentCardOf, generateCardNumber, normaliseCardNumber } from '../lib/idCards.js';
import { newId, toSafeUser } from '../lib/users.js';
import { IdCard, IdCardDeactivationReason, IdCardEvent, SafeUser, User, UserRole } from '../types/index.js';

const ROLES = ['member', 'trainer', 'admin'] as const satisfies readonly UserRole[];
const CARD_STATUSES = ['active', 'deactivated', 'none'] as const;
// No 'replaced': the server sets that itself when it issues a replacement card.
const REASONS = ['lost', 'stolen', 'damaged', 'returned', 'other'] as const satisfies readonly IdCardDeactivationReason[];

// Filters arrive from chips and <select>s that may say 'All'; compare case-insensitively.
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.preprocess(lower, z.enum([...CARD_STATUSES, 'all'])).default('all'),
  role: z.preprocess(lower, z.enum([...ROLES, 'all'])).default('member')
});

const noteField = z.string().trim().max(200, 'Note must be at most 200 characters.').optional();

const issueBody = z
  .object({
    replace: z.boolean('Replace must be true or false.').optional(),
    // The active card the desk saw and chose to replace (see issueIdCard).
    replaces_card_id: z.string().trim().min(1).max(100).optional(),
    note: noteField
  })
  .strict();

const deactivateBody = z
  .object({
    reason: z.enum(REASONS, 'Choose a reason: lost, stolen, damaged, returned or other.'),
    note: noteField
  })
  .strict();

const reactivateBody = z.object({ note: noteField }).strict();

type CardStatus = (typeof CARD_STATUSES)[number];
type Actor = Pick<IdCardEvent, 'by_id' | 'by_name'>;

interface IdCardRow {
  user: Pick<
    SafeUser,
    'id' | 'name' | 'email' | 'phone' | 'avatar_url' | 'role' | 'membership_tier' | 'membership_status' | 'membership_expiry' | 'created_at'
  >;
  card_status: CardStatus;
  card: IdCard | null;
  cards_issued: number;
}

function findUserOr404(id: string): User {
  const user = db.users.find(u => u.id === id);
  if (!user) throw notFound('No member with that id.', 'NOT_FOUND');
  return user;
}

function findCardOr404(id: string): IdCard {
  const card = db.id_cards.find(c => c.id === id);
  if (!card) throw notFound('No ID card with that id.', 'CARD_NOT_FOUND');
  return card;
}

// The admin's name is kept as a snapshot, so a card's history still reads right after that
// admin's account is deleted.
function actor(req: AuthenticatedRequest): Actor {
  return { by_id: req.user!.id, by_name: req.user!.name };
}

function ownerName(card: IdCard): string {
  return db.users.find(u => u.id === card.user_id)?.name ?? 'This person';
}

// A blank note is no note.
const withNote = (note: string | undefined) => (note ? { note } : {});

function deactivate(card: IdCard, reason: IdCardDeactivationReason, note: string | undefined, by: Actor, at: string): IdCard {
  return {
    ...card,
    status: 'deactivated',
    deactivated_at: at,
    deactivation_reason: reason,
    deactivation_note: note || null,
    events: [...card.events, { type: 'deactivated', at, ...by, reason, ...withNote(note) }]
  };
}

/**
 * Write changed cards back in place and add new ones at the end, so db.id_cards stays in order
 * of issue. A replacement and the card it replaces go in one write: there is never a moment
 * with two active cards.
 */
function storeCards(...cards: IdCard[]): void {
  const changed = new Map(cards.map(c => [c.id, c]));
  const known = new Set(db.id_cards.map(c => c.id));
  db.id_cards = [...db.id_cards.map(c => changed.get(c.id) ?? c), ...cards.filter(c => !known.has(c.id))];
}

// Every number starts with PFC, so searches compare what follows it: the prefix alone ('pf', 'pfc')
// would otherwise match every card holder.
const cardSerial = (code: string) => normaliseCardNumber(code).replace(/^PFC/, '');

function toRow(user: User, cards: IdCard[]): IdCardRow {
  const safe = toSafeUser(user);
  const card = currentCard(cards);
  return {
    user: {
      id: safe.id,
      name: safe.name,
      email: safe.email,
      phone: safe.phone,
      avatar_url: safe.avatar_url,
      role: safe.role,
      membership_tier: safe.membership_tier,
      membership_status: safe.membership_status,
      membership_expiry: safe.membership_expiry,
      created_at: safe.created_at
    },
    card_status: card ? card.status : 'none',
    card,
    cards_issued: cards.length
  };
}

export const getIdCards = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const { search, status, role } = parse(listQuery, req.query);
  const cards = cardsByUser();

  let people = db.users;
  if (role !== 'all') people = people.filter(u => u.role === role);
  if (search) {
    const q = search.toLowerCase();
    // Card numbers match however they are typed: 'pfc 7k2m' finds PFC-7K2M-9QXD.
    const serial = cardSerial(search);
    people = people.filter(
      u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        u.qr_code_token.toLowerCase().includes(q) ||
        (serial !== '' && (cards.get(u.id) ?? []).some(c => cardSerial(c.card_number).includes(serial)))
    );
  }

  const rows = people
    .map(u => toRow(u, cards.get(u.id) ?? []))
    .sort((a, b) => a.user.name.localeCompare(b.user.name, 'en', { sensitivity: 'accent' }) || a.user.email.localeCompare(b.user.email));

  // Counted before the status filter, so each filter chip can show how many it would list.
  const counts = {
    people: rows.length,
    active: rows.filter(r => r.card_status === 'active').length,
    deactivated: rows.filter(r => r.card_status === 'deactivated').length,
    none: rows.filter(r => r.card_status === 'none').length,
    cards_issued: rows.reduce((n, r) => n + r.cards_issued, 0)
  };

  return ok(res, { counts, rows: status === 'all' ? rows : rows.filter(r => r.card_status === status) });
});

export const issueIdCard = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const user = findUserOr404(req.params.id);
  const body = parse(issueBody, req.body);

  const active = activeCardOf(user.id);
  if (active && body.replace !== true) {
    throw conflict(
      `${user.name} already has an active ID card (${active.card_number}). Deactivate it first, or issue a replacement.`,
      'CARD_ALREADY_ACTIVE',
      { card: active }
    );
  }
  // A second Replace from a screen that has not reloaded would otherwise switch off the card that
  // was just handed over, so the card the desk chose must still be the one in use.
  if (active && body.replaces_card_id && body.replaces_card_id !== active.id) {
    throw conflict(
      `${user.name}'s active ID card is now ${active.card_number}, not the card you chose to replace. Check their cards and try again.`,
      'CARD_ALREADY_ACTIVE',
      { card: active }
    );
  }

  const at = new Date().toISOString();
  const by = actor(req);
  const cardNumber = generateCardNumber();
  const replaced = active ? deactivate(active, 'replaced', `Replaced by ${cardNumber}`, by, at) : null;
  const card: IdCard = {
    id: newId('card'),
    user_id: user.id,
    card_number: cardNumber,
    status: 'active',
    issued_at: at,
    issued_by_id: by.by_id,
    issued_by_name: by.by_name,
    deactivated_at: null,
    deactivation_reason: null,
    deactivation_note: null,
    replaces_card_id: replaced?.id ?? null,
    events: [{ type: 'issued', at, ...by, ...withNote(body.note) }]
  };
  storeCards(...(replaced ? [replaced] : []), card);

  const message = replaced
    ? `ID card ${card.card_number} issued to ${user.name}. The old card ${replaced.card_number} no longer works.`
    : `ID card ${card.card_number} issued to ${user.name}.`;
  return ok(res, { card, replaced }, message, 201);
});

export const deactivateIdCard = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const card = findCardOr404(req.params.cardId);
  const body = parse(deactivateBody, req.body);
  if (card.status === 'deactivated') {
    throw conflict(`Card ${card.card_number} is already deactivated.`, 'CARD_ALREADY_DEACTIVATED', { card });
  }

  const updated = deactivate(card, body.reason, body.note, actor(req), new Date().toISOString());
  storeCards(updated);
  return ok(res, { card: updated }, `Card ${card.card_number} is deactivated and no longer works at check-in.`);
});

export const reactivateIdCard = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const card = findCardOr404(req.params.cardId);
  const body = parse(reactivateBody, req.body);
  if (card.status === 'active') {
    throw conflict(`Card ${card.card_number} is already active.`, 'CARD_ALREADY_ACTIVE', { card });
  }
  // One active card per person: an old card cannot come back while its replacement works.
  const other = activeCardOf(card.user_id);
  if (other) {
    throw conflict(
      `${ownerName(card)} already has an active card (${other.card_number}). Deactivate it first.`,
      'ANOTHER_CARD_ACTIVE',
      { card: other }
    );
  }

  const updated: IdCard = {
    ...card,
    status: 'active',
    deactivated_at: null,
    deactivation_reason: null,
    deactivation_note: null,
    events: [...card.events, { type: 'reactivated', at: new Date().toISOString(), ...actor(req), ...withNote(body.note) }]
  };
  storeCards(updated);
  return ok(res, { card: updated }, `Card ${card.card_number} works again.`);
});

export const getMyIdCard = asyncHandler<AuthenticatedRequest>((req, res: Response) => {
  const card = currentCardOf(req.user!.id);
  // The holder sees their card, not the desk's side of it: no history, notes or staff names.
  return ok(res, {
    card: card && {
      id: card.id,
      card_number: card.card_number,
      status: card.status,
      issued_at: card.issued_at,
      deactivated_at: card.deactivated_at,
      deactivation_reason: card.deactivation_reason
    }
  });
});
