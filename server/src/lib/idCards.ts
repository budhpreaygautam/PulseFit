import crypto from 'crypto';
import db from '../db/database.js';
import { IdCard } from '../types/index.js';

// Physical ID cards. Every issued card has its own number, printed on it and encoded in its QR,
// so a lost or stolen card can be switched off at the turnstile while the member's app pass
// (users.qr_code_token) keeps working. A person has at most one active card at a time.

// No 0/O or 1/I: the number is read off a card and typed in by hand. 32 symbols divide 256
// evenly, so every symbol is equally likely.
export const CARD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A card number compared the way the front desk types it: upper case, without spaces or
 * hyphens, so 'pfc 7k2m 9qxd' and 'PFC7K2M9QXD' both find PFC-7K2M-9QXD.
 */
export function normaliseCardNumber(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

/** A new card number, unique across every card ever issued: PFC-XXXX-XXXX. */
export function generateCardNumber(): string {
  for (;;) {
    const bytes = crypto.randomBytes(8);
    let chars = '';
    for (let i = 0; i < 8; i++) chars += CARD_ALPHABET[bytes[i] % CARD_ALPHABET.length];
    const number = `PFC-${chars.slice(0, 4)}-${chars.slice(4)}`;
    if (!findCardByNumber(number)) return number;
  }
}

/** The card with this number, however it was typed; undefined when none matches. */
export function findCardByNumber(code: string): IdCard | undefined {
  const wanted = normaliseCardNumber(code);
  if (!wanted) return undefined;
  return db.id_cards.find(c => normaliseCardNumber(c.card_number) === wanted);
}

// db.id_cards is kept in order of issue. Two cards can share an issued_at (requests in the same
// millisecond, or a frozen test clock); reversing before the (stable) sort keeps the later one first.
const newestFirst = (cards: IdCard[]) => [...cards].reverse().sort((a, b) => b.issued_at.localeCompare(a.issued_at));

/** Every card issued to a person, newest first. */
export function cardsOf(userId: string): IdCard[] {
  return newestFirst(db.id_cards.filter(c => c.user_id === userId));
}

/** Every person's cards, newest first, keyed by user id. One pass for lists of many people. */
export function cardsByUser(): Map<string, IdCard[]> {
  const byUser = new Map<string, IdCard[]>();
  for (const card of db.id_cards) {
    const cards = byUser.get(card.user_id);
    if (cards) cards.push(card);
    else byUser.set(card.user_id, [card]);
  }
  for (const [userId, cards] of byUser) byUser.set(userId, newestFirst(cards));
  return byUser;
}

export function activeCardOf(userId: string): IdCard | undefined {
  return db.id_cards.find(c => c.user_id === userId && c.status === 'active');
}

/** The card a person carries, from their cards newest first: the active one, else the latest issued. */
export function currentCard(cardsNewestFirst: IdCard[]): IdCard | null {
  return cardsNewestFirst.find(c => c.status === 'active') ?? cardsNewestFirst[0] ?? null;
}

export function currentCardOf(userId: string): IdCard | null {
  return currentCard(cardsOf(userId));
}
