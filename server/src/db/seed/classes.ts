import db from '../database.js';
import { addDays, dayOfWeek, gymToday } from '../../lib/dates.js';
import { startsAt } from '../../lib/occurrences.js';
import { Booking, TrainerNote } from '../../types/index.js';

// Demo data owned by the classes domain. Called by seedDatabase() after the base data
// (users, trainers, classes, exercises, plans) has been written.
//
// Bookings are generated relative to today so the timetable, "My bookings" and the trainer
// portal always look lived-in: about three weeks of history plus the coming week.

const PAST_DAYS = 21;
const AHEAD_DAYS = 7;

// Each member only books classes their plan includes (basic: Workout & Strength,
// pro: Zumba & Cardio, vip: everything).
const REGULARS: Record<string, string[]> = {
  usr_member_1: ['cls_zumba_mon', 'cls_zumba_wed', 'cls_zumba_fri'], // Aarav, pro
  usr_member_4: ['cls_zumba_tue', 'cls_zumba_thu', 'cls_zumba_sat'], // Maya, pro
  usr_member_3: ['cls_str_mon', 'cls_str_wed', 'cls_str_thu', 'cls_str_fri'], // Rohan, basic
  usr_member_2: ['cls_str_tue', 'cls_str_sat', 'cls_zumba_fri', 'cls_str_wed'] // Ananya, vip
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function seedClasses(): void {
  const now = new Date();
  const today = gymToday(now);

  // Capacity is computed per occurrence from bookings; a stored counter would only drift.
  db.classes = db.classes.map(({ booked_count: _ignored, ...c }) => c);

  const bookings: Booking[] = [];
  let seq = 0;
  for (const [userId, classIds] of Object.entries(REGULARS)) {
    for (const classId of classIds) {
      const cls = db.classes.find(c => c.id === classId);
      if (!cls) continue;
      for (let offset = -PAST_DAYS; offset <= AHEAD_DAYS; offset++) {
        const date = addDays(today, offset);
        if (dayOfWeek(date) !== cls.day_of_week) continue;

        const start = startsAt(cls.start_time, date).getTime();
        const started = start <= now.getTime();
        seq++;
        // Roughly one missed session in five, deterministic so tests and demos are stable.
        const status: Booking['status'] = started ? (seq % 5 === 0 ? 'no_show' : 'attended') : 'confirmed';
        const trainer = db.trainers.find(t => t.id === cls.trainer_id);
        bookings.push({
          id: `bk_seed_${String(seq).padStart(3, '0')}`,
          class_id: cls.id,
          user_id: userId,
          booking_date: date,
          status,
          created_at: new Date(Math.min(start - 2 * DAY, now.getTime() - HOUR)).toISOString(),
          class_title: cls.title,
          category: cls.category,
          start_time: cls.start_time,
          room: cls.room,
          trainer_name: trainer?.name ?? cls.trainer_name
        });
      }
    }
  }
  db.bookings = bookings;

  const vikram = db.users.find(u => u.id === 'usr_trainer_1');
  if (!vikram) return;
  const note = (
    id: string,
    memberId: string,
    category: TrainerNote['category'],
    text: string,
    visible: boolean,
    daysAgo: number
  ): TrainerNote => ({
    id,
    trainer_user_id: vikram.id,
    trainer_name: vikram.name,
    member_id: memberId,
    category,
    note: text,
    visible_to_member: visible,
    created_at: new Date(now.getTime() - daysAgo * DAY).toISOString()
  });

  db.trainer_notes = [
    note('note_seed_1', 'usr_member_3', 'assessment',
      'Baseline: back squat 80 kg x 5, deadlift 100 kg x 5. Good bracing; knees cave slightly on the last reps. Goal: 100 kg squat in 10 weeks.',
      true, 20),
    note('note_seed_2', 'usr_member_3', 'progress',
      'Squat up to 90 kg x 5 with clean depth. Keep the 3-second eccentric on accessory work.',
      true, 6),
    note('note_seed_3', 'usr_member_3', 'injury',
      'Mentioned mild left-shoulder discomfort on overhead press. Swapped to landmine press; review in two weeks.',
      false, 4),
    note('note_seed_4', 'usr_member_2', 'assessment',
      'Strong aerobic base from Zumba. Hip hinge needs work: start RDLs light and film a set each session.',
      true, 15),
    note('note_seed_5', 'usr_member_2', 'general',
      'Prefers Saturday sessions; consider a progressive deadlift block from next month.',
      false, 2)
  ];
}
