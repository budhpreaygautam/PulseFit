import db from '../database.js';
import { addDays, gymDateTime, gymToday } from '../../lib/dates.js';
import { isOpenDay } from '../../lib/hours.js';
import { IdCard, IdCardDeactivationReason, IdCardEvent } from '../../types/index.js';

// Demo data owned by the ID cards domain. Called by seedDatabase() after the base data
// (users, trainers, classes, exercises, plans) has been written.
//
// The member, All-Access and coach personas carry an active card, Maya lost hers last week and
// Rohan's first card was replaced; everyone else has none yet, so the admin's ID cards page shows
// every state. The numbers are fixed (and use only the generator's alphabet) so they can be typed
// at the demo scanner. Dates are relative to today so the demo always looks current.

export const SEEDED_CARD_NUMBERS = {
  aarav: 'PFC-7K2M-9QXD',
  ananya: 'PFC-V3PA-4NGW',
  vikram: 'PFC-C8HT-5RZE',
  mayaLost: 'PFC-M6YB-2LJU',
  rohanReplaced: 'PFC-R5WD-8KFS',
  rohan: 'PFC-H9TN-3XCA'
} as const;

export function seedIdCards(): void {
  const today = gymToday();
  const admin = db.users.find(u => u.id === 'usr_admin_1');
  const by: Pick<IdCardEvent, 'by_id' | 'by_name'> = { by_id: admin?.id ?? null, by_name: admin?.name ?? 'PulseFit front desk' };

  // The card desk works on open days only, so a date that falls on a Sunday moves to Saturday.
  const at = (daysAgo: number, time: string) => {
    let date = addDays(today, -daysAgo);
    while (!isOpenDay(date)) date = addDays(date, -1);
    return gymDateTime(date, time).toISOString();
  };

  const issued = (id: string, user_id: string, card_number: string, issued_at: string, note?: string): IdCard => ({
    id,
    user_id,
    card_number,
    status: 'active',
    issued_at,
    issued_by_id: by.by_id,
    issued_by_name: by.by_name,
    deactivated_at: null,
    deactivation_reason: null,
    deactivation_note: null,
    replaces_card_id: null,
    events: [{ type: 'issued', at: issued_at, ...by, ...(note ? { note } : {}) }]
  });

  const deactivated = (card: IdCard, reason: IdCardDeactivationReason, when: string, note: string): IdCard => ({
    ...card,
    status: 'deactivated',
    deactivated_at: when,
    deactivation_reason: reason,
    deactivation_note: note,
    events: [...card.events, { type: 'deactivated', at: when, ...by, reason, note }]
  });

  // Rohan's first card cracked; the replacement was issued in the same moment the old one stopped working.
  const replacedAt = at(12, '06:50');
  const rohanFirst = deactivated(
    issued('card_seed_rohan_1', 'usr_member_3', SEEDED_CARD_NUMBERS.rohanReplaced, at(150, '07:05')),
    'replaced',
    replacedAt,
    `Replaced by ${SEEDED_CARD_NUMBERS.rohan}`
  );
  const rohanNow: IdCard = {
    ...issued('card_seed_rohan_2', 'usr_member_3', SEEDED_CARD_NUMBERS.rohan, replacedAt, 'The first card cracked.'),
    replaces_card_id: rohanFirst.id
  };

  const cards: IdCard[] = [
    rohanFirst,
    issued('card_seed_vikram', 'usr_trainer_1', SEEDED_CARD_NUMBERS.vikram, at(90, '09:30'), 'Staff card.'),
    deactivated(
      issued('card_seed_maya', 'usr_member_4', SEEDED_CARD_NUMBERS.mayaLost, at(75, '07:10')),
      'lost',
      at(5, '07:40'),
      'Lost on the way home. She checks in with her app pass until a new card is printed.'
    ),
    issued('card_seed_ananya', 'usr_member_2', SEEDED_CARD_NUMBERS.ananya, at(52, '19:05')),
    issued('card_seed_aarav', 'usr_member_1', SEEDED_CARD_NUMBERS.aarav, at(40, '18:20')),
    rohanNow
  ];

  // Kept in order of issue, as the API keeps them.
  const people = new Set(db.users.map(u => u.id));
  db.id_cards = cards.filter(c => people.has(c.user_id)).sort((a, b) => a.issued_at.localeCompare(b.issued_at));
}
