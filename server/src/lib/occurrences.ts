import db from '../db/database.js';
import { addDays, gymDateTime, nextOccurrence } from './dates.js';
import { Booking, BookingStatus, GymClass, Trainer } from '../types/index.js';

// Classes are weekly templates; everything a member books or a trainer runs is an
// occurrence (class + gym-local date). Capacity is counted per occurrence from bookings.

/** How far ahead a member may book, in days from today. */
export const BOOKING_WINDOW_DAYS = 14;
/** Trainers may take attendance from this many minutes before the class starts. */
export const ATTENDANCE_OPENS_MINUTES = 15;

const HOLDS_SPOT: BookingStatus[] = ['confirmed', 'attended'];

export interface ClassOccurrence extends Omit<GymClass, 'booked_count'> {
  occurrence_date: string;
  starts_at: string;
  booked_count: number;
  spots_left: number;
  is_full: boolean;
  my_booking_id: string | null;
}

export function holdsSpot(booking: Pick<Booking, 'status'>): boolean {
  return HOLDS_SPOT.includes(booking.status);
}

export function bookedCount(classId: string, date: string, bookings: Booking[] = db.bookings): number {
  return bookings.filter(b => b.class_id === classId && b.booking_date === date && holdsSpot(b)).length;
}

export function startsAt(startTime: string, date: string): Date {
  return gymDateTime(date, startTime);
}

export function hasStarted(startTime: string, date: string, now: Date = new Date()): boolean {
  return startsAt(startTime, date).getTime() <= now.getTime();
}

/** A class as it leaves the API: no stored counter, trainer fields from the current trainer record. */
export function presentClass(cls: GymClass, trainers: Trainer[] = db.trainers): GymClass {
  const { booked_count: _ignored, ...rest } = cls;
  const trainer = trainers.find(t => t.id === cls.trainer_id);
  return {
    ...rest,
    trainer_name: trainer ? trainer.name : cls.trainer_name,
    trainer_avatar: trainer ? trainer.avatar_url : cls.trainer_avatar
  };
}

export function toOccurrence(cls: GymClass, date: string, viewerId?: string): ClassOccurrence {
  const booked = bookedCount(cls.id, date);
  const mine = viewerId
    ? db.bookings.find(b => b.class_id === cls.id && b.booking_date === date && b.user_id === viewerId && b.status !== 'cancelled')
    : undefined;
  return {
    ...presentClass(cls),
    occurrence_date: date,
    starts_at: startsAt(cls.start_time, date).toISOString(),
    booked_count: booked,
    spots_left: Math.max(0, cls.capacity - booked),
    is_full: booked >= cls.capacity,
    my_booking_id: mine ? mine.id : null
  };
}

/** The next occurrence of a class that has not started yet. */
export function nextOccurrenceOf(cls: Pick<GymClass, 'day_of_week' | 'start_time'>, now: Date = new Date()): string {
  return nextOccurrence(cls.day_of_week, cls.start_time, now);
}

/** Date of a class's occurrence in the week that starts on the given Monday. */
export function occurrenceInWeek(cls: Pick<GymClass, 'day_of_week'>, monday: string): string {
  return addDays(monday, (cls.day_of_week + 6) % 7);
}

export function byStart(a: { starts_at: string }, b: { starts_at: string }): number {
  return a.starts_at.localeCompare(b.starts_at);
}

/** The trainer record linked to a user account, if any. */
export function trainerOfUser(userId: string): Trainer | undefined {
  return db.trainers.find(t => t.user_id === userId);
}
